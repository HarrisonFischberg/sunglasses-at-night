import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor,
  parseRaw,
  convert,
  formatRgb,
  formatHex,
  srgbToOklch,
  oklchToSrgb,
  inSrgbGamut,
  contrastRatio,
  relativeLuminance,
  composite,
  NAMED_COLORS,
} from '../src/color.js';

const close = (actual, expected, eps, msg) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${msg ?? ''} expected ${expected} ±${eps}, got ${actual}`);

const rgb = (input, opts) => {
  const c = parseColor(input, opts);
  assert.ok(c, `expected ${JSON.stringify(input)} to parse`);
  return formatRgb(c);
};

const invalid = (input) => assert.equal(parseColor(input), null, `expected ${JSON.stringify(input)} to be rejected`);

// ------------------------------------------------------------- hex + names

test('hex: #rgb, #rgba, #rrggbb, #rrggbbaa', () => {
  assert.equal(rgb('#f00'), 'rgb(255 0 0)');
  assert.equal(rgb('#f008'), 'rgb(255 0 0 / 0.533)');
  assert.equal(rgb('#336699'), 'rgb(51 102 153)');
  assert.equal(rgb('#33669980'), 'rgb(51 102 153 / 0.502)');
});

test('hex: uppercase and mixed case', () => {
  assert.equal(rgb('#FfF'), 'rgb(255 255 255)');
  assert.equal(rgb('#ABCDEF'), 'rgb(171 205 239)');
});

test('hex: invalid lengths and digits rejected', () => {
  for (const s of ['#', '#12', '#12345', '#1234567', '#ggg', '#12 34 56', '##fff']) invalid(s);
});

test('named colors: all 148 CSS keywords present', () => {
  assert.equal(Object.keys(NAMED_COLORS).length, 148);
  assert.equal(rgb('rebeccapurple'), 'rgb(102 51 153)');
  assert.equal(rgb('RED'), 'rgb(255 0 0)');
  assert.equal(rgb('grey'), rgb('gray'));
});

test('transparent is black at zero alpha', () => {
  assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, alpha: 0 });
});

test('currentcolor resolves only with opts.currentColor', () => {
  assert.equal(parseColor('currentColor'), null);
  assert.equal(rgb('currentcolor', { currentColor: '#00f' }), 'rgb(0 0 255)');
  assert.equal(parseColor('currentcolor', { currentColor: 'currentcolor' }), null, 'no self-recursion');
});

test('system colors and var() are unresolvable → null or fallback', () => {
  invalid('Canvas');
  invalid('var(--brand)');
  const fb = { r: 1, g: 1, b: 1, alpha: 1 };
  assert.equal(parseColor('LinkText', { fallback: fb }), fb);
});

test('garbage input rejected', () => {
  for (const s of ['', '   ', 'notacolor', 'rgb', 'rgb()', 'rgb(1 2 3', 'rgb(1 2 3) x', 'rgb(1 2 3))', null, 42]) {
    invalid(s);
  }
});

// -------------------------------------------------------------------- rgb

test('rgb legacy comma syntax with alpha', () => {
  assert.equal(rgb('rgb(255, 0, 0)'), 'rgb(255 0 0)');
  assert.equal(rgb('rgba(0,0,255,.5)'), 'rgb(0 0 255 / 0.5)');
  assert.equal(rgb('  Rgb( 0 , 0 , 0 )  '), 'rgb(0 0 0)');
  assert.equal(rgb('rgba(255, 0, 0)'), 'rgb(255 0 0)');
});

test('rgb modern space syntax with slash alpha', () => {
  assert.equal(rgb('rgb(255 128 0 / 50%)'), 'rgb(255 128 0 / 0.5)');
  assert.equal(rgb('rgb(10 20 30/0.25)'), 'rgb(10 20 30 / 0.25)');
  assert.equal(rgb('rgba(1 2 3)'), 'rgb(1 2 3)');
});

test('rgb percentages, and mixing allowed only in modern syntax', () => {
  assert.equal(rgb('rgb(50% 0% 100%)'), 'rgb(128 0 255)');
  assert.equal(rgb('rgb(100%, 0%, 0%)'), 'rgb(255 0 0)');
  assert.equal(rgb('rgb(100% 0 0)'), 'rgb(255 0 0)');
  invalid('rgb(100%, 0, 0)');
});

test('rgb out-of-range channels and alpha are clamped', () => {
  assert.equal(rgb('rgb(300 -20 0)'), 'rgb(255 0 0)');
  assert.equal(rgb('rgb(0 0 0 / 150%)'), 'rgb(0 0 0)');
  assert.equal(rgb('rgb(0 0 0 / -1)'), 'rgb(0 0 0 / 0)');
});

test('rgb scientific notation and decimals', () => {
  assert.equal(rgb('rgb(1e2 .5e1 0.4)'), 'rgb(100 5 0)');
  assert.equal(rgb('rgb(+10 0 0)'), 'rgb(10 0 0)');
});

test('rgb malformed separators rejected', () => {
  for (const s of ['rgb(1 2, 3)', 'rgb(1, 2)', 'rgb(1, 2, 3,)', 'rgb(1 2 3 4)', 'rgb(1 2 3 /)', 'rgb(1 2 3 / 4 5)', 'rgb(1px 2 3)']) {
    invalid(s);
  }
});

test('none keyword: modern only; treated as 0 for display', () => {
  assert.equal(rgb('rgb(none 128 0)'), 'rgb(0 128 0)');
  assert.equal(rgb('rgb(0 0 0 / none)'), 'rgb(0 0 0 / 0)');
  invalid('rgb(none, 0, 0)');
});

test('calc() in channels', () => {
  assert.equal(rgb('rgb(calc(255 / 2) 0 calc(10 * 2 + 5))'), 'rgb(128 0 25)');
  assert.equal(rgb('rgb(calc(-1 * -100) calc((1 + 1) * 10) 0)'), 'rgb(100 20 0)');
  invalid('rgb(calc(1px) 0 0)');
  invalid('rgb(calc(1 + ) 0 0)');
  invalid('rgb(calc(1 / 0) 0 0)');
});

// --------------------------------------------------------------- hsl, hwb

test('hsl legacy requires percentages for s and l', () => {
  assert.equal(rgb('hsl(120, 100%, 25%)'), 'rgb(0 128 0)');
  assert.equal(rgb('hsla(0, 100%, 50%, 0.5)'), 'rgb(255 0 0 / 0.5)');
  invalid('hsl(120, 100, 50)');
});

test('hsl modern with numbers, angle units and none', () => {
  assert.equal(rgb('hsl(120 100 50)'), 'rgb(0 255 0)');
  assert.equal(rgb('hsl(0.5turn 100% 50%)'), 'rgb(0 255 255)');
  assert.equal(rgb('hsl(200grad 100% 50%)'), 'rgb(0 255 255)');
  assert.equal(rgb('hsl(3.14159265rad 100% 50%)'), 'rgb(0 255 255)');
  assert.equal(rgb('hsl(-120deg 100% 50%)'), 'rgb(0 0 255)');
  assert.equal(rgb('hsl(none 0% 50%)'), 'rgb(128 128 128)');
  invalid('hsl(10% 100% 50%)');
});

test('hwb including whiteness + blackness ≥ 100%', () => {
  assert.equal(rgb('hwb(0 0% 0%)'), 'rgb(255 0 0)');
  assert.equal(rgb('hwb(240 20% 20%)'), 'rgb(51 51 204)');
  assert.equal(rgb('hwb(0 60% 60%)'), 'rgb(128 128 128)');
  invalid('hwb(0, 0%, 0%)');
});

// ------------------------------------------------- lab, lch, oklab, oklch

test('lab() and lch() of sRGB red', () => {
  assert.equal(rgb('lab(54.29 80.8 69.89)'), 'rgb(255 0 0)');
  assert.equal(rgb('lch(54.29 106.84 40.85)'), 'rgb(255 0 0)');
  assert.equal(rgb('lab(54.29% 64.64% 55.91%)'), 'rgb(255 0 0)');
});

test('oklab() and oklch() of sRGB red, numbers and percentages', () => {
  assert.equal(rgb('oklab(0.62796 0.22486 0.12585)'), 'rgb(255 0 0)');
  assert.equal(rgb('oklch(0.62796 0.25768 29.2339)'), 'rgb(255 0 0)');
  assert.equal(rgb('oklch(62.796% 64.42% 29.2339deg / 0.5)'), 'rgb(255 0 0 / 0.5)');
});

test('lab/oklab lightness clamps; L=100 is white and L=0 is black', () => {
  assert.equal(rgb('lab(150 0 0)'), 'rgb(255 255 255)');
  assert.equal(rgb('oklch(-1 0.3 30)'), 'rgb(0 0 0)');
});

test('legacy commas not allowed in lab-family functions', () => {
  invalid('lab(50, 0, 0)');
  invalid('oklch(0.5, 0.1, 30)');
});

// ---------------------------------------------------------------- color()

test('color() predefined RGB spaces map white to white', () => {
  for (const space of ['srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020']) {
    const c = parseColor(`color(${space} 1 1 1)`);
    for (const ch of ['r', 'g', 'b']) close(c[ch], 1, 1e-4, `${space}.${ch}`);
  }
});

test('color() xyz spaces: D65 and D50 white points map to white', () => {
  const d65 = parseColor('color(xyz-d65 0.95045592705 1 1.08905775076)');
  const xyz = parseColor('color(xyz 0.95045592705 1 1.08905775076)');
  const d50 = parseColor('color(xyz-d50 0.96429567643 1 0.82510460251)');
  for (const c of [d65, xyz, d50]) for (const ch of ['r', 'g', 'b']) close(c[ch], 1, 1e-4);
});

test('color(srgb-linear) applies the sRGB transfer curve', () => {
  assert.equal(rgb('color(srgb-linear 0.5 0.5 0.5)'), 'rgb(188 188 188)');
  assert.equal(rgb('color(srgb 50% 0 1 / 25%)'), 'rgb(128 0 255 / 0.25)');
});

test('sRGB red in display-p3 coordinates matches reference', () => {
  const p3 = convert(parseRaw('red'), 'display-p3').coords;
  close(p3[0], 0.9175, 1e-3);
  close(p3[1], 0.2003, 1e-3);
  close(p3[2], 0.1386, 1e-3);
});

test('out-of-gamut display-p3 red is gamut-mapped into sRGB', () => {
  const c = parseColor('color(display-p3 1 0 0)');
  assert.ok(inSrgbGamut(c));
  assert.ok(c.r > 0.95 && c.g < 0.2 && c.b < 0.2, formatRgb(c));
});

test('color() rejects unknown spaces and wrong arity', () => {
  invalid('color(foo 1 1 1)');
  invalid('color(srgb 1 1)');
  invalid('color(srgb 1deg 1 1)');
});

// -------------------------------------------------------------- color-mix

test('color-mix in srgb: default 50/50 and single percentage', () => {
  assert.equal(rgb('color-mix(in srgb, red, blue)'), 'rgb(128 0 128)');
  assert.equal(rgb('color-mix(in srgb, red 25%, blue)'), 'rgb(64 0 191)');
  assert.equal(rgb('color-mix(in srgb, 25% red, blue)'), 'rgb(64 0 191)');
});

test('color-mix percentages summing under 100% scale alpha', () => {
  assert.equal(rgb('color-mix(in srgb, red 20%, blue 20%)'), 'rgb(128 0 128 / 0.4)');
  assert.equal(rgb('color-mix(in srgb, red 60%, blue 60%)'), 'rgb(128 0 128)');
});

test('color-mix uses premultiplied alpha', () => {
  assert.equal(rgb('color-mix(in srgb, transparent, red)'), 'rgb(255 0 0 / 0.5)');
});

test('color-mix in oklch interpolates the shorter hue arc', () => {
  const raw = parseRaw('color-mix(in oklch, red, blue)');
  close(raw.coords[2], 326.64, 0.05);
});

test('color-mix hue interpolation methods', () => {
  const h = (m) => parseRaw(`color-mix(in hsl ${m} hue, hsl(30 100% 50%), hsl(330 100% 50%))`).coords[0];
  close(h('shorter'), 0, 1e-9);
  close(h('longer'), 180, 1e-9);
  close(h('increasing'), 180, 1e-9);
  close(h('decreasing'), 0, 1e-9);
  invalid('color-mix(in srgb longer hue, red, blue)');
});

test('color-mix missing components take the other color', () => {
  assert.equal(rgb('color-mix(in srgb, rgb(none 0 0), rgb(255 0 0))'), 'rgb(255 0 0)');
  const raw = parseRaw('color-mix(in oklch, white, blue)');
  close(raw.coords[2], srgbToOklch(parseColor('blue')).h, 1e-6, 'achromatic hue is powerless');
});

test('color-mix defaults to oklab and supports every space', () => {
  assert.equal(rgb('color-mix(red, red)'), 'rgb(255 0 0)');
  for (const space of ['srgb-linear', 'display-p3', 'lab', 'lch', 'oklab', 'xyz', 'xyz-d50', 'hwb', 'rec2020']) {
    assert.equal(rgb(`color-mix(in ${space}, white, white)`), 'rgb(255 255 255)', space);
  }
});

test('color-mix with unresolvable operand falls back', () => {
  invalid('color-mix(in srgb, var(--a), blue)');
  invalid('color-mix(in srgb, currentcolor, blue)');
  const fb = parseColor('blue');
  assert.equal(parseColor('color-mix(in srgb, var(--a) 40%, blue)', { fallback: fb }), fb);
  assert.equal(rgb('color-mix(in srgb, currentcolor, blue)', { currentColor: 'red' }), 'rgb(128 0 128)');
});

test('color-mix invalid forms rejected', () => {
  for (const s of [
    'color-mix(in foo, red, blue)',
    'color-mix(in srgb, red)',
    'color-mix(in srgb, red 0%, blue 0%)',
    'color-mix(in srgb, red 120%, blue)',
    'color-mix(in srgb, red -5%, blue)',
    'color-mix(in srgb red, blue)',
  ]) {
    invalid(s);
  }
});

test('nested color-mix', () => {
  assert.equal(rgb('color-mix(in srgb, color-mix(in srgb, red, blue), white 0%)'), 'rgb(128 0 128)');
});

// ---------------------------------------------------- relative + light-dark

test('relative color syntax: rgb(from …) keeps or edits channels', () => {
  assert.equal(rgb('rgb(from #336699 r g b)'), 'rgb(51 102 153)');
  assert.equal(rgb('rgb(from #336699 r g b / 0.5)'), 'rgb(51 102 153 / 0.5)');
  assert.equal(rgb('rgb(from #336699 calc(r + 10) g b)'), 'rgb(61 102 153)');
  assert.equal(rgb('rgb(from rgb(0 0 0 / 0.3) r g b)'), 'rgb(0 0 0 / 0.3)');
  assert.equal(rgb('rgb(from #336699 b g r / calc(alpha / 2))'), 'rgb(153 102 51 / 0.5)');
});

test('relative color syntax across spaces', () => {
  assert.equal(rgb('hsl(from red calc(h + 120) s l)'), 'rgb(0 255 0)');
  assert.equal(rgb('oklch(from red l c h)'), 'rgb(255 0 0)');
  assert.equal(rgb('color(from red srgb r g b)'), 'rgb(255 0 0)');
  assert.equal(rgb('lab(from white l 0 0)'), 'rgb(255 255 255)');
  invalid('rgb(from red x g b)');
  invalid('rgb(from nope r g b)');
});

test('light-dark() picks by opts.scheme', () => {
  assert.equal(rgb('light-dark(white, black)'), 'rgb(255 255 255)');
  assert.equal(rgb('light-dark(white, black)', { scheme: 'dark' }), 'rgb(0 0 0)');
  invalid('light-dark(white)');
});

// ------------------------------------------------------------------- OKLCH

test('srgbToOklch reference values', () => {
  const red = srgbToOklch(parseColor('red'));
  close(red.l, 0.62796, 1e-4);
  close(red.c, 0.25768, 1e-4);
  close(red.h, 29.2339, 1e-2);
  const white = srgbToOklch(parseColor('white'));
  close(white.l, 1, 1e-4);
  close(white.c, 0, 1e-4);
  assert.equal(white.h, 0);
  const black = srgbToOklch(parseColor('black'));
  close(black.l, 0, 1e-9);
});

test('sRGB → OKLCH → sRGB round-trip on 1,000 in-gamut colors', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 1000; i++) {
    const c = { r: rand(), g: rand(), b: rand(), alpha: 1 };
    const back = oklchToSrgb(srgbToOklch(c));
    for (const ch of ['r', 'g', 'b']) close(back[ch], c[ch], 1e-6, `#${i}.${ch}`);
  }
});

