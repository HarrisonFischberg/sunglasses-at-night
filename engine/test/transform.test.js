import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_CONTRAST, ROLES, DARK_ISLAND_L, DEFAULT_LOOK, PRESETS, normalizeLook, isIdentityLook, applyLook,
  transformColor, quantize, opaqueBackdrop, ensureContrast, transformPair,
} from '../src/transform.js';
import { LOOK_RANGES } from '../src/settings.js';
import { parseColor, contrastRatio, srgbToOklch, formatRgb } from '../src/color.js';

// Seeded PRNG (mulberry32) so property failures are reproducible.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomColor(rand, { translucent = 0 } = {}) {
  const alpha = rand() < translucent ? Math.round(rand() * 1000) / 1000 : 1;
  return { r: rand(), g: rand(), b: rand(), alpha };
}

function randomLook(rand) {
  const look = {};
  for (const [k, r] of Object.entries(LOOK_RANGES)) look[k] = r.min + Math.round(rand() * (r.max - r.min));
  return look;
}

// Contrast of colors as they'd be written to CSS and read back.
const cssRatio = (fg, bg) => contrastRatio(parseColor(formatRgb(fg)), parseColor(formatRgb(bg)));

function hueDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ------------------------------------------------------ contrast property

test('property: 10,000 random text/bg pairs with random looks → output ratio ≥ 4.5', () => {
  const rand = rng(0x5eed);
  let worst = Infinity, failures = 0;
  for (let i = 0; i < 10000; i++) {
    const fg = randomColor(rand, { translucent: 0.25 });
    const bg = randomColor(rand, { translucent: 0.25 });
    const look = rand() < 0.3 ? DEFAULT_LOOK : randomLook(rand);
    const out = transformPair(fg, bg, { look });
    const r = cssRatio(out.fg, out.backdrop);
    worst = Math.min(worst, r);
    if (!(r >= MIN_CONTRAST)) failures++;
  }
  assert.equal(failures, 0, `worst ratio ${worst}`);
  assert.ok(worst >= 4.5);
});

test('property: ensureContrast on 10,000 random raw pairs (any bg, light or dark) → ratio ≥ 4.5', () => {
  const rand = rng(42);
  let worst = Infinity;
  for (let i = 0; i < 10000; i++) {
    const fg = randomColor(rand, { translucent: 0.2 });
    const bg = randomColor(rand);
    const out = ensureContrast(fg, bg);
    worst = Math.min(worst, cssRatio(out, bg));
  }
  assert.ok(worst >= 4.5, `worst ratio ${worst}`);
});

test('property: string inputs from CSS round-trip through transformPair', () => {
  const rand = rng(7);
  for (let i = 0; i < 500; i++) {
    const fg = formatRgb(randomColor(rand));
    const bg = formatRgb(randomColor(rand, { translucent: 0.5 }));
    const out = transformPair(fg, bg);
    assert.ok(cssRatio(out.fg, out.backdrop) >= 4.5, `${fg} on ${bg}`);
  }
});

test('ensureContrast leaves a pair that already passes unchanged (quantized)', () => {
  const out = ensureContrast('#eeeeee', '#202020');
  assert.deepEqual(out, quantize(parseColor('#eeeeee')));
});

test('ensureContrast moves only lightness: hue kept for chromatic text', () => {
  const rand = rng(99);
  let checked = 0;
  for (let i = 0; i < 2000; i++) {
    const fg = randomColor(rand), bg = randomColor(rand);
    const out = ensureContrast(fg, bg);
    const a = srgbToOklch(fg), b = srgbToOklch(out);
    if (a.c < 0.08 || b.c < 0.05) continue; // hue is ill-defined near gray / after 8-bit snapping
    checked++;
    assert.ok(hueDiff(a.h, b.h) < 6, `hue ${a.h} → ${b.h}`);
  }
  assert.ok(checked > 200, `only ${checked} chromatic samples`);
});

test('ensureContrast picks the direction with more headroom', () => {
  const onDark = srgbToOklch(ensureContrast('#333333', '#111111'));
  const onLight = srgbToOklch(ensureContrast('#cccccc', '#f0f0f0'));
  assert.ok(onDark.l > srgbToOklch(parseColor('#333333')).l);
  assert.ok(onLight.l < srgbToOklch(parseColor('#cccccc')).l);
});

test('ensureContrast makes faint translucent text opaque when it must', () => {
  const out = ensureContrast({ r: 1, g: 1, b: 1, alpha: 0.1 }, '#000000');
  assert.equal(out.alpha, 1);
  assert.ok(contrastRatio(out, parseColor('#000000')) >= 4.5);
  const keep = ensureContrast({ r: 0.4, g: 0.4, b: 0.4, alpha: 0.9 }, '#000000');
  assert.equal(keep.alpha, 0.9);
  assert.ok(contrastRatio(keep, parseColor('#000000')) >= 4.5);
});

