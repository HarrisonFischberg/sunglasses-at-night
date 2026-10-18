// In-page checks for the WebKit e2e run, bundled into a classic script and
// exposed as globalThis.__sanAudit. Independent of the engine's own contrast
// pass: it measures what the browser actually computed.

import { parseColor, composite, contrastRatio, relativeLuminance, srgbToOklch } from '../engine/src/color.js';

const MARK = 'data-sunglasses-at-night';
const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'title', 'head', 'option']);
const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role="button"],[onclick]';

const isOurs = (el) => el.hasAttribute(MARK);
// The harness's stand-in for Safari's manifest css (a user stylesheet, not a
// DOM node in Safari): neither the page's nor the engine's element.
const isManifestStandIn = (el) => el.getAttribute(MARK) === 'manifest-base';

// Every element in tree order, descending into open shadow roots.
function walk(root, out = []) {
  for (const el of root.querySelectorAll('*')) {
    out.push(el);
    if (el.shadowRoot) walk(el.shadowRoot, out);
  }
  return out;
}

function paintParent(el) {
  if (el.assignedSlot) return el.assignedSlot;
  if (el.parentElement) return el.parentElement;
  const root = el.parentNode;
  return root && root.nodeType === 11 ? root.host : null;
}

// Composite background colors up the flat tree onto the UA canvas.
function effectiveBackground(el) {
  const layers = [];
  for (let e = el; e; e = paintParent(e)) {
    const c = parseColor(getComputedStyle(e).backgroundColor);
    if (c && c.alpha > 0) {
      layers.push(c);
      if (c.alpha >= 1) break;
    }
  }
  let bg = { r: 1, g: 1, b: 1, alpha: 1 }; // canvas when nothing paints: white (worst case)
  for (let i = layers.length - 1; i >= 0; i--) bg = composite(layers[i], bg);
  return { ...bg, alpha: 1 };
}

function describe(el) {
  const id = el.id ? `#${el.id}` : '';
  const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
  const where = el.getRootNode() instanceof ShadowRoot ? ` (in shadow of <${el.getRootNode().host.localName}>)` : '';
  return `<${el.localName}${id}${cls}>${where}`;
}

function visible(el, cs) {
  if (cs.display === 'none' || cs.visibility !== 'visible' || Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * The color painted behind everything: the root's background, or the body's
 * when the root's is transparent (it propagates to the canvas), over the
 * canvas color of the root's color scheme. Works while the page is loading.
 */
export function canvasColor() {
  const rs = getComputedStyle(document.documentElement);
  let c = parseColor(rs.backgroundColor);
  if ((!c || c.alpha === 0) && document.body) c = parseColor(getComputedStyle(document.body).backgroundColor);
  const scheme = rs.colorScheme ?? '';
  const dark = /\bdark\b/.test(scheme) && (!/\blight\b/.test(scheme) || matchMedia('(prefers-color-scheme: dark)').matches);
  const canvas = dark ? { r: 30 / 255, g: 30 / 255, b: 30 / 255, alpha: 1 } : { r: 1, g: 1, b: 1, alpha: 1 };
  const out = c && c.alpha > 0 ? composite(c, canvas) : canvas;
  return {
    root: rs.backgroundColor, scheme, bodyChildren: document.body ? document.body.children.length : -1,
    rgb: [out.r, out.g, out.b].map((v) => Math.round(v * 255)), luminance: +relativeLuminance(out).toFixed(3),
  };
}

const MEDIA_SELECTOR = 'img,picture,video,canvas,svg,iframe,embed,object';

/**
 * The share of the viewport painted light (OKLCH L > 0.9), from a grid of
 * points: each point's color is the topmost element's background composited
 * up the tree onto the canvas. Points on media boxes count as not light
 * (images are allowed to be bright). Cheap enough to run every frame.
 */
export function lightFraction({ cols = 32, rows = 24, threshold = 0.9 } = {}) {
  const canvas = canvasColor();
  const base = { r: canvas.rgb[0] / 255, g: canvas.rgb[1] / 255, b: canvas.rgb[2] / 255, alpha: 1 };
  let light = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols) * innerWidth, y = ((j + 0.5) / rows) * innerHeight;
      const el = document.elementFromPoint(x, y);
      if (!el || el.closest(MEDIA_SELECTOR)) continue;
      const layers = [];
      for (let e = el; e; e = paintParent(e)) {
        const c = parseColor(getComputedStyle(e).backgroundColor);
        if (c && c.alpha > 0) {
          layers.push(c);
          if (c.alpha >= 1) break;
        }
      }
      let bg = base;
      for (let k = layers.length - 1; k >= 0; k--) bg = composite(layers[k], bg);
      if (srgbToOklch(bg).l > threshold) light++;
    }
  }
  return { lightShare: +(light / (cols * rows)).toFixed(4) };
}

/** Structure + pointer-events + hit-testing, for before/after comparison. */
export function snapshot() {
  const els = walk(document).filter((el) => !isOurs(el));
  return {
    ours: walk(document).filter((el) => isOurs(el) && !isManifestStandIn(el)).map((el) => el.localName),
    elements: els.map((el) => {
      const cs = getComputedStyle(el);
      let hittable = null;
      if (el.matches(INTERACTIVE) && visible(el, cs)) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) {
          const hit = el.getRootNode().elementFromPoint(x, y);
          hittable = hit === el || el.contains(hit);
        }
      }
      return { tag: el.localName, pointerEvents: cs.pointerEvents, hittable, label: describe(el) };
    }),
  };
}

/** Darkness and contrast of every visible text-bearing element. */
export function audit({ minContrast = 4.5, maxTextBgLuminance = 0.2 } = {}) {
  const rootBg = effectiveBackground(document.documentElement);
  const failures = [];
  let checked = 0, minRatio = Infinity, maxLum = 0;
  for (const el of walk(document)) {
    if (isOurs(el) || SKIP_TAGS.has(el.localName)) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const fill = cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color;
    const fg = parseColor(fill);
    if (!fg || fg.alpha === 0) continue;
    const bg = effectiveBackground(el);
    const ratio = contrastRatio(fg, bg);
    const lum = relativeLuminance(bg);
    checked++;
    minRatio = Math.min(minRatio, ratio);
    maxLum = Math.max(maxLum, lum);
    if (ratio < minContrast || lum > maxTextBgLuminance) {
      failures.push({ el: describe(el), text: text.slice(0, 40), color: fill, background: cs.backgroundColor, ratio: +ratio.toFixed(2), bgLuminance: +lum.toFixed(3) });
    }
  }
  return {
    rootLuminance: +relativeLuminance(rootBg).toFixed(3),
    checked, minRatio: +minRatio.toFixed(2), maxTextBgLuminance: +maxLum.toFixed(3), failures,
  };
}
