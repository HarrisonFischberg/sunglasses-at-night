// T032 acceptance on WebKit: light overlays that multiply over product photos.
// fresh-grid.html (original markup) has 12 tiles, inserted three rows at a time
// as they scroll into view. Each tile's photo and "+" button icon sit under an
// absolutely positioned overlay <div> with mix-blend-mode: multiply, either
// background #f7f7f7 or rgba(0,0,0,.03). Darkened or inverted, multiply with
// near-black blacks out what is under it. For the dynamic and the filter engine
// × images leave / dim / no-invert, every tile's photo and "+" icon, sampled 2 s
// after its row scrolled in (the blackout came ~1 s after the photo showed),
// stays within ΔE 8 of the unmodified page (dim: within the dim rule).
// Evidence: ralph/evidence/t032-e2e.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServers, launch, openPage, evidencePath } from './harness.js';
import { decodePng } from './png.js';
import { defaultSettings } from '../engine/src/settings.js';
import { parseColor, srgbToOklch } from '../engine/src/color.js';

const PATH = '/fresh-grid.html';
const MAX_DE = 8;
const ROWS = 3;
const SETTLE_MS = 2000;

let servers, browser;
const summary = {};

before(async () => {
  servers = await startServers();
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await servers?.close();
  if (!Object.keys(summary).length) return;
  summary._meta = { engine: 'webkit (Playwright 1.64.1)', date: new Date().toISOString() };
  writeFileSync(evidencePath('t032-e2e.json'), JSON.stringify(summary, null, 2) + '\n');
});

// Distance in OKLab, black → white = 100.
function deltaE(a, b) {
  const lab = (c) => {
    const o = srgbToOklch(parseColor(`rgb(${c.join(' ')})`));
    return [o.l, o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)];
  };
  const [x, y] = [lab(a), lab(b)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// Scroll the grid row by row, as a person would; each row is inserted by the
// page on scroll. After SETTLE_MS, screenshot and read the photo and the "+"
// icon of every tile in that row.
async function sampleGrid(page, label) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    await page.evaluate((y) => window.scrollTo(0, y), r * 1000);
    await page.waitForFunction((n) => globalThis.__rows > n, r);
    await page.waitForTimeout(SETTLE_MS);
    const points = await page.evaluate((row) => [...document.querySelectorAll('.tile')]
      .filter((t) => Math.floor(Number(t.dataset.tile) / 4) === row)
      .map((t) => {
        const p = t.querySelector('.photo').getBoundingClientRect();
        const a = t.querySelector('.add img').getBoundingClientRect();
        return {
          tile: Number(t.dataset.tile),
          tint: getComputedStyle(t.querySelector('.tint')).backgroundColor,
          photo: [p.left + 24, p.top + 24],
          add: [a.left + a.width / 2, a.top + a.height / 2],
        };
      }), r);
    const png = decodePng(await page.screenshot({ path: evidencePath(`t032-${label}-row${r}.png`) }));
    for (const t of points) out.push({ tile: t.tile, tint: t.tint, photo: png.at(...t.photo), add: png.at(...t.add) });
  }
  return out;
}

let authored;

test('fresh-grid: the unmodified page is the reference (12 tiles, both tints multiply)', { timeout: 90000 }, async () => {
  const plain = await openPage(browser, servers, PATH, { extension: false });
  const blends = await plain.page.evaluate(() => [...document.querySelectorAll('.tint')].length);
  authored = await sampleGrid(plain.page, 'authored');
  const tints = await plain.page.evaluate(() => [...document.querySelectorAll('.tint')].map((t) => getComputedStyle(t).mixBlendMode));
  await plain.context.close();
  summary.authored = authored;
  assert.equal(blends, 12);
  assert.equal(authored.length, 12);
  assert.ok(tints.every((m) => m === 'multiply'), `tints blend: ${tints}`);
  assert.deepEqual(authored.map((t) => t.tile), [...Array(12).keys()]);
  // The reference photo of the first tile is its authored blue (×0.97).
  assert.ok(deltaE(authored[0].photo, [0x3a, 0x7b, 0xd5]) <= MAX_DE, `reference photo ${authored[0].photo}`);
});

// brightness(80%) scales sRGB values by 0.8, or ~0.9 if the filter runs in linear light.
const dimmed = (px, k) => px.map((v) => Math.round(v * k));

for (const engine of ['dynamic', 'filter']) {
  for (const images of ['leave', 'dim', 'no-invert']) {
    test(`fresh-grid: ${engine} engine, images ${images}: photos and "+" icons are not blacked out`, { timeout: 120000 }, async () => {
      const { page, context } = await openPage(browser, servers, PATH, {
        extension: true,
        settings: { ...defaultSettings(), mode: 'always', engine, images },
        ready: engine === 'filter' ? 'filter' : 'override',
      });
      const tiles = await sampleGrid(page, `${engine}-${images}`);
      const state = await page.evaluate(() => ({
        tints: [...document.querySelectorAll('.tint')].map((t) => {
          const cs = getComputedStyle(t);
          return { blend: cs.mixBlendMode, bg: cs.backgroundColor };
        }),
        pending: document.querySelectorAll('[data-sunglasses-pending]').length,
      }));
      await context.close();

      const rows = tiles.map((t) => {
        const a = authored[t.tile];
        const ref = (key) => (images === 'dim'
          ? [0.8, 0.9].map((k) => deltaE(t[key], dimmed(a[key], k))).sort((x, y) => x - y)[0]
          : deltaE(t[key], a[key]));
        return { tile: t.tile, photo: t.photo, add: t.add, photoDE: +ref('photo').toFixed(2), addDE: +ref('add').toFixed(2) };
      });
      summary[`${engine}-${images}`] = { rows, state };

      assert.equal(tiles.length, 12);
      for (const r of rows) {
        assert.ok(r.photoDE <= MAX_DE, `tile ${r.tile} photo ΔE ${r.photoDE}: ${r.photo} (authored ${authored[r.tile].photo})`);
        assert.ok(r.addDE <= MAX_DE, `tile ${r.tile} "+" icon ΔE ${r.addDE}: ${r.add} (authored ${authored[r.tile].add})`);
        if (images === 'dim') {
          const a = authored[r.tile];
          assert.ok(r.photo.every((v, i) => v <= a.photo[i]), `tile ${r.tile} photo not dimmed: ${r.photo} vs ${a.photo}`);
        }
      }
      assert.equal(state.pending, 0, 'content still tagged pending');
      for (const t of state.tints) {
        assert.equal(t.blend, 'normal', `an overlay still blends (${t.blend}, ${t.bg})`);
      }
    });
  }
}
