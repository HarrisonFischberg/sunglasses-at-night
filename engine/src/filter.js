// Sunglasses for Safari: filter fallback engine (T008, F10) and image modes (F5).
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
  return {
    stop: () => el.remove(),
    refresh: place,
    settle: async () => place(),
  };
}
