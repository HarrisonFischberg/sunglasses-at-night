// Sunglasses at Night: dynamic engine (T007).
// Rewrites the colors a page declares, instead of filtering pixels:
//   - CSSOM: every style rule in every readable sheet (incl. @import,
//     @media/@supports/@layer/@container blocks and nested rules) gets an
//     override rule with the same selector and transformed colors, in one
//     sheet placed after all page sheets. Overrides keep source order and
//     specificity, and keyword values (inherit, currentcolor…) are copied
//     verbatim, so the page's own cascade still decides which color wins.
//   - Custom properties: a color-valued `--x` also defines `--san-bg--x`,
//     `--san-fg--x` and `--san-border--x`; overrides read `var(--x)` through
//     the variant for their role and fall back to the original.
//   - Inline styles and presentational attributes (bgcolor, <font color>)
//     get rules keyed by a data attribute. Those rules are `!important`,
//     which beats a normal inline declaration without touching the element's
//     own style attribute.
//   - Text whose final color still misses 4.5:1 on its effective background
//     gets a per-color fix rule (ensureContrast moves lightness only).
//   - A MutationObserver per scope handles added/changed nodes, sheets and
//     attributes; a 1 s poll catches CSSOM edits (insertRule) and late
//     custom-element shadow roots, which no mutation reports.
//   - Open shadow roots are scopes of their own. Cross-origin sheets the
//     CSSOM can't read are re-fetched through `fetchSheet` (the background
//     script) and parsed in a detached document.
//
// The engine only ever adds <style> elements, and data attributes its own
// rules select on. It never sets pointer-events, never adds an overlay or any
// other element, and never writes layout properties. DOM and fetching are
// injected so tests can drive it.
//
// Known limits: closed shadow roots are unreachable from a content script;
// adopted sheets are overridden with `!important` copies because adopted
// sheets cascade after every <style> we could add.

import { parseColor, formatRgb, composite, contrastRatio, srgbToOklch, relativeLuminance } from './color.js';
import { createSelectorIndex } from './selector-index.js';
import { transformColor, ensureContrast, quantize, normalizeLook, MIN_CONTRAST } from './transform.js';
import { dynamicImageCss } from './filter.js';
import { isBlendOverlay, OVERLAY_DECLS, lightOrClear } from './blend-fix.js';

export const MARK = 'data-sunglasses-at-night';
export const INLINE_ATTR = 'data-san-inline';
export const FIX_ATTR = 'data-san-fix';
export const VAR_PREFIX = '--san-';
export const BLEND_MARK = '--san-blend';
// Set on the root of a subtree the page inserted after load, in the mutation
// callback (before paint), until its sheets and contrast are processed (T031).
export const PENDING_ATTR = 'data-sunglasses-pending';

const ROLES = ['bg', 'fg', 'border'];

// Longhand color properties and the role their colors are mapped with.
export const PROP_ROLES = Object.freeze({
  'background-color': 'bg',
  'background-image': 'bg',
  color: 'fg',
  'caret-color': 'fg',
  'text-decoration-color': 'fg',
  'text-emphasis-color': 'fg',
  '-webkit-text-fill-color': 'fg',
  '-webkit-text-stroke-color': 'fg',
  'column-rule-color': 'border',
  'outline-color': 'border',
  'border-top-color': 'border',
  'border-right-color': 'border',
  'border-bottom-color': 'border',
  'border-left-color': 'border',
  'border-block-start-color': 'border',
  'border-block-end-color': 'border',
  'border-inline-start-color': 'border',
  'border-inline-end-color': 'border',
  fill: 'fg',
  stroke: 'fg',
});

// Shorthands whose longhands read as '' while a var() is pending substitution.
const SHORTHAND_ROLES = Object.freeze({
  background: 'bg',
  border: 'border',
  'border-color': 'border',
  'border-top': 'border',
  'border-right': 'border',
  'border-bottom': 'border',
  'border-left': 'border',
  'border-block': 'border',
  'border-inline': 'border',
  outline: 'border',
  'text-decoration': 'fg',
});

