// Sunglasses for Safari: color transform.
// Maps a light page's background, text and border colors to dark equivalents
// in OKLCH (lightness remapped, hue kept, chroma tempered), applies the look
// sliders, and guarantees text-on-background contrast of at least 4.5:1
// (WCAG AA) by moving text lightness only. Pure functions: no DOM, no network.
//
// Colors in and out are sRGB objects `{ r, g, b, alpha }` (0..1) as produced
// by color.js; CSS color strings are accepted as input too.

import { parseColor, srgbToOklch, convert, inSrgbGamut, composite, contrastRatio } from './color.js';
import { LOOK_RANGES } from './settings.js';

export const MIN_CONTRAST = 4.5;
export const ROLES = Object.freeze(['bg', 'fg', 'border']);

// OKLCH lightness bands per role. Input lightness is inverted into the band:
// white backgrounds land at `lo`, black text lands at `hi`.
const BANDS = {
  bg: { lo: 0.19, hi: 0.44, chroma: 0.8, maxChroma: 0.12 },
  fg: { lo: 0.72, hi: 0.94, chroma: 0.9, maxChroma: 0.2 },
  border: { lo: 0.32, hi: 0.5, chroma: 0.7, maxChroma: 0.1 },
};

// Sepia tint target in OKLab polar form (a warm amber).
const SEPIA_HUE = 70;
const SEPIA_CHROMA = 0.06;

export const DEFAULT_LOOK = Object.freeze(
  Object.fromEntries(Object.entries(LOOK_RANGES).map(([k, r]) => [k, r.default])),
);

// Four original presets. Values are look slider percentages (see LOOK_RANGES).
export const PRESETS = Object.freeze({
  standard: Object.freeze({ brightness: 100, contrast: 100, sepia: 0, grayscale: 0 }),
  soft: Object.freeze({ brightness: 90, contrast: 85, sepia: 0, grayscale: 0 }),
  warm: Object.freeze({ brightness: 95, contrast: 95, sepia: 40, grayscale: 0 }),
  mono: Object.freeze({ brightness: 100, contrast: 105, sepia: 0, grayscale: 100 }),
});

const WHITE = Object.freeze({ r: 1, g: 1, b: 1, alpha: 1 });
const BLACK = Object.freeze({ r: 0, g: 0, b: 0, alpha: 1 });

const clip01 = (v) => Math.min(1, Math.max(0, v));
const asColor = (c) => (typeof c === 'string' ? parseColor(c) : c ?? null);

// OKLCH → sRGB keeping hue and lightness exactly: out-of-gamut colors lose
// chroma only. (color.js's CSS gamut mapping clips within a just-noticeable
// difference, which can turn hue by ~10° at low lightness.)
function oklchToSrgb({ l, c, h, alpha = 1 }) {
  const raw = (chroma) => convert({ space: 'oklch', coords: [clip01(l), chroma, h], alpha }, 'srgb').coords;
  const fits = (v) => inSrgbGamut({ r: v[0], g: v[1], b: v[2] });
  let rgb = raw(c);
  if (!fits(rgb)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(raw(mid))) lo = mid;
      else hi = mid;
    }
    rgb = raw(lo);
  }
  return { r: clip01(rgb[0]), g: clip01(rgb[1]), b: clip01(rgb[2]), alpha };
}

// ------------------------------------------------------------------ look

/** Fill missing slider values with defaults; clamp and round present ones. */
export function normalizeLook(look) {
  const out = {};
  for (const [k, r] of Object.entries(LOOK_RANGES)) {
    const v = look?.[k];
    out[k] = typeof v === 'number' && Number.isFinite(v)
      ? Math.min(r.max, Math.max(r.min, Math.round(v)))
      : r.default;
  }
  return out;
}

export function isIdentityLook(look) {
  const n = normalizeLook(look);
  return Object.keys(DEFAULT_LOOK).every((k) => n[k] === DEFAULT_LOOK[k]);
}

// Sliders act in OKLCH. Each step is skipped at its identity value, so the
// default look is an exact no-op (no float drift).
function applyLookOklch(o, look) {
  let { l, c, h } = o;
  if (look.grayscale !== 0) c *= 1 - look.grayscale / 100;
  if (look.sepia !== 0) {
    const t = look.sepia / 100, r = h * Math.PI / 180, s = SEPIA_HUE * Math.PI / 180;
    const a = c * Math.cos(r) + (SEPIA_CHROMA * Math.cos(s) - c * Math.cos(r)) * t;
    const b = c * Math.sin(r) + (SEPIA_CHROMA * Math.sin(s) - c * Math.sin(r)) * t;
    c = Math.hypot(a, b);
    if (c > 1e-9) h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  }
  if (look.contrast !== 100) l = 0.5 + (l - 0.5) * (look.contrast / 100);
  if (look.brightness !== 100) l *= look.brightness / 100;
  return { l: clip01(l), c, h, alpha: o.alpha };
}

/** Apply look sliders to an sRGB color. Returns an equal copy at defaults. */
export function applyLook(color, look) {
  const col = asColor(color);
  if (!col) return null;
  const n = normalizeLook(look);
  if (isIdentityLook(n)) return { r: col.r, g: col.g, b: col.b, alpha: col.alpha ?? 1 };
  return oklchToSrgb(applyLookOklch(srgbToOklch(col), n));
}

// --------------------------------------------------------------- mapping

// A background already at or below this OKLCH lightness is a dark island on
// a light page (a code block, a hero, a dark button): it stays as authored.
// Lighter backgrounds are inverted across the whole bg band [lo, hi], so
// lightness order among them is kept (lighter source → darker output, no ties)
// with enough spread that swatches stay distinct, and chroma is tempered, not
// crushed.
export const DARK_ISLAND_L = 0.3;