test('ensureContrast honours a custom minimum and returns the extreme when unreachable', () => {
  const aaa = ensureContrast('#777777', '#000000', { min: 7 });
  assert.ok(contrastRatio(aaa, parseColor('#000000')) >= 7);
  const mid = parseColor('#767676'); // ≈4.6 against both white and black
  const capped = ensureContrast('#777777', mid, { min: 10 });
  assert.ok([0, 1].includes(capped.r) && capped.r === capped.g && capped.g === capped.b);
});

test('ensureContrast composites a translucent background over the canvas', () => {
  const bg = { r: 1, g: 1, b: 1, alpha: 0.5 };
  const out = ensureContrast('#888888', bg, { canvas: parseColor('#000000') });
  assert.ok(contrastRatio(out, opaqueBackdrop(bg, parseColor('#000000'))) >= 4.5);
  assert.deepEqual(opaqueBackdrop(bg, parseColor('#000000')).alpha, 1);
});

test('unparseable input → null', () => {
  assert.equal(ensureContrast('var(--x)', '#000'), null);
  assert.equal(ensureContrast('#fff', 'nope'), null);
  assert.equal(transformPair('nope', '#fff'), null);
  assert.equal(transformColor('nope', 'bg'), null);
  assert.equal(transformColor('#fff', 'shadow'), null);
  assert.equal(applyLook('nope', DEFAULT_LOOK), null);
});

test('transformPair ignores an unparseable canvas and uses the mapped page white', () => {
  const a = transformPair('#000', 'transparent', { canvas: 'nope' });
  const b = transformPair('#000', 'transparent');
  assert.deepEqual(a, b);
});

// ------------------------------------------------------- slider identity

test('slider identity: applyLook at defaults returns every color unchanged', () => {
  const rand = rng(1);
  for (let i = 0; i < 1000; i++) {
    const c = randomColor(rand, { translucent: 0.3 });
    assert.deepEqual(applyLook(c, DEFAULT_LOOK), c);
    assert.deepEqual(applyLook(c, {}), c);
    assert.deepEqual(applyLook(c, undefined), c);
    assert.deepEqual(applyLook(c, PRESETS.standard), c);
  }
});

test('slider identity: transformColor with default look equals no look, for every role', () => {
  const rand = rng(2);
  for (let i = 0; i < 1000; i++) {
    const c = randomColor(rand, { translucent: 0.3 });
    for (const role of ROLES) {
      const base = transformColor(c, role);
      assert.deepEqual(transformColor(c, role, DEFAULT_LOOK), base);
      assert.deepEqual(transformColor(c, role, { brightness: 100 }), base);
    }
  }
});

test('DEFAULT_LOOK matches the settings defaults and is the identity', () => {
  for (const [k, r] of Object.entries(LOOK_RANGES)) assert.equal(DEFAULT_LOOK[k], r.default);
  assert.ok(isIdentityLook(DEFAULT_LOOK));
  assert.ok(isIdentityLook(undefined));
  assert.ok(!isIdentityLook({ sepia: 1 }));
});

test('normalizeLook clamps, rounds and rejects like the settings schema', () => {
  assert.deepEqual(normalizeLook({ brightness: 400, contrast: 10, sepia: 33.6, grayscale: 'x' }),
    { brightness: 150, contrast: 50, sepia: 34, grayscale: 0 });
  assert.deepEqual(normalizeLook({ brightness: NaN }), { ...DEFAULT_LOOK });
  assert.deepEqual(normalizeLook(null), { ...DEFAULT_LOOK });
});

// --------------------------------------------------------------- presets

test('four presets, each a valid normalized look, all distinct', () => {
  const ids = Object.keys(PRESETS);
  assert.equal(ids.length, 4);
  for (const id of ids) assert.deepEqual(normalizeLook(PRESETS[id]), { ...PRESETS[id] });
  const sigs = new Set(ids.map((id) => JSON.stringify(PRESETS[id])));
  assert.equal(sigs.size, 4);
  assert.ok(Object.isFrozen(PRESETS) && ids.every((id) => Object.isFrozen(PRESETS[id])));
});

test('every preset keeps the contrast guarantee on common page pairs', () => {
  const pairs = [['#000', '#fff'], ['#333', '#f5f5f5'], ['#0645ad', '#fff'], ['#fff', '#1a73e8'],
    ['#767676', '#fff'], ['#fff', '#000'], ['#c00', '#fee'], ['#999', 'transparent']];
  for (const look of Object.values(PRESETS)) {
    for (const [fg, bg] of pairs) {
      const out = transformPair(fg, bg, { look });
      assert.ok(cssRatio(out.fg, out.backdrop) >= 4.5, `${fg} on ${bg} with ${JSON.stringify(look)}`);
    }
  }
});

