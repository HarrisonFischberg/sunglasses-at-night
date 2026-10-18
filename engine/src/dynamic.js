// Sunglasses for Safari: dynamic engine (T007).
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

import { parseColor, formatRgb, composite, contrastRatio } from './color.js';
import { createSelectorIndex } from './selector-index.js';
import { transformColor, ensureContrast, quantize, normalizeLook, MIN_CONTRAST } from './transform.js';
import { dynamicImageCss } from './filter.js';

export const MARK = 'data-sunglasses-at-night';
export const INLINE_ATTR = 'data-san-inline';
export const FIX_ATTR = 'data-san-fix';
export const VAR_PREFIX = '--san-';

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
  for (let i = 0; i < len; i++) {
    const prop = style.item ? style.item(i) : style[i];
    if (!prop || seen.has(prop)) continue;
    seen.add(prop);
    const value = style.getPropertyValue(prop);
    if (!value && PROP_ROLES[prop]) pendingVar = true;
    if (prop.startsWith('--')) {
      if (prop.startsWith(VAR_PREFIX)) continue;
      for (const role of ROLES) {
        const v = rewriteValue(value, role, look);
        if (v !== null) out.push(`${roleVar(role, prop)}:${v}${bangFor(prop)}`);
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

// ------------------------------------------------------------- the engine

const HTML_NS = 'http://www.w3.org/1999/xhtml';
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
 * Returns { stop(), refresh(), settle() }; settle() resolves once every
 * cross-origin fetch started so far has been applied and all deferred work
 * is done.
 */
export function startDynamic({
  document, window = document.defaultView, look, fetchSheet = async () => null,
  images = 'leave', hideBackgroundImages = false, monitor = null, onReady = null, prune = true,
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
  let incomplete = false; // set while a needed remote sheet is still loading
  // Deferred work: see SLICE_MS.
  const contrastRoots = new Set(); // nodes whose subtree needs a contrast check
  let contrastAll = false; // the whole document does
  let pass = null; // { items, i }: the contrast pass in progress
  let syncWanted = false; // sheets changed (link load, remote sheet arrived)
  let timerId = null, timerAt = Infinity;
  let readyDone = !onReady, readyTimer = null;

  function checkReady(force = false) {
    if (readyDone || stopped) return;
    if (!force) {
      if (pending.size || syncWanted) return;
      for (const link of document.querySelectorAll('link[rel~="stylesheet" i]')) {
        if (!link.sheet && !link.disabled) return;
      }
    }
    readyDone = true;
    win.clearTimeout(readyTimer);
    onReady();
    wantContrastAll();
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
      scope.baseEl.textContent = baseCss(look) + dynamicImageCss(images);
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

  // Keep [override, dynamic] as the last two children of the scope, after
  // every page sheet. Moving a <style> re-creates its sheet from text, so
  // rules added with insertRule are restored from scope.dynRules.
  function placeLast(scope) {
    const parent = scope.root.nodeType === 9 ? scope.root.documentElement : scope.root;
    if (!parent) return;
    const { overrideEl: o, dynEl: d } = scope;
    if (parent.lastChild === d && d.previousSibling === o) return;
    parent.appendChild(o);
    parent.appendChild(d);
    d.textContent = scope.dynRules.join('\n');
  }

  function addRule(scope, rule) {
    scope.dynRules.push(rule);
    const sheet = scope.dynEl.sheet;
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
    const bg = effectiveBackground(el, cache);
    if (contrastRatio(fg, bg) >= MIN_CONTRAST) return null;
    const fixed = ensureContrast(fg, bg);
    if (!fixed) return null;
    const important = el.style?.getPropertyPriority('color') === 'important';
    const fill = important ? null : cs.webkitTextFillColor;
    const fillColor = fill ? parseColor(fill) : null;
    return { el, color: formatRgb(fixed), important, fill: Boolean(fillColor && fillColor.alpha > 0 && fill !== cs.color) };
  }

  // Write half.
  function applyFix({ el, color, important, fill }) {
    if (important) {
      setInlineImportant(el, 'color', color);
      return;
    }
    const decls = [`color:${color} !important`];
    if (fill) decls.push(`-webkit-text-fill-color:${color} !important`);
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
      if (host.localName.includes('-')) pendingHosts.add(host);
      return;
    }
    pendingHosts.delete(host);
    if (scopes.has(sr)) return;
    indexTree(sr);
    syncSheets(ensureScope(sr));
    scanTree(sr);
    wantContrast(host);
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

  function scanTree(root) {
    for (const el of elementsIn(root)) {
      if (isOurs(el)) continue;
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
  function contrastSlice(p, deadline) {
    const fixes = [], cache = new Map(), { items } = p;
    while (p.i < items.length) {
      const el = items[p.i++];
      if (el.isConnected) {
        const fix = contrastFix(el, cache);
        if (fix) fixes.push(fix);
      }
      if ((p.i & 31) === 0 && now() > deadline) break;
    }
    for (const fix of fixes) applyFix(fix);
  }

  function syncAll(deadline) {
    let changed = false;
    for (const scope of [...scopes.values()]) {
      if (scope.root.nodeType === 11 && !scope.root.host?.isConnected) continue;
      const r = syncSheets(scope, deadline);
      if (r === YIELD) return YIELD;
      changed = r || changed;
    }
    return changed;
  }

  // Run deferred work until `deadline`; false when some is left.
  function work(deadline) {
    if (syncWanted) {
      if (syncAll(deadline) === YIELD) return false;
      syncWanted = false;
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
    if (!work(now() + SLICE_MS)) wake(0);
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
    // New page sheets are rewritten now, so their content never shows light.
    if (sheetsChanged && syncSheets(scope)) wantContrastAll();
    for (const n of topmost(added)) {
      scanTree(n);
      wantContrast(n);
    }
  }

  const onSheetLoad = timed('sheet-load', () => requestSync());

  // ---- lifecycle
  function refresh(forceContrast = false) {
    if (stopped) return;
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
    if (changed === true || forceContrast || adopted) wantContrastAll();
  }

  timed('start', () => {
    ensureScope(document);
    indexTree(document.documentElement);
    syncSheets(scopes.get(document));
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
    win.clearInterval(timer);
    win.clearTimeout(readyTimer);
    if (timerId !== null) win.clearTimeout(timerId);
    timerId = null;
    pass = null;
    contrastRoots.clear();
    for (const scope of scopes.values()) {
      scope.observer?.disconnect();
      scope.baseEl?.remove();
      scope.overrideEl.remove();
      scope.dynEl.remove();
    }
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

  return { stop, refresh, settle };
}