const KEEP_KEYWORDS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'currentcolor', 'transparent', 'none', 'auto', '',
]);
const COLOR_FUNCS = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'light-dark',
]);
const OPAQUE_FUNCS = new Set(['url', 'image-set', '-webkit-image-set', 'attr', 'env', 'element']);
// Blend modes that turn a photo near-black once the backdrop under it is dark.
let blendMarked = false;
// Set once any declaration we read carries a url()/image-set() background. Until
// then no non-media element can be a photo layer, so overImage skips the style
// reads that look for one (T039).
let urlImagesSeen = false;
const BLEND_FIX_RE = /^(?:multiply|darken|color-burn|luminosity)$/i;
const MEDIA_TAGS = 'img,picture,video,canvas,svg,iframe,embed,object';
const MEDIA_TAG_SET = new Set(MEDIA_TAGS.split(','));
const PHOTO_MIN_W = 120, PHOTO_MIN_H = 80;
// A promo card's solid backdrop as WE drew it: clearly tinted, neither dark nor
// light (OKLCH). Measured on the dark-mode color, whose chroma is tempered and
// gamut-clipped (authored #d9822b orange is drawn rgb(71 36 0), C 0.07).
const SATURATED_C = 0.05, SATURATED_L_MIN = 0.15, SATURATED_L_MAX = 0.85;
// Authored text on a saturated card we leave as drawn stands unless it is nearly
// illegible against the backdrop we drew (white on mid orange is ~3:1 and is
// what pages ship, so the floor sits at 2:1).
const LARGE_TEXT_CONTRAST = 2;
const URL_IMAGE_RE =/(?:^|[^\w-])(?:url|image-set|-webkit-image-set)\(/i;

// ------------------------------------------------------------ value rewrite

const roleVar = (role, name) => `${VAR_PREFIX}${role}${name}`;

function mapColor(c, role, look) {
  if ((c.alpha ?? 1) === 0) return null;
  return formatRgb(quantize(transformColor(c, role, look)));
}

// Index of the ')' closing the '(' at `open`, skipping strings; -1 if none.
function closeParen(s, open) {
  let depth = 0, quote = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

// Split at top-level commas.
function splitTop(s) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}(?![\w-])/;
const IDENT_RE = /^-?[A-Za-z_][\w-]*/;

// Rewrite every color token in `value` (any CSS value) for `role`.
function rewriteTokens(value, role, look) {
  let out = '', i = 0;
  const n = value.length;
  while (i < n) {
    const ch = value[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && value[j] !== ch) j += value[j] === '\\' ? 2 : 1;
      out += value.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const rest = value.slice(i);
    if (ch === '#') {
      const m = HEX_RE.exec(rest);
      if (m) {
        const c = parseColor(m[0]);
        out += (c && mapColor(c, role, look)) ?? m[0];
        i += m[0].length;
        continue;
      }
    }
    const id = i === 0 || !/[\w-]/.test(value[i - 1]) ? IDENT_RE.exec(rest) : null;
    if (id) {
      const word = id[0], lower = word.toLowerCase(), end = i + word.length;
      if (value[end] === '(') {
        const close = closeParen(value, end);
        if (close < 0) return value; // unbalanced: leave the whole value alone
        const whole = value.slice(i, close + 1), body = value.slice(end + 1, close);
        if (OPAQUE_FUNCS.has(lower)) {
          out += whole;
        } else if (lower === 'var') {
          out += rewriteVar(body, role, look);
        } else {
          const c = COLOR_FUNCS.has(lower) ? parseColor(whole) : null;
          out += c ? (mapColor(c, role, look) ?? whole) : `${word}(${rewriteTokens(body, role, look)})`;
        }
        i = close + 1;
        continue;
      }
      const c = KEEP_KEYWORDS.has(lower) ? null : parseColor(lower);
      out += (c && mapColor(c, role, look)) ?? word;
      i = end;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Dawn-family themes (Shopify) keep colors as bare channel lists:
// `--color-background: 255,255,255` painted with `rgb(var(--color-background))`.
const TRIPLET_RE = /^(\d{1,3}(?:\.\d+)?)(\s*,\s*|\s+)(\d{1,3}(?:\.\d+)?)\2(\d{1,3}(?:\.\d+)?)(?:\s*([,/])\s*(\d*\.?\d+%?))?$/;

/**
 * A custom property value that is a channel list (`r,g,b`, `r g b`, with an
 * optional alpha) → the same list transformed for `role`, in the same format.
 * null when the value isn't one.
 */
export function rewriteTriplet(value, role, look) {
  const m = TRIPLET_RE.exec(value.trim());
  if (!m) return null;
  const [r, g, b] = [m[1], m[3], m[4]].map(Number);
  if (r > 255 || g > 255 || b > 255) return null;
  let alpha = 1;
  if (m[6] !== undefined) alpha = m[6].endsWith('%') ? parseFloat(m[6]) / 100 : parseFloat(m[6]);
  const c = { r: r / 255, g: g / 255, b: b / 255, alpha };
  if (alpha === 0 || alpha > 1) return null;
  const t = quantize(transformColor(c, role, look));
  const ch = [t.r, t.g, t.b].map((v) => Math.round(v * 255));
  const sep = m[2].includes(',') ? ',' : ' ';
  let out = ch.join(sep);
  if (m[6] !== undefined) out += `${m[5] === '/' ? ' / ' : ','}${Math.round(t.alpha * 1000) / 1000}`;
  return out;
}

// var(--x[, fallback]) → var(--san-<role>--x, var(--x[, fallback']))
function rewriteVar(body, role, look) {
  const parts = splitTop(body);
  const name = parts[0].trim();
  if (!name.startsWith('--') || name.startsWith(VAR_PREFIX)) return `var(${body})`;
  const fallback = parts.length > 1 ? parts.slice(1).join(',') : null;
  const inner = fallback === null ? `var(${name})` : `var(${name},${rewriteTokens(fallback, role, look)})`;
  return `var(${roleVar(role, name)}, ${inner})`;
}

// rewriteValue runs once per declaration, so the last look's key is kept.
let lastLook = null, lastLookKey = null;
function lookKey(look) {
  if (lastLookKey !== null && look === lastLook) return lastLookKey;
  const n = normalizeLook(look);
  lastLook = look;
  lastLookKey = `${n.brightness},${n.contrast},${n.sepia},${n.grayscale}`;
  return lastLookKey;
}

const IMAGE_FUNC_RE = /(?:^|[^\w-])(?:url|image-set|-webkit-image-set|image|cross-fade|-webkit-cross-fade|element)\(/i;

/**
 * A background-image value without its image layers (gradients stay), for
 * "hide background images". 'none' when nothing is left; the value itself
 * when it has no image layer.
 */
export function withoutImages(value) {
  if (!IMAGE_FUNC_RE.test(value)) return value;
  const kept = splitTop(value).map((p) => p.trim()).filter((p) => /gradient\(/i.test(p) && !IMAGE_FUNC_RE.test(p));
  return kept.length ? kept.join(', ') : 'none';
}

const valueCache = new Map();

/**
 * Rewrite one declared value for `role`. Returns the new value, or null when
 * there is nothing to change (keywords, transparent, images, unknown tokens).
 */
export function rewriteValue(value, role, look) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (KEEP_KEYWORDS.has(v.toLowerCase())) return null;
  const key = `${role}|${lookKey(look)}|${v}`;
  if (valueCache.has(key)) return valueCache.get(key);
  const c = parseColor(v);
  let out = c ? mapColor(c, role, look) : rewriteTokens(v, role, look);
  if (out === v) out = null;
  if (valueCache.size > 20000) valueCache.clear();
  valueCache.set(key, out);
  return out;
}

// ----------------------------------------------------- declaration rewrite

/**
 * Rewrite a CSSStyleDeclaration-like object (length, item(i) or [i],
 * getPropertyValue, getPropertyPriority) into override declarations.
 * opts.important forces `!important` on every declaration; opts.hideImages
 * drops image layers from background-image (see withoutImages).
 * Returns an array of `prop:value[ !important]` strings.
 */
export function rewriteDeclarations(style, look, opts = {}) {
  const out = [];
  const seen = new Set();
  const len = style?.length ?? 0;
  const bangFor = (prop) =>
    opts.important || style.getPropertyPriority(prop) === 'important' ? ' !important' : '';
  // A shorthand set with var() leaves its color longhands reading as ''.
  // Serializing every shorthand of every rule is costly, so only look when
  // such an empty longhand showed up.
  let pendingVar = false;
  // A light tint that blends (multiply/darken) over a photo, declared in this
  // very rule: give it a transparent background here, in the sheet. The
  // element pass (fixBlendOverlays) can't reach ::before/::after tints, and a
  // darkened opaque tint with normal blending hides the photo (Amazon Fresh).
  const blendTint = len > 0 && BLEND_FIX_RE.test((style.getPropertyValue('mix-blend-mode') || '').trim()) &&
    !/url\(|gradient\(/i.test(style.getPropertyValue('background-image') || '') &&
    !/var\(/i.test(style.getPropertyValue('background-color') || '') &&
    lightOrClear(style.getPropertyValue('background-color') || 'transparent');
  for (let i = 0; i < len; i++) {
    const prop = style.item ? style.item(i) : style[i];
    if (!prop || seen.has(prop)) continue;
    seen.add(prop);
    const value = style.getPropertyValue(prop);
    if (blendTint && prop === 'background-color') {
      out.push(`background-color:transparent${bangFor(prop)}`);
      continue;
    }
    if (!value && PROP_ROLES[prop]) pendingVar = true;
    if (!urlImagesSeen && (prop === 'background-image' || prop === 'background') && URL_IMAGE_RE.test(value)) urlImagesSeen = true;
    if (prop.startsWith('--')) {
      if (prop.startsWith(VAR_PREFIX)) continue;
      for (const role of ROLES) {
        // A channel list is no color: transform it per role. The using
        // declaration reads the variant for its own property's role (rewriteVar),
        // so a variable used as both background and text splits by itself.
        const v = rewriteTriplet(value, role, look) ?? rewriteValue(value, role, look);
        if (v !== null) out.push(`${roleVar(role, prop)}:${v}${bangFor(prop)}`);
      }
      continue;
    }
    if (prop === 'mix-blend-mode') {
      // Product shots drawn with multiply over a light tile: once the tile is
      // dark, multiply makes the photo black. Normal shows the photo as is.
      // The marker lets the blend-overlay pass (T032) find the element after
      // this rule has already made its computed blend mode normal.
      if (BLEND_FIX_RE.test(value.trim())) {
        blendMarked = true;
        out.push(`mix-blend-mode:normal${bangFor(prop)}`, `${BLEND_MARK}:1${bangFor(prop)}`);
      }
      continue;
    }
    if (prop === 'color-scheme') {
      if (/\blight\b/.test(value) && !/\bdark\b/.test(value)) out.push(`color-scheme:dark${bangFor(prop)}`);
      continue;
    }
    const role = PROP_ROLES[prop];
    if (!role || !value) continue;
    if (prop === 'background-image') {
      const shown = opts.hideImages ? withoutImages(value) : value;
      if (shown === value && !/gradient\(|var\(/i.test(value)) continue;
      out.push(`${prop}:${rewriteValue(shown, role, look) ?? shown}${bangFor(prop)}`);
      continue;
    }
    const v = rewriteValue(value, role, look);
    // Keyword values are copied verbatim, so an override for an earlier page
    // rule can't beat a later page rule that resets the color.
    out.push(`${prop}:${v ?? value}${bangFor(prop)}`);
  }
  if (!pendingVar) return out;
  for (const [sh, role] of Object.entries(SHORTHAND_ROLES)) {
    const value = style.getPropertyValue?.(sh);
    if (!value || !value.includes('var(')) continue;
    const v = rewriteValue(value, role, look);
    if (v !== null) out.push(`${sh}:${v}${bangFor(sh)}`);
  }
  return out;
}

// ------------------------------------------------------------ rule rewrite

function propertyRuleDeclarations(rule, look) {
  const value = (rule.initialValue ?? '').trim();
  if (!value || rule.name.startsWith(VAR_PREFIX)) return [];
  const out = [];
  for (const role of ROLES) {
    const v = rewriteTriplet(value, role, look) ?? rewriteValue(value, role, look);
    if (v !== null) out.push(`${roleVar(role, rule.name)}:${v}`);
  }
  return out;
}

const STYLE_RULE = 1, IMPORT_RULE = 3, PAGE_RULE = 6, KEYFRAMES_RULE = 7, KEYFRAME_RULE = 8;

/**
 * Override CSS for a list of rules. `onImport(rule)` returns the override
 * CSS for an @import's sheet (or ''). opts.important: see rewriteDeclarations.
 * opts.isDead(selectorText): true for a style rule to leave out (selector-index.js).
 */
export function rewriteRules(rules, look, onImport = () => '', opts = {}) {
  let css = '';
  const len = rules?.length ?? 0;
  for (let i = 0; i < len; i++) {
    const rule = rules[i];
    if (!rule) continue;
    const type = rule.type;
    if (type === IMPORT_RULE) {
      const inner = onImport(rule);
      const media = rule.media?.mediaText;
      css += inner && media && media !== 'all' ? `@media ${media}{${inner}}` : inner;
      continue;
    }
    if (type === PAGE_RULE || type === KEYFRAMES_RULE || type === KEYFRAME_RULE) continue;
    if (typeof rule.name === 'string' && rule.name.startsWith('--') && 'initialValue' in rule) {
      // @property --x { initial-value: #000 }: a palette can live only in
      // registered initial values, with no rule declaring --x at all (Epic
      // MyChart, 2026-10-20: input text stayed black on our dark fields).
      // The variants go on the root at zero specificity, so any real
      // declaration of --x, and its own override, still wins.
      const decls = propertyRuleDeclarations(rule, look);
      if (decls.length) css += `:where(:root){${decls.join(';')}}`;
      continue;
    }
    const nested = rule.cssRules ? rewriteRules(rule.cssRules, look, onImport, opts) : '';
    if (type === STYLE_RULE) {
      // A selector that can't match yet adds a rule the browser must index on
      // every recalc: leave it out until the page grows what it needs.
      if (nested === '' && !rule.cssRules?.length && opts.isDead?.(rule.selectorText)) continue;
      const decls = rewriteDeclarations(rule.style, look, opts);
      if (decls.length || nested) css += `${rule.selectorText}{${decls.join(';')}${decls.length && nested ? ';' : ''}${nested}}`;
      continue;
    }
    if (rule.style && rule.selectorText === undefined && !rule.cssRules) {
      // CSSNestedDeclarations: bare declarations inside a nested style rule.
      const decls = rewriteDeclarations(rule.style, look, opts);
      if (decls.length) css += `${decls.join(';')};`;
      continue;
    }
    if (rule.cssRules && nested) {
      // @media, @supports, @layer, @container, @scope, @starting-style …
      const text = rule.cssText ?? '';
      const brace = text.indexOf('{');
      if (brace > 0) css += `${text.slice(0, brace).trim()}{${nested}}`;
    }
  }
  return css;
}

/** Base CSS: page canvas, default text and UA link colors at zero specificity. */
export function baseCss(look) {
  const bg = quantize(transformColor('#ffffff', 'bg', look));
  const f = (hex) => formatRgb(ensureContrast(transformColor(hex, 'fg', look), bg));
  return (
    `:where(:root){color-scheme:dark;background-color:${formatRgb(bg)};color:${f('#000000')}}` +
    `:where(a:link){color:${f('#0000ee')}}:where(a:visited){color:${f('#551a8b')}}`
  );
}

/**
 * Rules for content the page inserted after load, keyed by PENDING_ATTR: until
 * the engine has rewritten what the subtree needs, its backgrounds are
 * transparent (the dark canvas shows through) and its text is the base text
 * color. Media keeps its pixels; an img's own placeholder color is cleared.
 */
export function pendingCss(look) {
  const bg = quantize(transformColor('#ffffff', 'bg', look));
  const fg = formatRgb(ensureContrast(transformColor('#000000', 'fg', look), bg));
  const a = `[${PENDING_ATTR}]`;
  return (
    `${a},${a} *:not(${MEDIA_TAGS}){background-color:transparent!important;color:${fg}!important}` +
    `${a} img,img${a}{background-color:transparent!important}`
  );
}

// ------------------------------------------------------------- the engine

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const POLL_MS = 1000;
const MAX_IMPORT_DEPTH = 4;
const ATTR_FILTER = ['style', 'bgcolor', 'background', 'color', 'text', 'class', 'id', 'media', 'disabled', 'rel', 'href'];
const SHEET_ATTRS = new Set(['media', 'disabled', 'rel', 'href']);

// Scheduling (T013). Mutation callbacks do only the cheap, flash-preventing
// work (inline styles, new sheets, shadow roots, frames). Contrast checks,
// which need computed styles, are collected and run later in slices of at
// most SLICE_MS, at most every CONTRAST_DELAY_MS while the page keeps
// mutating. Each slice reads every computed style first and writes after, so
// it forces one style recalc instead of one per fixed element.
export const SLICE_MS = 6;
export const CONTRAST_DELAY_MS = 100;
// Longest the engine waits for page sheets to load before calling itself ready.
export const READY_CAP_MS = 2500;
// How long after start pending shadow hosts are checked every frame (watchHosts).
export const HOST_WATCH_MS = 10000;
const YIELD = Symbol('yield');

/**
 * Start the dynamic engine on `document`.
 * opts.look: slider values. opts.fetchSheet(url) → Promise<string|null>
 * returns the text of a stylesheet the CSSOM can't read (cross-origin).
 * opts.images: image mode (settings.IMAGE_MODES); opts.hideBackgroundImages
 * drops url()/image-set() background layers, keeping gradients.
 * opts.prune (default true), test-only: false keeps the override rules of
 * selectors that match nothing, as the engine did before T024.
 * opts.monitor(name, start, ms), test-only: called after each main-thread
 * task the engine runs (the perf harness sums them).
 * opts.onReady(), called once, in the task the override sheet first covers every
 * page sheet (cross-origin re-fetches applied, <link> sheets loaded), or after
 * READY_CAP_MS. Until then contrast checks wait, because the caller's interim
 * rule is still changing what they would read.
 * opts.onBusy(), called when the page adds a stylesheet after onReady that the
 * override sheet doesn't cover yet (in the mutation task, before paint), so the
 * caller can re-arm its interim rule; onReady() is called again, in the task
 * the rewrite lands (or after READY_CAP_MS).
 * Returns { stop(), refresh(), settle(), setSiteCss(css) }; settle() resolves
 * once every cross-origin fetch started so far has been applied and all
 * deferred work is done; setSiteCss() keeps a per-site fix sheet after the
 * override sheet ('' removes it).
 */
export function startDynamic({
  document, window = document.defaultView, look, fetchSheet = async () => null,
  images = 'leave', hideBackgroundImages = false, monitor = null, onReady = null, onBusy = null, prune = true,
}) {
  // Classes, ids and tags the page has had (document and open shadow roots).
  // A rule whose selector needs one that never appeared is left out of the
  // override sheet; `sink` collects what a sheet's cached CSS left out, so the
  // cache is dropped when one of those selectors may match again.
  let pruneRevived = false;
  const selectors = createSelectorIndex(() => { pruneRevived = true; });
  let sink = null;
  const isDead = (sel) => {
    if (!selectors.isDead(sel)) return false;
    sink?.push(sel);
    return true;
  };
  const stillDead = (list) => list.every((sel) => selectors.isDead(sel));
  const forward = (list) => {
    if (sink) for (const sel of list) sink.push(sel);
  };
  const base = { ...(hideBackgroundImages ? { hideImages: true } : {}), ...(prune ? { isDead } : {}) };
  const win = window;
  const getCS = (el) => win.getComputedStyle(el);
  const now = () => win.performance?.now?.() ?? Date.now();
  const timed = (name, fn) => (...args) => {
    if (!monitor) return fn(...args);
    const t0 = now();
    try {
      return fn(...args);
    } finally {
      monitor(name, t0, now() - t0);
    }
  };
  const scopes = new Map(); // Document | ShadowRoot → scope
  const sheetCache = new WeakMap(); // CSSStyleSheet → { sig, css, pruned }
  const remote = new Map(); // absolute URL → { done, parsed, css, pruned }
  const pending = new Set();
  const pendingHosts = new Set();
  const touched = new Set(); // elements carrying our attributes or inline writes
  const inlineOriginals = new WeakMap(); // element → Map(prop → { value, written })
  const frames = new Map(); // about:blank / srcdoc <iframe> → { doc, engine, start }
  const canvas = quantize(transformColor('#ffffff', 'bg', look));
  let stopped = false;
  let siteEl = null; // per-site fix sheet, see setSiteCss
  let incomplete = false; // set while a needed remote sheet is still loading
  // Deferred work: see SLICE_MS.
  const contrastRoots = new Set(); // nodes whose subtree needs a contrast check
  let contrastAll = false; // the whole document does
  let pass = null; // { items, i }: the contrast pass in progress
  let syncWanted = false; // sheets changed (link load, remote sheet arrived)
  let timerId = null, timerAt = Infinity;
  let readyDone = !onReady, readyTimer = null;
  let announced = !onReady; // the caller was last told 'ready' (not 'busy')
  const pendingTags = new Map(); // element tagged PENDING_ATTR → when
  const keptColor = new Map(); // text over a photo → the authored color we restored

  function sheetsSettled() {
    if (pending.size || syncWanted) return false;
    for (const link of document.querySelectorAll('link[rel~="stylesheet" i]')) {
      if (!link.sheet && !link.disabled) return false;
    }
    return true;
  }

  function checkReady(force = false) {
    if (announced || stopped) return;
    if (!force && !sheetsSettled()) return;
    announced = true;
    win.clearTimeout(readyTimer);
    const first = !readyDone;
    readyDone = true;
    onReady();
    if (first) wantContrastAll();
  }

  // A sheet the override doesn't cover yet: the caller's interim rule comes
  // back until the rewrite lands, so the page's own colors never paint.
  function markBusy() {
    if (!announced || !onBusy || stopped || sheetsSettled()) return;
    announced = false;
    onBusy();
    win.clearTimeout(readyTimer);
    readyTimer = win.setTimeout(() => checkReady(true), READY_CAP_MS);
  }

  const isOurs = (node) => node?.nodeType === 1 && node.hasAttribute(MARK);

  function makeStyle(role) {
    const el = document.createElementNS(HTML_NS, 'style');
    el.setAttribute(MARK, role);
    return el;
  }

  // ---- scopes and our sheets
  function ensureScope(root) {
    let scope = scopes.get(root);
    if (scope) return scope;
    scope = {
      root, css: '', overrideEl: makeStyle('override'), dynEl: makeStyle('dynamic'),
      dynRules: [], inlineIds: new Map(), fixIds: new Map(), observer: null, baseEl: null,
    };
    scopes.set(root, scope);
    if (root.nodeType === 9) {
      scope.baseEl = makeStyle('base');
      scope.baseEl.textContent = baseCss(look) + dynamicImageCss(images) + pendingCss(look);
      const head = root.head ?? root.documentElement;
      head.insertBefore(scope.baseEl, head.firstChild);
    }
    placeLast(scope);
    scope.observer = new win.MutationObserver(timed('mutations', (records) => onMutations(scope, records)));
    scope.observer.observe(root, {
      childList: true, subtree: true, attributes: true, attributeFilter: ATTR_FILTER,
    });
    return scope;
  }

  // Keep [override, dynamic] (then the document's site-fix sheet, when
  // there is one) as the last children of the scope, after every page sheet.
  // Moving a <style> re-creates its sheet from text, so rules added with
  // insertRule are restored from scope.dynRules.
  function placeLast(scope) {
    const parent = scope.root.nodeType === 9 ? scope.root.documentElement : scope.root;
    if (!parent) return;
    const { overrideEl: o, dynEl: d } = scope;
    const f = scope.root.nodeType === 9 ? siteEl : null;
    const last = f ?? d;
    if (parent.lastChild === last && (!f || f.previousSibling === d) && d.previousSibling === o) return;
    parent.appendChild(o);
    parent.appendChild(d);
    d.textContent = scope.dynRules.join('\n');
    if (f) parent.appendChild(f);
  }

  // Per-site fix CSS (site-fixes.js): kept after the override sheet so its
  // rules win over the rewrite of the same selectors. '' removes it.
  function setSiteCss(css) {
    if (stopped) return;
    if (!css) { siteEl?.remove(); siteEl = null; return; }
    siteEl ??= makeStyle('site-fix');
    siteEl.textContent = css;
    const scope = scopes.get(document);
    if (scope) placeLast(scope);
  }

  function addRule(scope, rule) {
    scope.dynRules.push(rule);
    const sheet = scope.dynEl.sheet;
    // No sheet: the page's CSP refused it, and the adopted-sheet mirror
    // (adopted.js) follows the element's text instead.
    if (!sheet && scope.dynEl.isConnected) { scope.dynEl.textContent = scope.dynRules.join('\n'); return; }
    try {
      if (sheet) sheet.insertRule(rule, sheet.cssRules.length);
    } catch {
      scope.dynRules.pop(); // not valid in this browser
    }
  }

  // ---- sheets
  function signature(sheet, depth = 0) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      return null; // cross-origin
    }
    let sig = `${rules.length}`;
    if (depth < MAX_IMPORT_DEPTH) {
      for (let i = 0; i < rules.length && rules[i].type === IMPORT_RULE; i++) {
        const s = rules[i].styleSheet;
        sig += `[${s ? signature(s, depth + 1) : '-'}]`;
      }
    }
    return sig;
  }

  function withMedia(css, media) {
    return css && media && media !== 'all' ? `@media ${media}{${css}}` : css;
  }

  function remoteCss(href, baseUrl, depth) {
    if (!href || depth > MAX_IMPORT_DEPTH) return '';
    let url;
    try {
      url = new URL(href, baseUrl ?? document.baseURI).href;
    } catch {
      return '';
    }
    let entry = remote.get(url);
    if (!entry) {
      entry = { done: false, parsed: null, css: null, pruned: [] };
      remote.set(url, entry);
      const p = Promise.resolve()
        .then(() => fetchSheet(url))
        .then((text) => { if (typeof text === 'string') entry.parsed = parseDetached(text); })
        .catch(() => {})
        .finally(() => {
          entry.done = true;
          pending.delete(p);
          // Sheets arriving together are rewritten in the next slices, not here.
          requestSync();
        });
      pending.add(p);
    }
    if (!entry.done) {
      incomplete = true;
      return '';
    }
    if (!entry.parsed) return '';
    if (entry.css === null || !stillDead(entry.pruned)) {
      const outer = incomplete, outerSink = sink;
      incomplete = false;
      sink = [];
      // `base` is the engine's rewrite options (hide background images, pruning).
      const css = rewriteRules(entry.parsed.rules, look, (r) => remoteCss(r.href, url, depth + 1), base);
      const pruned = sink;
      sink = outerSink;
      forward(pruned);
      if (!incomplete) {
        entry.css = css;
        entry.pruned = pruned;
      }
      incomplete = outer || incomplete;
      return css;
    }
    forward(entry.pruned);
    return entry.css;
  }

  // Parse fetched CSS in a document of its own so nothing applies to the page.
  function parseDetached(text) {
    const doc = document.implementation.createHTMLDocument('');
    const style = doc.createElement('style');
    style.textContent = text;
    doc.head.appendChild(style);
    const rules = style.sheet?.cssRules;
    return rules ? { rules, doc } : null;
  }

  function importCss(rule, depth, opts) {
    let sheet = null;
    try {
      sheet = rule.styleSheet;
    } catch {
      sheet = null;
    }
    if (sheet && signature(sheet) !== null) {
      return depth < MAX_IMPORT_DEPTH
        ? rewriteRules(sheet.cssRules, look, (r) => importCss(r, depth + 1, opts), opts)
        : '';
    }
    return remoteCss(rule.href, rule.parentStyleSheet?.href, depth + 1);
  }

  function sheetCss(sheet, opts) {
    if (sheet.disabled) return '';
    const sig = signature(sheet);
    const media = sheet.media?.mediaText;
    if (sig === null) return withMedia(remoteCss(sheet.href, undefined, 0), media);
    const cached = sheetCache.get(sheet);
    if (cached && cached.sig === sig && stillDead(cached.pruned)) return cached.css;
    const outer = incomplete, outerSink = sink;
    incomplete = false;
    sink = [];
    const css = withMedia(rewriteRules(sheet.cssRules, look, (r) => importCss(r, 0, opts), opts), media);
    const pruned = sink;
    sink = outerSink;
    if (!incomplete) sheetCache.set(sheet, { sig, css, pruned });
    incomplete = outer || incomplete;
    return css;
  }

  // Returns whether our override changed, or YIELD when `deadline` passed
  // before every sheet was rewritten (rewrites done so far stay cached, so
  // the next call picks up where this one stopped).
  function syncSheets(scope, deadline = Infinity) {
    let css = '';
    for (const sheet of scope.root.styleSheets ?? []) {
      if (isOurs(sheet.ownerNode)) continue;
      if (now() > deadline) return YIELD;
      css += sheetCss(sheet, base);
    }
    for (const sheet of scope.root.adoptedStyleSheets ?? []) {
      if (now() > deadline) return YIELD;
      css += sheetCss(sheet, { ...base, important: true });
    }
    const changed = css !== scope.css;
    if (changed) {
      scope.css = css;
      scope.overrideEl.textContent = css;
    }
    placeLast(scope);
    return changed;
  }

  // ---- inline styles and presentational attributes
  function scopeOf(el) {
    const root = el.getRootNode?.() ?? document;
    return scopes.get(root) ?? ensureScope(root.nodeType === 11 ? root : document);
  }

  function ruleFor(scope, map, attr, decls) {
    const key = decls.join(';');
    let id = map.get(key);
    if (id === undefined) {
      id = String(map.size + 1);
      map.set(key, id);
      addRule(scope, `[${attr}="${id}"]{${key}}`);
    }
    return id;
  }

  function presentational(el) {
    const decls = [];
    const bgc = el.getAttribute('bgcolor');
    const tag = el.localName;
    const fc = tag === 'font' ? el.getAttribute('color') : tag === 'body' ? el.getAttribute('text') : null;
    for (const [value, prop, role] of [[bgc, 'background-color', 'bg'], [fc, 'color', 'fg']]) {
      if (!value) continue;
      const c = parseColor(/^[0-9a-f]{6}$/i.test(value) ? '#' + value : value);
      const v = c && mapColor(c, role, look);
      if (v) decls.push(`${prop}:${v} !important`);
    }
    if (el.hasAttribute('background')) urlImagesSeen = true;
    if (hideBackgroundImages && el.hasAttribute('background')) decls.push('background-image:none !important');
    return decls;
  }

  // An inline `!important` declaration beats every sheet, so those are the
  // one case written into the element's style attribute. The page's value is
  // kept to restore on stop(), and to recognize our own write when the
  // resulting attribute mutation comes back.
  function setInlineImportant(el, prop, value) {
    let own = inlineOriginals.get(el);
    if (!own) inlineOriginals.set(el, (own = new Map()));
    const current = el.style.getPropertyValue(prop);
    const prior = own.get(prop);
    const original = prior && prior.written === current ? prior.value : current;
    el.style.setProperty(prop, value, 'important');
    own.set(prop, { value: original, written: el.style.getPropertyValue(prop) });
    touched.add(el);
  }

  // The page's own value for an inline property (ours replaced, if we wrote it).
  function pageInlineValue(el, prop) {
    const current = el.style.getPropertyValue(prop);
    const prior = inlineOriginals.get(el)?.get(prop);
    return prior && prior.written === current ? prior.value : current;
  }

  function inlineView(el) {
    const style = el.style, normal = [];
    for (let i = 0; i < style.length; i++) {
      const prop = style.item(i);
      if (style.getPropertyPriority(prop) !== 'important' || prop.startsWith('--')) {
        normal.push(prop);
        continue;
      }
      const role = PROP_ROLES[prop];
      if (!role) continue;
      const page = pageInlineValue(el, prop);
      const shown = prop === 'background-image' && hideBackgroundImages ? withoutImages(page) : page;
      const v = rewriteValue(shown, role, look) ?? (shown !== page ? shown : null);
      if (v !== null && el.style.getPropertyValue(prop) !== inlineOriginals.get(el)?.get(prop)?.written) {
        setInlineImportant(el, prop, v);
      }
    }
    return {
      length: normal.length,
      item: (i) => normal[i],
      getPropertyValue: (p) => style.getPropertyValue(p),
      getPropertyPriority: (p) => style.getPropertyPriority(p),
    };
  }

  function processInline(el) {
    if (el.nodeType !== 1 || isOurs(el)) return;
    let decls = presentational(el);
    if (el.style?.length) decls = decls.concat(rewriteDeclarations(inlineView(el), look, { ...base, important: true }));
    if (!decls.length) {
      if (el.hasAttribute(INLINE_ATTR)) el.removeAttribute(INLINE_ATTR);
      return;
    }
    const scope = scopeOf(el);
    const id = ruleFor(scope, scope.inlineIds, INLINE_ATTR, decls);
    if (el.getAttribute(INLINE_ATTR) !== id) el.setAttribute(INLINE_ATTR, id);
    touched.add(el);
  }

  // ---- contrast
  function paintParent(el) {
    if (el.assignedSlot) return el.assignedSlot;
    if (el.parentElement) return el.parentElement;
    const root = el.parentNode;
    return root && root.nodeType === 11 ? root.host : null;
  }

  // The color an element's text is painted over: its own background and its
  // ancestors', composited down to the first opaque one (or the canvas).
  // `cache` (element → that element's result) is shared by one slice, where
  // nothing is written between reads, so siblings reuse their ancestors.
  function effectiveBackground(el, cache) {
    const chain = [];
    let below = canvas;
    for (let e = el; e; e = paintParent(e)) {
      const hit = cache.get(e);
      if (hit) {
        below = hit;
        break;
      }
      const c = parseColor(getCS(e).backgroundColor);
      const layer = c && c.alpha > 0 ? c : null;
      chain.push([e, layer]);
      if (layer && layer.alpha >= 1) {
        below = null;
        break;
      }
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const [e, layer] = chain[i];
      if (layer) below = below ? composite(layer, below) : layer;
      cache.set(e, below);
    }
    return { ...below, alpha: 1 };
  }

  // True when the nearest painted backdrop of `el`'s text is a photo: an
  // ancestor (up to the first opaque solid background) has a url() background,
  // or a positioned media element inside one of its near ancestors covers its
  // box. Contrast against our dark colors means nothing there, so the text
  // keeps what the page authored. `cache` (element → boolean) is per slice.
  function isPhotoSized(e) {
    const r = e.getBoundingClientRect();
    return r.width >= PHOTO_MIN_W && r.height >= PHOTO_MIN_H;
  }

  function overImage(el, cache) {
    // url() backgrounds: shared along the chain, like effectiveBackground.
    const chain = [];
    let result = false;
    for (let e = el; e; e = paintParent(e)) {
      const hit = cache.urls.get(e);
      if (hit !== undefined) {
        result = hit;
        break;
      }
      chain.push(e);
      const cs = getCS(e);
      // Small url() backgrounds are icons and sprites on a dark surface of ours.
      if (URL_IMAGE_RE.test(cs.backgroundImage) && isPhotoSized(e)) {
        result = true;
        break;
      }
      const c = parseColor(cs.backgroundColor);
      if (c && c.alpha >= 1) break;
    }
    for (const e of chain) cache.urls.set(e, result);
    if (result) return true;
    // A photo layer in a near ancestor (a media element or a url() background on
    // a child or grandchild, positioned or not, in any stacking order) that
    // covers this text's center: carousel slides layer the picture and the copy
    // as siblings, so the text's own chain never meets the picture (T035).
    let rect = null;
    for (let e = paintParent(el), hops = 0; e && hops < 6; e = paintParent(e), hops++) {
      let covers = cache.covers.get(e);
      if (covers === undefined) {
        covers = [];
        const layers = (parent) => {
          for (const kid of parent.children) {
            if (isOurs(kid)) continue;
            if (MEDIA_TAG_SET.has(kid.localName)) {
              const kcs = getCS(kid);
              if (kcs.display === 'none' || kcs.visibility !== 'visible') continue;
            } else if (!urlImagesSeen || !URL_IMAGE_RE.test(getCS(kid).backgroundImage)) {
              continue;
            }
            const r = kid.getBoundingClientRect();
            if (r.width >= PHOTO_MIN_W && r.height >= PHOTO_MIN_H) covers.push({ kid, r });
          }
        };
        if (e.children.length <= 40) {
          layers(e);
          for (const child of e.children) if (child.children.length <= 40 && !isOurs(child)) layers(child);
        }
        cache.covers.set(e, covers);
      }
      if (covers.length) {
        rect ??= el.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        for (const { kid, r } of covers) {
          if (!kid.contains(el) && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
        }
      }
      let opaque = cache.opaque.get(e);
      if (opaque === undefined) {
        const c = parseColor(getCS(e).backgroundColor);
        opaque = Boolean(c && c.alpha >= 1);
        cache.opaque.set(e, opaque);
      }
      if (opaque) break;
    }
    return false;
  }

  // WCAG large text: 24 px, or 18.66 px and bold.
  function isLargeText(cs) {
    const px = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    return px >= 24 || (px >= 18.66 && weight >= 700);
  }

  function isSaturatedCard(bg) {
    const o = srgbToOklch(bg);
    return o.c >= SATURATED_C && o.l >= SATURATED_L_MIN && o.l <= SATURATED_L_MAX;
  }

  function hasOwnText(el) {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.data.trim()) return true;
    }
    return false;
  }

  // Read half of a contrast fix: what `el` needs, or null. Writes nothing.
  function contrastFix(el, cache) {
    if (isOurs(el) || !hasOwnText(el)) return null;
    const cs = getCS(el);
    if (cs.display === 'none' || cs.visibility !== 'visible') return null;
    const fg = parseColor(cs.color);
    if (!fg || fg.alpha === 0) return null;
    if (overImage(el, cache)) {
      // Already restored and still showing what we restored: nothing to read.
      return keptColor.get(el) === cs.color ? null : { el, keep: true, current: cs.color };
    }
    const bg = effectiveBackground(el, cache.bg);
    // A saturated mid-tone card (a promo tile): our own text color there reads
    // as gray even when it passes contrast, so the authored color is read first.
    // It stands unless it misses large-text contrast on the backdrop we drew;
    // then the ensureContrast result (or our current color) applies (T035).
    if (isLargeText(cs) && isSaturatedCard(bg)) {
      if (keptColor.get(el) === cs.color) return null;
      const fixedLarge = contrastRatio(fg, bg) >= MIN_CONTRAST ? null : ensureContrast(fg, bg);
      return { el, keep: true, current: cs.color, backdrop: bg, fallback: fixedLarge ? formatRgb(fixedLarge) : cs.color };
    }
    if (contrastRatio(fg, bg) >= MIN_CONTRAST) return null;
    const fixed = ensureContrast(fg, bg);
    if (!fixed) return null;
    const important = el.style?.getPropertyPriority('color') === 'important';
    const fill = important ? null : cs.webkitTextFillColor;
    const fillColor = fill ? parseColor(fill) : null;
    return { el, color: formatRgb(fixed), important, fill: Boolean(fillColor && fillColor.alpha > 0 && fill !== cs.color) };
  }

  // Write half.
  function applyFix({ el, color, important, fill, fillColor }) {
    if (important) {
      setInlineImportant(el, 'color', color);
      return;
    }
    const decls = [`color:${color} !important`];
    if (fill) decls.push(`-webkit-text-fill-color:${fillColor ?? color} !important`);
    const scope = scopeOf(el);
    el.setAttribute(FIX_ATTR, ruleFor(scope, scope.fixIds, FIX_ATTR, decls));
    touched.add(el);
  }

  // ---- walking
  function elementsIn(root) {
    const all = root.querySelectorAll ? [...root.querySelectorAll('*')] : [];
    return root.nodeType === 1 ? [root, ...all] : all;
  }

  // Record every element under `root` (and `root` itself) in the selector index.
  function indexTree(root) {
    if (!prune) return;
    for (const el of elementsIn(root)) selectors.addElement(el);
  }

  function adoptShadow(host) {
    const sr = host.shadowRoot;
    if (!sr) {
      if (host.localName.includes('-')) {
        pendingHosts.add(host);
        watchHosts();
      }
      return;
    }
    pendingHosts.delete(host);
    if (scopes.has(sr)) return;
    indexTree(sr);
    syncSheets(ensureScope(sr));
    scanTree(sr);
    wantContrast(host);
  }

  // A custom element usually gets its shadow root when its definition loads,
  // which no MutationObserver reports. Until then its shadow content would
  // paint with the page's own (light) colors under our light interim text
  // (QA 2026-10-19: reddit.com cards white for ~1 s in the iOS Simulator).
  // While hosts are pending, check them every animation frame, before paint,
  // for the first HOST_WATCH_MS; the regular sync keeps covering later ones.
  let hostFrame = null;
  const watchStart = now();
  function watchHosts() {
    if (hostFrame !== null || stopped || !win.requestAnimationFrame || now() - watchStart > HOST_WATCH_MS) return;
    hostFrame = win.requestAnimationFrame(() => {
      hostFrame = null;
      if (stopped) return;
      let adopted = false;
      for (const host of [...pendingHosts]) {
        if (host.shadowRoot) { adoptShadow(host); adopted = true; }
        else if (!host.isConnected) pendingHosts.delete(host);
      }
      if (adopted) wantContrastAll();
      if (pendingHosts.size) watchHosts();
    });
  }

  // about:blank and srcdoc frames get no content script (the manifest has no
  // match_about_blank), so a frame the page fills itself would stay light.
  // They're same-origin with us, so run a nested engine on their document;
  // a frame's `load` (srcdoc parsed, src set to about:blank) restarts it.
  function adoptFrame(el) {
    if (frames.has(el)) return;
    const src = el.getAttribute('src')?.trim().toLowerCase();
    if (!el.hasAttribute('srcdoc') && src && src !== 'about:blank') return;
    const entry = { doc: null, engine: null };
    const start = () => {
      if (stopped) return;
      let doc = null;
      try {
        doc = el.contentDocument;
      } catch {
        doc = null;
      }
      if (!doc || doc === entry.doc || !doc.documentElement || !doc.defaultView) return;
      entry.engine?.stop();
      entry.doc = doc;
      // A content script got there first (a host that does inject here).
      entry.engine = doc.querySelector(`[${MARK}],#sunglasses-at-night-early`) ? null : startDynamic({
        document: doc, window: doc.defaultView, look, fetchSheet, images, hideBackgroundImages, monitor, prune,
      });
    };
    entry.start = start;
    frames.set(el, entry);
    el.addEventListener('load', start);
    start();
  }

  // SVG presentation attributes (fill="#000", stroke="#222") are not CSS, so
  // the sheet rewrite never sees them: a black inline logo or icon stayed
  // black on the dark page (QA 2026-10-19: the nytimes.com wordmark vanished).
  // A dark neutral attribute value gets a zero-specificity rule with its
  // foreground mapping: it beats the presentation attribute, and any page
  // CSS that sets fill/stroke still wins (and is rewritten as usual).
  // Colored fills (charts, brand marks) are left as authored.
  const svgPaintSeen = new Map(); // scope → Set of attr=value
  function noteSvgPaint(el) {
    for (const attr of ['fill', 'stroke']) {
      const v = el.getAttribute(attr)?.trim();
      if (!v) continue;
      const c = parseColor(v);
      if (!c || c.alpha === 0) continue;
      const { c: chroma } = srgbToOklch(c);
      if (relativeLuminance(c) > 0.06 || chroma > 0.04) continue;
      const scope = ensureScope(el.getRootNode?.() ?? document);
      let seen = svgPaintSeen.get(scope);
      if (!seen) svgPaintSeen.set(scope, (seen = new Set()));
      const key = `${attr}=${v.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mapped = rewriteValue(v, 'fg', look);
      if (!mapped) continue;
      const q = v.replace(/["\\]/g, '\\$&');
      addRule(scope, `:where(svg[${attr}="${q}" i],svg [${attr}="${q}" i]){${attr}:${mapped}}`);
    }
  }

  function scanTree(root) {
    for (const el of elementsIn(root)) {
      if (isOurs(el)) continue;
      if (el.namespaceURI === SVG_NS && (el.hasAttribute('fill') || el.hasAttribute('stroke'))) noteSvgPaint(el);
      if (el.hasAttribute('style') || el.hasAttribute('bgcolor') || el.localName === 'font' || el.localName === 'body' ||
        (hideBackgroundImages && el.hasAttribute('background'))) {
        processInline(el);
      }
      if (el.shadowRoot || el.localName.includes('-')) adoptShadow(el);
      if (el.localName === 'iframe') adoptFrame(el);
    }
  }

  // ---- deferred work
  // The parent a node is painted inside, crossing shadow boundaries.
  const upFrom = (n) => n.parentNode ?? (n.nodeType === 11 ? n.host : null);

  // The connected nodes of `nodes` that have no ancestor in `nodes`.
  function topmost(nodes) {
    const out = [];
    for (const n of nodes) {
      if (!n.isConnected) continue;
      let covered = false;
      for (let p = upFrom(n); p && !covered; p = upFrom(p)) covered = nodes.has(p);
      if (!covered) out.push(n);
    }
    return out;
  }

  function collect(root, out) {
    for (const el of elementsIn(root)) {
      out.push(el);
      if (el.shadowRoot && scopes.has(el.shadowRoot)) collect(el.shadowRoot, out);
    }
    return out;
  }

  function wake(delay) {
    if (stopped) return;
    const at = now() + delay;
    if (timerId !== null && timerAt <= at) return;
    if (timerId !== null) win.clearTimeout(timerId);
    timerAt = at;
    timerId = win.setTimeout(runSlice, delay);
  }

  function wantContrast(node) {
    contrastRoots.add(node);
    wake(CONTRAST_DELAY_MS);
  }

  function wantContrastAll(delay = 0) {
    contrastAll = true;
    wake(delay);
  }

  function requestSync() {
    if (stopped) return;
    syncWanted = true;
    contrastAll = true;
    wake(0);
  }

  function nextPass() {
    let items = null;
    if (contrastAll) {
      contrastAll = false;
      contrastRoots.clear();
      items = collect(document.documentElement, []);
    } else if (contrastRoots.size) {
      items = [];
      for (const root of topmost(contrastRoots)) collect(root, items);
      contrastRoots.clear();
    }
    return items && items.length ? { items, i: 0 } : null;
  }

  // Check contrast for pass.items until `deadline`: all reads, then all writes.
  // ---- content inserted after load (PENDING_ATTR)
  const NO_PAINT = new Set(['style', 'link', 'script', 'noscript', 'template', 'meta', 'base', 'title']);

  function tagPending(el) {
    if (NO_PAINT.has(el.localName) || !el.isConnected || isOurs(el)) return;
    el.setAttribute(PENDING_ATTR, '');
    pendingTags.set(el, now());
  }

  // A tagged subtree whose own stylesheets are still loading stays tagged: its
  // link's load event re-syncs and re-checks everything, and releases it then.
  function releasePending(force = false) {
    // A sheet still being re-fetched means the override doesn't cover the subtree yet.
    if (!force && (pending.size || incomplete)) return;
    // The page may insert a stylesheet link next to the subtree, not inside it.
    const loading = !force && [...document.querySelectorAll('link[rel~="stylesheet" i]')].some((l) => !l.sheet && !l.disabled);
    for (const el of [...pendingTags.keys()]) {
      if (loading && el.isConnected) continue;
      el.removeAttribute(PENDING_ATTR);
      pendingTags.delete(el);
    }
  }

  function contrastSlice(p, deadline) {
    if (!p.released) {
      // The sheets are in place for everything inserted so far: lift the
      // placeholder rule and check this pass in the same task, before paint.
      p.released = true;
      releasePending();
    }
    const fixes = [], keeps = [], blends = [], cache = { bg: new Map(), urls: new Map(), covers: new Map(), opaque: new Map() }, { items } = p;
    while (p.i < items.length) {
      const el = items[p.i++];
      if (el.isConnected) {
        if (!isOurs(el) && isBlendCandidate(el)) blends.push(el);
        const fix = contrastFix(el, cache);
        if (fix?.keep) keeps.push(fix);
        else if (fix) fixes.push(fix);
      }
      if ((p.i & 31) === 0 && now() > deadline) break;
    }
    if (keeps.length) fixes.push(...authoredColors(keeps));
    for (const fix of fixes) applyFix(fix);
    if (blends.length) fixBlendOverlays(blends);
  }

  // Our rewrite already turned the page's multiply/darken into normal and left
  // BLEND_MARK on the element it matched. The mark inherits, so only an element
  // whose parent lacks it was matched itself.
  function isBlendCandidate(el) {
    // Two computed-style reads per element add up on a big batch: skip them
    // until some rule we wrote actually carries the mark.
    if (!blendMarked || !getCS(el).getPropertyValue(BLEND_MARK)) return false;
    const parent = el.parentElement;
    return !parent || !getCS(parent).getPropertyValue(BLEND_MARK);
  }

  // Our sheets switched off for one synchronous read (no paint in between),
  // then back on: `read()` sees what the page authored.
  function readAuthored(read) {
    const sheets = [];
    for (const scope of scopes.values()) sheets.push(scope.baseEl, scope.overrideEl, scope.dynEl);
    const live = sheets.filter(Boolean);
    const prior = live.map((st) => st.media);
    for (const st of live) st.media = 'not all';
    try {
      return read();
    } finally {
      live.forEach((st, i) => {
        if (prior[i]) st.media = prior[i];
        else st.removeAttribute('media');
      });
    }
  }

  // A light or clear tint that blends over a photo (T032): darkened, it would
  // black out what is under it, so it becomes transparent and blends normally.
  // Decided on the page's authored background, not our dark one.
  function fixBlendOverlays(els) {
    const authored = readAuthored(() => els.map((el) => {
      const cs = getCS(el);
      return { blend: cs.mixBlendMode, bg: cs.backgroundColor, img: cs.backgroundImage };
    }));
    els.forEach((el, i) => {
      const a = authored[i];
      if (!isBlendOverlay(el, a.blend, a.bg, a.img)) return;
      for (const [prop, value] of OVERLAY_DECLS) setInlineImportant(el, prop, value);
    });
  }

  // Text over a photo keeps the color the page gave it. Our sheets are switched
  // off for one synchronous style read (no paint in between, as early.js does
  // in readPageColors), then back on; a fix rule restores what was read.
  function authoredColors(keeps) {
    const sheets = [];
    for (const scope of scopes.values()) sheets.push(scope.baseEl, scope.overrideEl, scope.dynEl);
    const live = sheets.filter(Boolean);
    const prior = live.map((st) => st.media);
    const read = [];
    for (const st of live) st.media = 'not all';
    try {
      for (const k of keeps) {
        const cs = getCS(k.el);
        read.push({ color: cs.color, fill: cs.webkitTextFillColor });
      }
    } finally {
      live.forEach((st, i) => {
        if (prior[i]) st.media = prior[i];
        else st.removeAttribute('media');
      });
    }
    const out = [];
    keeps.forEach((k, i) => {
      const important = k.el.style?.getPropertyPriority('color') === 'important';
      let authored = important ? pageInlineValue(k.el, 'color') || read[i].color : read[i].color;
      if (k.fallback) {
        const a = parseColor(authored);
        if (!a || contrastRatio(a, k.backdrop) < LARGE_TEXT_CONTRAST) {
          keptColor.set(k.el, k.fallback);
          out.push({ el: k.el, color: k.fallback, important, fill: false });
          return;
        }
      }
      keptColor.set(k.el, authored);
      if (authored === k.current) return;
      const { color, fill } = read[i];
      const fc = fill ? parseColor(fill) : null;
      out.push({ el: k.el, color: authored, important, fill: Boolean(!important && fc && fc.alpha > 0 && fill !== color), fillColor: fill });
    });
    return out;
  }

  function syncAll(deadline) {
    // Recomputed by every full sync: a remote sheet that was missing last time
    // and has since arrived must not keep the flag set (it held pending
    // subtrees tagged forever, T031 2026-10-18). Sheets still missing set it
    // again as they're visited; complete ones are cached only when complete.
    incomplete = false;
    let changed = false;
    for (const scope of [...scopes.values()]) {
      if (scope.root.nodeType === 11 && !scope.root.host?.isConnected) continue;
      const r = syncSheets(scope, deadline);
      if (r === YIELD) return YIELD;
      changed = r || changed;
    }
    return changed;
  }

  // Canvas propagation (QA 2026-10-19, nytimes.com: lead photos vanished).
  // When the page gives <html> no background and <body> one, CSS paints the
  // body's background on the canvas and the body box itself stays clear, so
  // `z-index:-1` content (NYT figures) shows above it. Our base rule gives
  // <html> a dark background, which stops that propagation: the body then
  // paints its own (now dark) box over the negative-z content. So when the
  // page relies on propagation, the root's background is left to the body.
  let canvasEl = null;
  function syncCanvas() {
    const root = document.documentElement, body = document.body;
    if (!root || !body) return;
    // Every sheet of ours off for one synchronous read (the early and interim
    // sheets paint html/body too), then back on: no paint in between.
    const ours = [...document.querySelectorAll(`style[${MARK}]`)];
    const prior = ours.map((st) => st.media);
    for (const st of ours) st.media = 'not all';
    let authored;
    try {
      const r = getCS(root), b = getCS(body);
      authored = { rootBg: r.backgroundColor, rootImg: r.backgroundImage, bodyBg: b.backgroundColor, bodyImg: b.backgroundImage };
    } finally {
      ours.forEach((st, i) => { if (prior[i]) st.media = prior[i]; else st.removeAttribute('media'); });
    }
    const clear = (c) => { const p = parseColor(c); return !p || p.alpha === 0; };
    const propagates = clear(authored.rootBg) && (!authored.rootImg || authored.rootImg === 'none') &&
      (!clear(authored.bodyBg) || (authored.bodyImg && authored.bodyImg !== 'none'));
    if (propagates && !canvasEl) {
      canvasEl = makeStyle('canvas');
      canvasEl.textContent = ':root{background-color:transparent!important}';
      const scope = scopes.get(document);
      (scope?.overrideEl?.parentNode ?? root).insertBefore(canvasEl, scope?.overrideEl ?? null);
    } else if (!propagates && canvasEl) {
      canvasEl.remove();
      canvasEl = null;
    }
  }

  // Run deferred work until `deadline`; false when some is left.
  function work(deadline) {
    if (syncWanted) {
      if (syncAll(deadline) === YIELD) return false;
      syncWanted = false;
      syncCanvas();
      checkReady();
    }
    for (;;) {
      if (!readyDone) return true;
      if (!pass) pass = nextPass();
      if (!pass) return true;
      if (now() > deadline) return false;
      contrastSlice(pass, deadline);
      if (pass.i >= pass.items.length) pass = null;
    }
  }

  const runSlice = timed('slice', () => {
    timerId = null;
    timerAt = Infinity;
    if (stopped) return;
    if (!work(now() + SLICE_MS)) {
      wake(0);
      return;
    }
    // All queued work is done. Subtrees tagged after this pass's release (a
    // later insert, or one waiting on a re-fetched sheet) are released here,
    // once their sheets are in; releasePending checks that itself.
    if (pendingTags.size) releasePending();
  });

  function onMutations(scope, records) {
    if (stopped) return;
    let sheetsChanged = false;
    const added = new Set();
    if (prune) {
      // Index before any sheet is rewritten, so a class that just arrived
      // brings its rules back in this task, before the next paint.
      for (const r of records) {
        if (r.type === 'childList') {
          for (const n of r.addedNodes) if (n.nodeType === 1 && n.isConnected && !isOurs(n)) indexTree(n);
        } else if (r.type === 'attributes' && (r.attributeName === 'class' || r.attributeName === 'id') && !isOurs(r.target)) {
          selectors.addElement(r.target);
        }
      }
      if (pruneRevived) {
        pruneRevived = false;
        if (syncAll(Infinity) === true) wantContrastAll();
      }
    }
    const isSheetNode = (n) => n.localName === 'style' || (n.localName === 'link' && /stylesheet/i.test(n.rel));
    for (const r of records) {
      const t = r.target;
      if (r.type === 'childList') {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1 || isOurs(n)) continue;
          if (isSheetNode(n) || n.querySelector?.('style,link')) sheetsChanged = true;
          if (n.localName === 'link') n.addEventListener('load', onSheetLoad, { once: true });
          prefetchLinks(n);
          added.add(n);
        }
        for (const n of r.removedNodes) {
          if (n.nodeType === 1 && (isSheetNode(n) || isOurs(n))) sheetsChanged = true;
        }
        if (t.nodeType === 1 && t.localName === 'style' && !isOurs(t)) sheetsChanged = true;
      } else if (r.type === 'attributes' && !isOurs(t)) {
        if (SHEET_ATTRS.has(r.attributeName) && isSheetNode(t)) {
          sheetsChanged = true;
        } else {
          // A class can recolor the whole subtree; that only needs a contrast
          // check, not a rescan.
          if (r.attributeName !== 'class' && r.attributeName !== 'id') processInline(t);
          wantContrast(t);
        }
      }
    }
    // Before paint: what the page inserted shows dark until the slices have
    // checked it (the interim rule only covers the load, this covers after).
    if (readyDone) for (const n of topmost(added)) tagPending(n);
    // New page sheets are rewritten now, so their content never shows light.
    if (sheetsChanged && syncSheets(scope)) wantContrastAll();
    if (sheetsChanged) markBusy();
    for (const n of topmost(added)) {
      scanTree(n);
      wantContrast(n);
    }
  }

  const onSheetLoad = timed('sheet-load', () => requestSync());

  // Start the re-fetch of a cross-origin sheet the moment its <link> is seen,
  // not when it has loaded: the text is usually here by the time it applies.
  function prefetchLinks(node) {
    const links = node.localName === 'link' ? [node] : [...(node.querySelectorAll?.('link') ?? [])];
    for (const link of links) {
      if (!/\bstylesheet\b/i.test(link.rel) || !link.href || link.disabled) continue;
      try {
        if (new URL(link.href).origin !== document.location?.origin) remoteCss(link.href, undefined, 0);
      } catch { /* not a URL */ }
    }
  }

  // ---- lifecycle
  function refresh(forceContrast = false) {
    if (stopped) return;
    const t = now();
    for (const [el, at] of [...pendingTags]) {
      if (el.isConnected && t - at <= READY_CAP_MS) continue;
      el.removeAttribute(PENDING_ATTR);
      pendingTags.delete(el);
      if (el.isConnected) wantContrast(el);
    }
    const changed = syncAll(now() + SLICE_MS);
    if (changed === YIELD) requestSync();
    let adopted = false;
    for (const host of [...pendingHosts]) {
      if (host.shadowRoot) {
        adoptShadow(host);
        adopted = true;
      } else if (!host.isConnected) {
        pendingHosts.delete(host);
      }
    }
    if (changed === true) syncCanvas();
    if (changed === true || forceContrast || adopted) wantContrastAll();
  }

  timed('start', () => {
    ensureScope(document);
    indexTree(document.documentElement);
    syncSheets(scopes.get(document));
    syncCanvas();
    scanTree(document.documentElement);
    for (const link of document.querySelectorAll('link[rel~="stylesheet" i]')) {
      if (!link.sheet) link.addEventListener('load', onSheetLoad, { once: true });
    }
    // Contrast fixes follow in slices right after; the override sheet is
    // already in place, so nothing shows light meanwhile.
    wantContrastAll();
    if (onReady) readyTimer = win.setTimeout(() => checkReady(true), READY_CAP_MS);
    checkReady();
  })();
  const timer = win.setInterval(timed('poll', () => {
    if (!document.hidden) refresh();
  }), POLL_MS);

  function stop() {
    stopped = true;
    if (hostFrame !== null) win.cancelAnimationFrame?.(hostFrame);
    hostFrame = null;
    canvasEl?.remove();
    canvasEl = null;
    win.clearInterval(timer);
    win.clearTimeout(readyTimer);
    if (timerId !== null) win.clearTimeout(timerId);
    timerId = null;
    pass = null;
    contrastRoots.clear();
    releasePending(true);
    for (const scope of scopes.values()) {
      scope.observer?.disconnect();
      scope.baseEl?.remove();
      scope.overrideEl.remove();
      scope.dynEl.remove();
    }
    siteEl?.remove();
    siteEl = null;
    for (const el of touched) {
      el.removeAttribute(INLINE_ATTR);
      el.removeAttribute(FIX_ATTR);
      for (const [prop, { value, written }] of inlineOriginals.get(el) ?? []) {
        if (el.style.getPropertyValue(prop) !== written) continue; // the page changed it since
        if (value) el.style.setProperty(prop, value, 'important');
        else el.style.removeProperty(prop);
      }
      inlineOriginals.delete(el);
    }
    for (const [el, entry] of frames) {
      el.removeEventListener('load', entry.start);
      entry.engine?.stop();
    }
    frames.clear();
    scopes.clear();
    touched.clear();
    pendingHosts.clear();
  }

  async function settle() {
    while (pending.size) await Promise.all([...pending]);
    if (stopped) return;
    timed('settle', () => {
      refresh(true);
      syncWanted = true;
      work(Infinity);
    })();
  }

  return { stop, refresh, settle, setSiteCss };
}