test('mono preset removes chroma; warm preset tints toward amber', () => {
  const mono = srgbToOklch(transformColor('#1a73e8', 'bg', PRESETS.mono));
  assert.ok(mono.c < 0.002, `chroma ${mono.c}`);
  const warm = srgbToOklch(transformColor('#ffffff', 'bg', PRESETS.warm));
  assert.ok(warm.c > 0.01 && hueDiff(warm.h, 70) < 10, `warm ${warm.h}/${warm.c}`);
});

// --------------------------------------------------------------- mapping

test('mapping: white page → dark bg, black text → light text, borders between', () => {
  const bg = srgbToOklch(transformColor('#ffffff', 'bg'));
  const fg = srgbToOklch(transformColor('#000000', 'fg'));
  const border = srgbToOklch(transformColor('#cccccc', 'border'));
  assert.ok(bg.l < 0.25, `bg L ${bg.l}`);
  assert.ok(fg.l > 0.85, `fg L ${fg.l}`);
  assert.ok(border.l > bg.l && border.l < fg.l, `border L ${border.l}`);
  assert.ok(contrastRatio(transformColor('#000', 'fg'), transformColor('#fff', 'bg')) >= 7);
});

test('mapping inverts lightness order within a role', () => {
  const grays = ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff'];
  for (const role of ROLES) {
    // Backgrounds already dark stay as authored (T025), so only the ones
    // lighter than the island threshold are inverted.
    const src = role === 'bg' ? grays.filter((g) => srgbToOklch(parseColor(g)).l > DARK_ISLAND_L) : grays;
    const ls = src.map((g) => srgbToOklch(transformColor(g, role)).l);
    assert.ok(ls.length >= 3);
    for (let i = 1; i < ls.length; i++) assert.ok(ls[i] < ls[i - 1], `${role}: ${ls}`);
  }
});

test('mapping keeps dark backgrounds as authored and joins the inverted range at the threshold', () => {
  for (const g of ['#000000', '#202020', '#404040']) {
    const l = srgbToOklch(parseColor(g)).l;
    if (l <= DARK_ISLAND_L) assert.ok(Math.abs(srgbToOklch(transformColor(g, 'bg')).l - l) < 0.005, g);
  }
  assert.equal(formatRgb(quantize(transformColor('#000000', 'bg'))), 'rgb(0 0 0)');
});

test('mapping preserves hue for chromatic colors', () => {
  const rand = rng(3);
  let checked = 0;
  for (let i = 0; i < 2000; i++) {
    const c = randomColor(rand);
    const src = srgbToOklch(c);
    if (src.c < 0.05) continue;
    for (const role of ROLES) {
      const out = srgbToOklch(transformColor(c, role));
      if (out.c < 0.02) continue;
      checked++;
      assert.ok(hueDiff(src.h, out.h) < 3, `${role} hue ${src.h} → ${out.h}`);
    }
  }
  assert.ok(checked > 1000);
});

test('mapping keeps alpha', () => {
  const out = transformColor({ r: 1, g: 1, b: 1, alpha: 0.4 }, 'bg');
  assert.equal(out.alpha, 0.4);
  assert.equal(transformColor('rgb(0 0 0 / 0.25)', 'fg').alpha, 0.25);
});

// --------------------------------------------------------------- sliders

test('sliders: brightness and contrast move lightness; grayscale removes chroma', () => {
  const L = (look, c = '#ffffff', role = 'bg') => srgbToOklch(transformColor(c, role, look)).l;
  assert.ok(L({ brightness: 50 }) < L({}));
  assert.ok(L({ brightness: 150 }) > L({}));
  const spread = (look) => L(look, '#000000', 'fg') - L(look);
  assert.ok(spread({ contrast: 150 }) > spread({}));
  assert.ok(spread({ contrast: 50 }) < spread({}));
  const gray = srgbToOklch(applyLook('#e53935', { grayscale: 100 }));
  assert.ok(gray.c < 0.002);
  const half = srgbToOklch(applyLook('#e53935', { grayscale: 50 }));
  assert.ok(half.c > gray.c && half.c < srgbToOklch(parseColor('#e53935')).c);
});

test('sliders: sepia 100 lands every color on the amber hue', () => {
  for (const c of ['#1a73e8', '#00ff00', '#808080', '#ff00ff']) {
    const out = srgbToOklch(applyLook(c, { sepia: 100 }));
    assert.ok(hueDiff(out.h, 70) < 5, `${c} → ${out.h}`);
  }
});

test('quantize snaps to formatRgb precision', () => {
  const q = quantize({ r: 0.123456, g: 0.5, b: 1.2, alpha: 0.12345 });
  assert.equal(formatRgb(q), formatRgb({ r: 0.123456, g: 0.5, b: 1.2, alpha: 0.12345 }));
  assert.deepEqual(parseColor(formatRgb(q)), q);
});
