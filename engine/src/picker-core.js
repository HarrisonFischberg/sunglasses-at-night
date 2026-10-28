// Sunglasses at Night: the element address behind "Fix something on this
// page". Given the element you picked, builds a CSS selector that finds
// that one element again on your next visit, and a short label for the
// fixes list. Works on any DOM (the page, or node:test's stand-in); no
// network, no extension API.
//
// A good address survives a reload and small page changes, so it prefers,
// in order: a stable id, a testing or accessibility attribute, stable class
// names, and only then the element's position among its siblings. Names that
// look generated (hashes, counters, state like "active") are skipped: sites
// rebuild them all the time.

import { isSafeSelector, tidyLabel } from './fix-rules.js';
import { parseColor, composite, contrastRatio } from './color.js';

const IDENT_RE = /^[A-Za-z_][\w-]*$/;
const GENERATED_PREFIX_RE = /^(css|sc|jsx|svelte|emotion|tw|ember|ng|astro|chakra|_)[-_]?[a-z0-9]*$/i;
const STATE_RE = /^(is-|has-)?(active|hover|hovered|focus|focused|focus-visible|selected|open|opened|closed|visible|hidden|show|shown|expanded|collapsed|current|disabled|loading|loaded|animating|sticky|scrolled)$/i;
// Attributes that name an element on purpose, most specific first.
const NAME_ATTRS = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'aria-label', 'name'];
const MAX_DEPTH = 12;

/** Does this id or class look hand-written (kept across builds and visits)? */
export function isStableToken(token) {
  if (typeof token !== 'string' || !IDENT_RE.test(token) || token.length > 40) return false;
  if (/\d{3,}/.test(token) || STATE_RE.test(token)) return false;
  if (GENERATED_PREFIX_RE.test(token) && /\d/.test(token)) return false;
  for (const part of token.split(/[-_]+/)) {
    if (!part) continue;
    // Letters and digits mixed inside one word: a hash ("x7f3a", "ZFr60d"),
    // but short numbered names ("h1", "col12", "mt4") are fine.
    if (/\d/.test(part) && /[a-z]/i.test(part) && !/^[a-z]+\d{1,2}$/i.test(part)) return false;
    // Several capitals in a short word: an obfuscated name ("VfPpkd", "LgbsSe").
    if (part.length <= 8 && (part.match(/[A-Z]/g) ?? []).length >= 2 && part !== part.toUpperCase()) return false;
  }
  return true;
}

const tagOf = (el) => (el.localName || el.tagName || '').toLowerCase();

