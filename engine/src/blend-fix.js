// Sunglasses at Night: light overlays that blend (T032).
// A storefront lays a light tint (#f7f7f7, rgba(0,0,0,.03)) over a product
// photo with mix-blend-mode: multiply. On a white page that tint is invisible.
// Once a dark engine darkens it, or inverts it, multiply with near-black blacks
// out the photo and the buttons under it. A tint meant for a white page has no
// job on a dark one, so such an element gets a transparent background and
// normal blending. Both engines use this decision; each applies it its own way.

import { parseColor, relativeLuminance } from './color.js';

// Blend modes that turn what is under them near-black once the backdrop is dark.
export const BLEND_FIX_RE = /^(?:multiply|darken|color-burn|luminosity)$/i;
// Media are handled by their own rules (the engines reset their blend/filter).
const MEDIA = new Set(['img', 'picture', 'video', 'canvas', 'svg', 'iframe', 'embed', 'object']);
const HTML_NS = 'http://www.w3.org/1999/xhtml';
export const OVERLAY_LIGHT = 0.85;
export const OVERLAY_CLEAR_ALPHA = 0.1;

/** True for a background that is light (L >= 0.85) or near-transparent. */
export function lightOrClear(color) {
  const c = parseColor(color);
  if (!c) return true;
  return c.alpha < OVERLAY_CLEAR_ALPHA || relativeLuminance(c) >= OVERLAY_LIGHT;
}

/**
 * Is `el` a light overlay that should stop blending? `blend` is its computed
 * mix-blend-mode; `bgColor` and `bgImage` are its AUTHORED background (an
 * engine that already rewrote colors reads them with its sheets off).
 */
export function isBlendOverlay(el, blend, bgColor, bgImage) {
  if (el.namespaceURI !== HTML_NS || MEDIA.has(el.localName)) return false;
  if (!blend || !BLEND_FIX_RE.test(blend.trim())) return false;
  // An element that is itself a picture (url()/gradient layer) is media-like.
  if (bgImage && bgImage !== 'none') return false;
  return lightOrClear(bgColor);
}

export const OVERLAY_DECLS = Object.freeze([
  ['background-color', 'transparent'],
  ['mix-blend-mode', 'normal'],
]);
