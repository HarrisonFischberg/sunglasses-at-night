// T025: dark islands stay as authored; a saturated palette stays distinct.
// The palette is read from the e2e hard-cases fixture so the unit test and the
// WebKit run check the same 48 swatches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DARK_ISLAND_L, DEFAULT_LOOK, transformColor, transformPair, quantize } from '../src/transform.js';
import { parseColor, srgbToOklch, contrastRatio, formatRgb } from '../src/color.js';

// Distance in OKLab, scaled so black → white is 100.
function deltaE(a, b) {
  const lab = (c) => {
    const o = srgbToOklch(c);
    return [o.l, o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)];
  };
  const [x, y] = [lab(a), lab(b)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// What the engine writes into the override sheet, read back.
const mapBg = (c, look = DEFAULT_LOOK) => parseColor(formatRgb(quantize(transformColor(c, 'bg', look))));

const html = readFileSync(new URL('../../e2e/fixtures/hard-cases.html', import.meta.url), 'utf8');
const swatches = [...html.matchAll(/data-swatch[^>]*style="background:([^"]+)"/g)].map((m) => parseColor(m[1]));

test('fixture palette has 48 parseable swatches', () => {
  assert.equal(swatches.length, 48);
  assert.ok(swatches.every(Boolean));
});

test('palette: swatches that differed by ΔE ≥ 10 stay ≥ 3 apart after the transform', () => {
  const out = swatches.map((c) => mapBg(c));
  const bad = [];
  for (let i = 0; i < swatches.length; i++) {
    for (let j = i + 1; j < swatches.length; j++) {
      const before = deltaE(swatches[i], swatches[j]);
      const after = deltaE(out[i], out[j]);
      if (before >= 10 && after < 3) bad.push(`${i}/${j}: ${before.toFixed(1)} → ${after.toFixed(1)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('palette: lightness order is kept (lighter source → darker output among inverted swatches; islands unchanged)', () => {
  const rows = swatches.map((c) => ({ before: srgbToOklch(c).l, after: srgbToOklch(mapBg(c)).l }));
  const inverted = rows.filter((r) => r.before > DARK_ISLAND_L).sort((a, b) => a.before - b.before);
  for (let i = 1; i < inverted.length; i++) {
    assert.ok(inverted[i].after <= inverted[i - 1].after + 0.006, `order broke at ${inverted[i].before.toFixed(3)}`);
  }
  for (const r of rows.filter((x) => x.before <= DARK_ISLAND_L)) assert.ok(Math.abs(r.after - r.before) < 0.01);
});

test('palette: hue survives the transform wherever there is chroma to carry it', () => {
  for (const c of swatches) {
    const a = srgbToOklch(c), b = srgbToOklch(mapBg(c));
    if (a.c < 0.05 || b.c < 0.02) continue;
    const d = Math.abs(a.h - b.h) % 360;
    assert.ok((d > 180 ? 360 - d : d) < 12, `hue ${a.h.toFixed(0)} → ${b.h.toFixed(0)}`);
  }
});

test('dark island: a dark authored background is kept within ΔE 5, text on it stays ≥ 4.5:1', () => {
  for (const hex of ['#000000', '#1b2336', '#16213e', '#222222', '#0a2540', '#3b1f2b']) {
    const authored = parseColor(hex);
    assert.ok(deltaE(authored, mapBg(authored)) <= 5, `${hex} moved to ${formatRgb(quantize(mapBg(authored)))}`);
    for (const ink of ['#f2f2f2', '#ffffff', '#cccccc', '#7a7a7a', '#222222']) {
      const out = transformPair(ink, hex);
      assert.ok(contrastRatio(out.fg, out.backdrop) >= 4.5, `${ink} on ${hex}`);
      assert.ok(deltaE(authored, out.bg) <= 5, `${hex} pair bg moved`);
    }
  }
});

test('dark island: still kept with a non-default look is applied on top, not skipped', () => {
  const authored = parseColor('#1b2336');
  const dim = mapBg(authored, { ...DEFAULT_LOOK, brightness: 80 });
  assert.ok(srgbToOklch(dim).l < srgbToOklch(authored).l);
});

test('light backgrounds are still darkened (white → canvas, light gray → dark)', () => {
  assert.ok(srgbToOklch(mapBg(parseColor('#ffffff'))).l < 0.25);
  assert.ok(srgbToOklch(mapBg(parseColor('#f5f5f5'))).l < 0.3);
  assert.ok(srgbToOklch(mapBg(parseColor('#ffeb3b'))).l < DARK_ISLAND_L);
});