function attrValueOk(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 60 && !/["\\\n]/.test(v) && isSafeSelector(`[x="${v}"]`);
}

function stableClasses(el) {
  const list = [...(el.classList ?? [])].filter(isStableToken);
  return list.slice(0, 2);
}

/** `#id` when the element has a stable id, else null. */
function idSelector(el) {
  const id = el.getAttribute?.('id');
  return id && isStableToken(id) ? `#${id}` : null;
}

/** Selectors that name `el` without its position, best first. */
function ownCandidates(el) {
  const tag = tagOf(el);
  const out = [];
  const id = idSelector(el);
  if (id) out.push(id);
  for (const a of NAME_ATTRS) {
    const v = el.getAttribute?.(a);
    if (attrValueOk(v)) out.push(`${tag}[${a}="${v}"]`);
  }
  const classes = stableClasses(el);
  if (classes.length) out.push(`${tag}.${classes.join('.')}`);
  return out;
}

/** One step of a path: tag, stable classes, and the position when needed. */
function step(el) {
  const tag = tagOf(el);
  const classes = stableClasses(el);
  let s = classes.length ? `${tag}.${classes.join('.')}` : tag;
  const parent = el.parentElement;
  if (parent) {
    const same = [...parent.children].filter((c) => tagOf(c) === tag);
    if (same.length > 1) s += `:nth-of-type(${same.indexOf(el) + 1})`;
  }
  return s;
}

function findsOnly(doc, selector, el) {
  if (!isSafeSelector(selector)) return false;
  try {
    const all = doc.querySelectorAll(selector);
    return all.length === 1 && all[0] === el;
  } catch {
    return false;
  }
}

/**
 * The element worth fixing for a click on `node`: shapes inside an SVG
 * become the whole <svg> (a logo, an icon). An element inside a shadow root
 * stays itself: widening it to the host silently turned a fix for one field
 * into a fix for a whole web-component app (owner report, 2026-10-28). The
 * picker refuses it instead (see isSealed).
 */
export function pickTarget(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement ?? null;
  if (!el) return null;
  let svg = null;
  for (let p = el; p && p.nodeType === 1; p = p.parentElement) if (tagOf(p) === 'svg') svg = p;
  return svg ?? el;
}

/** Inside a shadow root: a page selector can't name it on its own. */
export const isSealed = (el, doc = el?.ownerDocument) => !!el && el.getRootNode?.() !== doc;

/** One step out: the parent, or the host at the top of a shadow root. */
export const outerOf = (el) => el?.parentElement ?? el?.getRootNode?.().host ?? null;

/** The element under (x, y), looking inside open shadow roots. */
export function deepElementFromPoint(doc, x, y) {
  let el = doc.elementFromPoint(x, y);
  for (let inner; el?.shadowRoot && (inner = el.shadowRoot.elementFromPoint(x, y)) && inner !== el;) el = inner;
  return el;
}

const flatParent = (el) => el.assignedSlot ?? el.parentElement ?? el.getRootNode?.().host ?? null;

/**
 * Text in `el` (open shadow roots included) whose contrast on the background
 * painted behind it is under `min`. Backgrounds are composited up the flat
 * tree onto white; text over a background image is skipped (unknown).
 */
export function hardToRead(el, getCS, min = 3) {
  const out = [];
  const visit = (node) => {
    for (const e of node.children ?? []) {
      check(e);
      if (e.shadowRoot) visit(e.shadowRoot);
      visit(e);
    }
  };
  const check = (e) => {
    const field = tagOf(e) === 'input' || tagOf(e) === 'textarea';
    const text = field ? e.value || e.placeholder : [...e.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
    if (!text) return;
    const cs = getCS(e);
    if (cs.display === 'none' || cs.visibility !== 'visible' || Number(cs.opacity) === 0) return;
    const fg = parseColor(cs.webkitTextFillColor || cs.color);
    if (!fg || fg.alpha === 0) return;
    const layers = [];
    for (let p = e; p; p = flatParent(p)) {
      const pcs = p === e ? cs : getCS(p);
      if (pcs.backgroundImage && pcs.backgroundImage !== 'none') return;
      const c = parseColor(pcs.backgroundColor);
      if (c && c.alpha > 0) { layers.push(c); if (c.alpha >= 1) break; }
    }
    let bg = { r: 1, g: 1, b: 1, alpha: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = composite(layers[i], bg);
    if (contrastRatio(fg, bg) < min) out.push(e);
  };
  check(el);
  if (el.shadowRoot) visit(el.shadowRoot);
  visit(el);
  return out;
}

/**
 * A selector that finds `el`, and only `el`, in `doc`; null when there is
 * none (the element isn't in `doc`, or is the root itself).
 */
export function buildSelector(el, doc = el?.ownerDocument) {
  if (!el || !doc || el.nodeType !== 1) return null;
  const tag = tagOf(el);
  if (tag === 'html' || tag === 'body' || tag === 'head') return tag;
  for (const c of ownCandidates(el)) if (findsOnly(doc, c, el)) return c;
  const parts = [step(el)];
  for (let p = el.parentElement, depth = 0; p && depth < MAX_DEPTH; p = p.parentElement, depth++) {
    const ptag = tagOf(p);
    if (ptag === 'html') break;
    if (ptag === 'body') {
      const s = `body > ${parts.join(' > ')}`;
      return findsOnly(doc, s, el) ? s : null;
    }
    // An ancestor that names itself ends the path.
    for (const anchor of ownCandidates(p)) {
      if (!findsOnly(doc, anchor, p)) continue;
      const s = `${anchor} > ${parts.join(' > ')}`;
      if (findsOnly(doc, s, el)) return s;
    }
    parts.unshift(step(p));
    const s = parts.join(' > ');
    if (findsOnly(doc, s, el)) return s;
  }
  return null;
}

const KIND = { img: 'Picture', picture: 'Picture', svg: 'Icon or logo', video: 'Video', canvas: 'Drawing', iframe: 'Embedded frame', input: 'Text box', textarea: 'Text box', button: 'Button', a: 'Link' };

/** A few words that say what was picked, for the fixes list. */
export function describeElement(el) {
  if (!el) return '';
  const named = el.getAttribute?.('aria-label') || el.getAttribute?.('alt') || el.getAttribute?.('title');
  const text = tagOf(el) === 'input' || tagOf(el) === 'textarea' ? '' : (el.innerText ?? el.textContent ?? '');
  const words = tidyLabel(named || text);
  if (words) return tidyLabel(`“${words.length > 40 ? `${words.slice(0, 39).trimEnd()}…` : words}”`);
  return KIND[tagOf(el)] ?? 'Part of the page';
}