test('oklchToSrgb gamut-maps high chroma while keeping lightness', () => {
  const out = oklchToSrgb({ l: 0.7, c: 0.4, h: 150 });
  assert.ok(inSrgbGamut(out));
  const back = srgbToOklch(out);
  close(back.l, 0.7, 0.03);
  close(back.h, 150, 5);
});

test('oklchToSrgb at L extremes returns white / black', () => {
  assert.equal(formatRgb(oklchToSrgb({ l: 1.2, c: 0.3, h: 30 })), 'rgb(255 255 255)');
  assert.equal(formatRgb(oklchToSrgb({ l: 0, c: 0.3, h: 30 })), 'rgb(0 0 0)');
});

// ------------------------------------------------------------- WCAG 2.x

// Reference ratios as published by the WebAIM contrast checker (2 decimals).
const WCAG_REFERENCE = [
  ['#000000', '#ffffff', 21],
  ['#ffffff', '#ffffff', 1],
  ['#777777', '#ffffff', 4.48],
  ['#767676', '#ffffff', 4.54],
  ['#595959', '#ffffff', 7.0],
  ['#ff0000', '#ffffff', 4.0],
  ['#0000ff', '#ffffff', 8.59],
  ['#008000', '#ffffff', 5.14],
  ['#ffff00', '#000000', 19.56],
  ['#808080', '#000000', 5.32],
];

