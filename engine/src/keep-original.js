// Sunglasses at Night: "Remove dark mode" for one part of a page (a fix with
// action 'original', fix-rules.js), dynamic engine. The engine rewrites the
// page's colors through its own sheets and data attributes, so a part can't
// be left out of it by selector alone. Instead, for one synchronous read, every
// sheet of ours is switched off (and the manifest base.css, through
// data-sunglasses-off), the site's own colors of the picked element and
// everything inside it are read, and then ours go back on, with no paint in
// between (the same trick dynamic.js syncCanvas uses). Those colors are
// pinned with `!important` rules keyed by a data attribute. A transparent
// picked element also gets the background the site shows behind it, so it
// doesn't sit on the dark page.
//
// Known limits: the page's own inline `!important` colors the engine wrote
// over, and the CSP adopted-sheet mirror, stay dark in the read. The read is
// redone each time the engine settles (content.js), so later page changes
// inside the part are picked up then. No network.

import { parseColor } from './color.js';

export const KEEP_ATTR = 'data-sunglasses-keep';
const MARK = 'data-sunglasses-at-night';
const OFF_ATTR = 'data-sunglasses-off';
// Per picked part; a huge container is better served by "Never dark".
export const MAX_KEEP_ELEMENTS = 600;
const PROPS = [
  'color', 'background-color', 'background-image',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', '-webkit-text-fill-color', 'caret-color',
  'fill', 'stroke', 'box-shadow', 'text-shadow', 'filter', 'color-scheme',
];
// An id selector that never matches, inside :is() only to raise the rule's
// specificity above the engine's own `!important` rules.
const LIFT = '#sunglasses-keep#sunglasses-keep';

const clear = (v) => { const c = parseColor(v); return !c || c.alpha === 0; };

function collect(doc, selectors) {
  const targets = [], els = [], seen = new Set();
  for (const s of selectors) {
    let t = null;
    try { t = doc.querySelector(s); } catch { /* a selector this browser can't parse */ }
    if (!t || seen.has(t)) continue;
    targets.push(t);
    for (const el of [t, ...t.querySelectorAll('*')]) {
      if (els.length >= MAX_KEEP_ELEMENTS * targets.length) break;
      if (seen.has(el) || el.hasAttribute(MARK)) continue;
      seen.add(el);
      els.push(el);
    }
  }
  return { targets, els };
}

// What the site paints behind `el`: the first ancestor with a background.
function backdrop(el, getCS) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const bg = getCS(p).backgroundColor;
    if (!clear(bg)) return bg;
  }
  return 'rgb(255, 255, 255)'; // the canvas the browser paints when the site sets none
}

/**
 * Mark the parts named by `selectors` and return the CSS that shows them as
 * the site made them ('' when none is on the page). Call it once the engine
 * is ready; it must run with the engine's sheets in place.
 */
export function keepOriginalCss({ document: doc, getComputedStyle: getCS, selectors }) {
  for (const el of doc.querySelectorAll(`[${KEEP_ATTR}]`)) el.removeAttribute(KEEP_ATTR);
  if (!selectors?.length) return '';
  const { targets, els } = collect(doc, selectors);
  if (!els.length) return '';
  const read = () => els.map((el) => {
    const cs = getCS(el);
    return PROPS.map((p) => cs.getPropertyValue(p));
  });
  const dark = read();
  const root = doc.documentElement;
  const ours = [...doc.querySelectorAll(`style[${MARK}]`)];
  const media = ours.map((st) => st.getAttribute('media'));
  const wasOff = root.hasAttribute(OFF_ATTR);
  let authored, behind;
  for (const st of ours) st.media = 'not all';
  if (!wasOff) root.setAttribute(OFF_ATTR, '');
  try {
    authored = read();
    behind = targets.map((t) => {
      const cs = getCS(t);
      const bare = clear(cs.backgroundColor) && (!cs.backgroundImage || cs.backgroundImage === 'none');
      return bare ? backdrop(t, getCS) : null;
    });
  } finally {
    ours.forEach((st, i) => { if (media[i] === null) st.removeAttribute('media'); else st.setAttribute('media', media[i]); });
    if (!wasOff) root.removeAttribute(OFF_ATTR);
  }
  const rules = [];
  els.forEach((el, i) => {
    const decls = [];
    PROPS.forEach((p, j) => {
      const v = authored[i][j];
      if (v && v !== dark[i][j]) decls.push(`${p}:${v}!important`);
    });
    const t = targets.indexOf(el);
    if (t >= 0 && behind[t]) decls.push(`background-color:${behind[t]}!important`);
    if (!decls.length) return;
    const id = String(rules.length + 1);
    el.setAttribute(KEEP_ATTR, id);
    rules.push(`:is([${KEEP_ATTR}="${id}"],${LIFT}){${decls.join(';')}}`);
  });
  return rules.join('\n');
}
