// Sunglasses at Night: filter fallback engine (T008, F10) and image modes (F5).
// For pages the dynamic engine breaks: one sheet inverts the whole page with
// a CSS filter on the root (invert, then hue-rotate so hues stay put) and
// counter-inverts media so photos, video and frames show as authored.
//
// Not double-inverted: the counter-filter goes only on the outermost media
// element. An <img> inside <picture>, a fallback inside <object>/<video>, or
// anything inside another countered element is left alone, because its
// ancestor's counter already undoes the page filter for it. Frames with a
// real document run the content script themselves, so the parent counters
// the <iframe> and the frame darkens itself; about:blank / srcdoc frames
// don't run it and stay under the page filter.
//
// Like the dynamic engine, it only adds one <style>; filters don't change
// layout, hit-testing or pointer events, and a filter on the root element
// doesn't create a containing block for fixed-position descendants.

import { normalizeLook } from './transform.js';
import { isBlendOverlay, OVERLAY_DECLS, BLEND_FIX_RE } from './blend-fix.js';

export const FILTER_ROLE = 'filter';

// Elements whose pixels should show as authored.
const MEDIA = [
  'img', 'video', 'canvas', 'embed', 'object',
  'iframe[src]:not([src=""]):not([src^="about:" i]):not([src^="javascript:" i]):not([srcdoc])',
];
// Of those, the ones that can contain other media.
const CONTAINERS = ['video', 'canvas', 'embed', 'object', 'iframe'];

const COUNTER = 'invert(100%) hue-rotate(180deg)';
export const DIM = 'brightness(80%)';

const outermost = (list, containers) => `:is(${list.join(',')}):not(:is(${containers.join(',')}) *)`;

/** The root filter for a look: invert + hue-rotate, then the look sliders. */
export function pageFilter(look) {
  const n = normalizeLook(look);
  let f = COUNTER;
  if (n.brightness !== 100) f += ` brightness(${n.brightness}%)`;
  if (n.contrast !== 100) f += ` contrast(${n.contrast}%)`;
  if (n.sepia) f += ` sepia(${n.sepia}%)`;
  if (n.grayscale) f += ` grayscale(${n.grayscale}%)`;
  return f;
}

/**
 * The filter engine's sheet. `images`: 'leave' and 'no-invert' show media as
 * authored ('no-invert' also keeps inline <svg> out of the inversion);
 * 'dim' shows media as authored at 80% brightness.
 */
export function filterCss(look, { images = 'leave', hideBackgroundImages = false } = {}) {
  const media = images === 'no-invert' ? [...MEDIA, 'svg'] : MEDIA;
  const containers = images === 'no-invert' ? [...CONTAINERS, 'svg'] : CONTAINERS;
  // Dim first: page(counter(dim(x))) = dim(x), so dimmed media keep their hues.
  const counter = images === 'dim' ? `${DIM} ${COUNTER}` : COUNTER;
  // The root's own background (or white when the page sets none) is painted
  // inside the filtered root, so the canvas inverts with everything else.
  let css =
    `:root{filter:${pageFilter(look)}!important;color-scheme:light!important}` +
    `:where(:root){background-color:#fff}` +
    `${outermost(media, containers)}{filter:${counter}!important}`;
  if (hideBackgroundImages) css += `*:not(svg *),*::before,*::after{background-image:none!important}`;
  return css;
}

/**
 * CSS the dynamic engine adds for an image mode. The dynamic engine never
 * inverts pixels, so 'leave' and 'no-invert' need nothing. Dim is opt-in, so
 * it wins over the page's own image filters, as the filter engine's does.
 */
export function dynamicImageCss(images) {
  return images === 'dim' ? `img,video,canvas,embed,object{filter:${DIM}!important}` : '';
}

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Start the filter engine on `document`. opts as filterCss(). The sheet is
 * the last child of the root so it follows every page sheet.
 * Returns { stop(), refresh(), settle() } like startDynamic.
 */
export function startFilter({ document, look, images, hideBackgroundImages, mark = 'data-sunglasses-at-night' }) {
  const el = document.createElementNS(HTML_NS, 'style');
  el.setAttribute(mark, FILTER_ROLE);
  el.textContent = filterCss(look, { images, hideBackgroundImages });
  const place = () => {
    const root = document.documentElement;
    if (root && root.lastChild !== el) root.appendChild(el);
  };
  place();
  const overlays = watchBlendOverlays(document);
  return {
    stop: () => {
      overlays.stop();
      el.remove();
    },
    refresh: place,
    settle: async () => place(),
  };
}

/**
 * T032: a light tint that multiplies over a photo (mix-blend-mode multiply,
 * darken, color-burn, luminosity) is inverted to dark by the page filter and
 * blacks out the photo under it. Such an element gets a transparent background
 * and normal blending, as inline `!important` (restored on stop). The filter
 * engine doesn't touch colors, so the computed background is the authored one.
 * Elements the page adds are checked in the mutation task, before paint.
 * A document without a window (the unit tests' fake) is skipped.
 */
function watchBlendOverlays(document) {
  const win = document.defaultView;
  const root = document.documentElement;
  if (!win || typeof win.MutationObserver !== 'function' || !root?.querySelectorAll) {
    return { stop() {} };
  }
  const touched = new Map(); // element → [[prop, original value, original priority]]
  let timer = null;

  const check = (el) => {
    if (el.nodeType !== 1 || touched.has(el) || el.hasAttribute('data-sunglasses-at-night')) return;
    const cs = win.getComputedStyle(el);
    if (!BLEND_FIX_RE.test(cs.mixBlendMode)) return;
    if (!isBlendOverlay(el, cs.mixBlendMode, cs.backgroundColor, cs.backgroundImage)) return;
    const saved = [];
    for (const [prop, value] of OVERLAY_DECLS) {
      saved.push([prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
      el.style.setProperty(prop, value, 'important');
    }
    touched.set(el, saved);
  };
  const checkTree = (node) => {
    if (node.nodeType !== 1) return;
    check(node);
    for (const el of node.querySelectorAll('*')) check(el);
  };
  const scanAll = () => {
    timer = null;
    checkTree(root);
  };
  const later = () => {
    if (timer === null) timer = win.setTimeout(scanAll, 100);
  };

  const observer = new win.MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') for (const n of r.addedNodes) checkTree(n);
      else check(r.target);
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  // A sheet that arrives after the markup restyles it without a mutation.
  const onLoad = (e) => {
    if (e.target?.localName === 'link') later();
  };
  document.addEventListener('load', onLoad, true);
  checkTree(root);

  return {
    stop() {
      observer.disconnect();
      document.removeEventListener('load', onLoad, true);
      if (timer !== null) win.clearTimeout(timer);
      for (const [el, saved] of touched) {
        for (const [prop, value, priority] of saved) {
          if (value) el.style.setProperty(prop, value, priority);
          else el.style.removeProperty(prop);
        }
      }
      touched.clear();
    },
  };
}