for (const [fg, bg, expected] of WCAG_REFERENCE) {
  test(`WCAG contrast ${fg} on ${bg} = ${expected} ±0.01`, () => {
    close(contrastRatio(fg, bg), expected, 0.01);
  });
}

test('contrast is symmetric and accepts parsed objects', () => {
  const a = parseColor('#336699'), b = parseColor('#f5f5f5');
  close(contrastRatio(a, b), contrastRatio(b, a), 1e-12);
  close(contrastRatio('#336699', 'whitesmoke'), contrastRatio(a, b), 1e-12);
});

test('relative luminance endpoints', () => {
  assert.equal(relativeLuminance('white'), 1);
  assert.equal(relativeLuminance('black'), 0);
  close(relativeLuminance('#808080'), 0.2159, 1e-4);
});

test('translucent text is composited over its background', () => {
  const ratio = contrastRatio('rgba(0, 0, 0, 0.5)', 'white');
  const solid = composite(parseColor('rgba(0,0,0,0.5)'), parseColor('white'));
  close(ratio, contrastRatio(solid, 'white'), 1e-12);
  // 50% black over white composites to channel 127.5 (luminance ≈ 0.2140),
  // not #808080 (0.2159, ratio 3.95), so the exact ratio is 1.05 / 0.2640 ≈ 3.98.
  close(ratio, 3.98, 0.01);
});

test('translucent background is composited over white canvas', () => {
  close(contrastRatio('black', 'rgb(0 0 0 / 0)'), 21, 1e-9);
});

test('contrast of an unparseable color is NaN', () => {
  assert.ok(Number.isNaN(contrastRatio('nope', 'white')));
});

// ----------------------------------------------------------------- format

test('formatHex and formatRgb', () => {
  assert.equal(formatHex(parseColor('rebeccapurple')), '#663399');
  assert.equal(formatHex(parseColor('rgb(255 0 0 / 0.5)')), '#ff000080');
  assert.equal(formatRgb({ r: 2, g: -1, b: 0.5 }), 'rgb(255 0 128)');
});
