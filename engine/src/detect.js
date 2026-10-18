// Sunglasses for Safari: already-dark detection.
// Decides whether a page is dark on its own, so we leave it alone (F6).
// Pure: the caller reads computed styles and the color-scheme meta tag and
// passes them in as strings, so the same code runs in early.js and node:test.
//
// Signals, in order:
//   1. Used color scheme, from the root's computed `color-scheme` (CSS wins)
//      or else `<meta name="color-scheme">`. It decides the canvas color a
//      transparent page shows through to.
//   2. Page background: body background over root background over canvas.
//      (When the root is transparent the body's background propagates to the
//      canvas; compositing all three covers both cases.)
//   3. Text color: a page only counts as dark if its text is lighter than its
//      background, so dark-on-darkish pages still get the readability fix.
// If no background color can be read at all, the used scheme decides.

import { parseColor, composite, relativeLuminance } from './color.js';

// Below this WCAG relative luminance a background reads as dark. 0.1 is
// about rgb(89 89 89); common dark themes sit between 0.005 and 0.06.
export const DARK_LUMINANCE = 0.1;

const WHITE = Object.freeze({ r: 1, g: 1, b: 1, alpha: 1 });
// Approximation of the dark canvas WebKit paints for `color-scheme: dark`.
const DARK_CANVAS = Object.freeze({ r: 30 / 255, g: 30 / 255, b: 30 / 255, alpha: 1 });

/**
 * Parse a `color-scheme` value (CSS property or meta content).
 * Returns { light, dark, only }. `normal`, empty and unknown-only values
 * support neither scheme explicitly.
 */
export function parseColorScheme(value) {
  const out = { light: false, dark: false, only: false };
  if (typeof value !== 'string') return out;
  const toks = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (toks.includes('normal')) return out;
  for (const t of toks) {
    if (t === 'light') out.light = true;
    else if (t === 'dark') out.dark = true;
    else if (t === 'only') out.only = true;
  }
  if (!out.light && !out.dark) out.only = false;
  return out;
}

const declares = (cs) => cs.light || cs.dark;

/**
 * The scheme the browser uses for the page: 'dark' or 'light'.
 * `css` is the root's computed color-scheme, `meta` the meta tag content.
 * A page supporting both follows the system; one supporting none is light.
 */
export function usedColorScheme({ css, meta, systemDark = false } = {}) {
  const fromCss = parseColorScheme(css);
  const cs = declares(fromCss) ? fromCss : parseColorScheme(meta);
  if (cs.dark && cs.light) return systemDark === true ? 'dark' : 'light';
  return cs.dark ? 'dark' : 'light';
}

const asOpaqueOrNull = (s) => (typeof s === 'string' ? parseColor(s) : null);

/**
 * Decide whether a page is already dark.
 * Inputs are computed-style strings (any CSS color syntax color.js parses):
 *   rootBg, bodyBg, rootColor, bodyColor, colorScheme (root computed),
 *   metaColorScheme, systemDark.
 * Returns { dark, reason, scheme, luminance } where luminance is the page
 * background's WCAG relative luminance, or null when it couldn't be read.
 */
export function detectAlreadyDark({
  rootBg, bodyBg, rootColor, bodyColor, colorScheme, metaColorScheme, systemDark = false,
} = {}) {
  const scheme = usedColorScheme({ css: colorScheme, meta: metaColorScheme, systemDark });
  const root = asOpaqueOrNull(rootBg), body = asOpaqueOrNull(bodyBg);
  if (!root && !body) {
    return scheme === 'dark'
      ? { dark: true, reason: 'scheme-dark', scheme, luminance: null }
      : { dark: false, reason: 'no-background', scheme, luminance: null };
  }
  const canvas = scheme === 'dark' ? DARK_CANVAS : WHITE;
  let page = canvas;
  if (root) page = composite(root, page);
  if (body) page = composite(body, page);
  const luminance = relativeLuminance(page);
  if (luminance >= DARK_LUMINANCE) return { dark: false, reason: 'light-background', scheme, luminance };
  const text = asOpaqueOrNull(bodyColor) ?? asOpaqueOrNull(rootColor);
  if (text && relativeLuminance(composite(text, page)) <= luminance) {
    return { dark: false, reason: 'dark-text', scheme, luminance };
  }
  return { dark: true, reason: 'dark-background', scheme, luminance };
}

/**
 * Final decision once the page's own colors are known.
 * `activation` is activation.decide()'s result; `detectDark` the resolved
 * per-site setting (settings.resolveSite); `detection` detectAlreadyDark()'s
 * result, or null when it hasn't run. Returns { apply, reason }.
 */
export function finalDecision({ activation, detectDark = true, detection = null } = {}) {
  if (!activation?.on) return { apply: false, reason: activation?.reason ?? 'inactive' };
  if (detectDark === true && detection?.dark === true) return { apply: false, reason: 'already-dark' };
  return { apply: true, reason: activation.reason };
}