function mapOklch(o, role) {
  const band = BANDS[role];
  if (role === 'bg') {
    if (o.l <= DARK_ISLAND_L) return { l: o.l, c: o.c, h: o.h, alpha: o.alpha };
    const t = (1 - clip01(o.l)) / (1 - DARK_ISLAND_L);
    return {
      l: band.lo + t * (band.hi - band.lo),
      c: Math.min(o.c * band.chroma, band.maxChroma),
      h: o.h,
      alpha: o.alpha,
    };
  }
  return {
    l: band.lo + (1 - clip01(o.l)) * (band.hi - band.lo),
    c: Math.min(o.c * band.chroma, band.maxChroma),
    h: o.h,
    alpha: o.alpha,
  };
}

/**
 * Map one color for `role` ('bg' | 'fg' | 'border') into its dark-mode
 * equivalent, then apply the look. Hue is preserved (except by sepia).
 * Returns null for unparseable input or an unknown role.
 */
export function transformColor(color, role, look) {
  const col = asColor(color);
  if (!col || !Object.hasOwn(BANDS, role)) return null;
  let o = mapOklch(srgbToOklch({ ...col, alpha: col.alpha ?? 1 }), role);
  const n = normalizeLook(look);
  if (!isIdentityLook(n)) o = applyLookOklch(o, n);
  return oklchToSrgb(o);
}

// -------------------------------------------------------------- contrast

/**
 * Snap to what `formatRgb` serializes (8-bit channels, alpha to 3 decimals),
 * so a contrast check on the result holds for the CSS actually written.
 */
export function quantize({ r, g, b, alpha = 1 }) {
  const q = (v) => Math.round(clip01(v) * 255 + 1e-9) / 255;
  return { r: q(r), g: q(g), b: q(b), alpha: Math.round(clip01(alpha) * 1000) / 1000 };
}

/** The opaque color a translucent `bg` shows over `canvas` (default black). */
export function opaqueBackdrop(bg, canvas = BLACK) {
  const b = asColor(bg);
  if (!b) return null;
  if ((b.alpha ?? 1) >= 1) return { ...b, alpha: 1 };
  const under = (canvas.alpha ?? 1) >= 1 ? canvas : composite(canvas, BLACK);
  return { ...composite(b, under), alpha: 1 };
}

const ratio = (fg, back) => contrastRatio(fg, back);

/**
 * Return `fg` (quantized) adjusted so its contrast on `bg` is ≥ `opts.min`
 * (default 4.5). Only OKLCH lightness moves (toward white or black, whichever
 * contrasts more); hue and chroma are kept where sRGB allows. If translucent
 * text can't reach the target even at the extreme, it is made opaque.
 * A translucent `bg` is first composited over `opts.canvas` (default black).
 * The returned color is always verified against the target.
 */
export function ensureContrast(fg, bg, opts = {}) {
  const min = opts.min ?? MIN_CONTRAST;
  const f = asColor(fg);
  const opaque = opaqueBackdrop(bg, opts.canvas);
  if (!f || !opaque) return null;
  // A composited backdrop may fall between 8-bit steps, so a result must pass
  // against both the exact backdrop and its 8-bit rendering.
  const back = quantize(opaque);
  const passes = (c) => ratio(c, back) >= min && ratio(c, opaque) >= min;
  let alpha = f.alpha ?? 1;
  const start = quantize({ ...f, alpha });
  if (passes(start)) return start;

  const extremeFor = (a) => {
    const w = quantize({ ...WHITE, alpha: a }), k = quantize({ ...BLACK, alpha: a });
    return ratio(w, back) >= ratio(k, back) ? { color: w, l: 1 } : { color: k, l: 0 };
  };
  let ext = extremeFor(alpha);
  if (!passes(ext.color)) {
    alpha = 1;
    const solid = quantize({ ...f, alpha });
    if (passes(solid)) return solid;
    ext = extremeFor(alpha);
  }
  // An opaque extreme always reaches √21 ≈ 4.58; a higher custom `min` may
  // be unreachable, and then the extreme is the best available answer.
  if (!passes(ext.color)) return ext.color;

  const o = srgbToOklch(f);
  let bad = o.l, good = ext.l, best = ext.color;
  for (let i = 0; i < 24; i++) {
    const l = (bad + good) / 2;
    const cand = quantize(oklchToSrgb({ l, c: o.c, h: o.h, alpha }));
    if (passes(cand)) {
      good = l;
      best = cand;
    } else {
      bad = l;
    }
  }
  return best;
}

/**
 * Transform a text-on-background pair for dark mode.
 * opts.look: slider values; opts.min: contrast target (default 4.5);
 * opts.canvas: what a translucent bg sits on (default: the mapped page white).
 * Returns `{ fg, bg, backdrop }` (quantized sRGB objects), where `backdrop`
 * is the opaque color the contrast guarantee was checked against, or null
 * when either color is unparseable.
 */
export function transformPair(fg, bg, opts = {}) {
  const look = opts.look;
  const bgIn = asColor(bg), fgIn = asColor(fg);
  if (!bgIn || !fgIn) return null;
  const canvas = asColor(opts.canvas) ?? quantize(transformColor(WHITE, 'bg', look));
  const bgOut = quantize(transformColor(bgIn, 'bg', look));
  const backdrop = quantize(opaqueBackdrop(bgOut, canvas));
  const fgOut = ensureContrast(transformColor(fgIn, 'fg', look), backdrop, { min: opts.min });
  return { fg: fgOut, bg: bgOut, backdrop };
}
