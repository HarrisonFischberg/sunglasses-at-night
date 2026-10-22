// T031 acceptance on WebKit: the three home-page defects of a large storefront.
// amazon-home.html (original markup) has:
//   - product photos drawn with mix-blend-mode: multiply over #f7f7f7 tiles:
//     their pixels must stay within ΔE 8 of the unmodified page (not blackened);
//   - white headlines over a url() background and over an absolutely positioned
//     <img>: their computed color must equal the authored one;
//   - a carousel the page inserts 800 ms after load whose white placeholders come
//     from a cross-origin sheet that arrives 500 ms later: from the insert until
//     it is processed, no frame may have more than 2% of the viewport light
//     (image boxes excluded), and nothing may stay tagged data-sunglasses-pending.
// Evidence: ralph/evidence/t031-e2e.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServers, launch, openPage, recordFrames, evidencePath } from './harness.js';
import { decodePng } from './png.js';
import { defaultSettings } from '../engine/src/settings.js';
import { parseColor, srgbToOklch, relativeLuminance } from '../engine/src/color.js';

const PATH = '/amazon-home.html';
const MAX_LIGHT = 0.02;
const MAX_DE = 8;
const ALWAYS = { ...defaultSettings(), mode: 'always' };

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
  writeFileSync(evidencePath('t031-e2e.json'), JSON.stringify(summary, null, 2) + '\n');
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

// Viewport points on each product photo: the colored shape and the photo's own white.
const probe = (page) => page.evaluate(() => {
  const headline = (id) => getComputedStyle(document.getElementById(id)).color;
  return {
    points: ['prod-1', 'prod-2'].flatMap((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return [
        { id, kind: 'shape', x: r.left + r.width / 2, y: r.top + r.height / 2 },
        { id, kind: 'photo-white', x: r.left + 8, y: r.top + 8 },
      ];
    }),
    headBg: headline('h-bg'),
    headImg: headline('h-img'),
    slides: Object.fromEntries(['h-slide-layers', 'h-slide-sibling', 'h-slide-solid'].map((id) => [id, headline(id)])),
    blend: getComputedStyle(document.getElementById('prod-1')).mixBlendMode,
  };
});

let authored;

test('amazon-home: the unmodified page is the reference (blend multiply, white headlines, light page)', { timeout: 60000 }, async () => {
  const plain = await openPage(browser, servers, PATH, { extension: false });
  await plain.page.waitForFunction(() => globalThis.__fixtureDone === true);
  const info = await probe(plain.page);
  const png = decodePng(await plain.page.screenshot());
  authored = { info, pixels: info.points.map((p) => ({ ...p, px: png.at(p.x, p.y) })) };
  await plain.context.close();
  summary.authored = { headBg: info.headBg, headImg: info.headImg, blend: info.blend, pixels: authored.pixels };
  assert.equal(info.blend, 'multiply');
  assert.equal(info.headBg, 'rgb(255, 255, 255)');
  assert.equal(info.headImg, 'rgb(255, 255, 255)');
  for (const color of Object.values(info.slides)) assert.equal(color, 'rgb(255, 255, 255)');
  const shape = authored.pixels.find((p) => p.id === 'prod-1' && p.kind === 'shape').px;
  assert.ok(deltaE(shape, [232, 163, 23]) <= MAX_DE, `reference photo pixel ${shape}`);
});

test('amazon-home: photos, headlines and the late carousel (system dark, mode always)', { timeout: 90000 }, async () => {
  const ext = await recordFrames(browser, servers, PATH, {
    extension: true, settings: ALWAYS, colorScheme: 'dark', stallMs: 0, watchMs: 3500, sampler: 'light',
  });
  const { page } = ext;
  await page.waitForFunction(() => globalThis.__fixtureDone === true);
  const insertedAt = await page.evaluate(() => globalThis.__sanInsertedAt);
  const info = await probe(page);
  const png = decodePng(await page.screenshot({ path: evidencePath('t031-amazon-home-after.png') }));
  const final = await page.evaluate(() => ({
    pending: document.querySelectorAll('[data-sunglasses-pending]').length,
    cardBg: [...document.querySelectorAll('.car-card')].map((el) => getComputedStyle(el).backgroundColor),
    pBg: [...document.querySelectorAll('.car-card p')].map((el) => getComputedStyle(el).backgroundColor),
    imgs: [...document.querySelectorAll('img')].map((img) => ({ filter: getComputedStyle(img).filter, opacity: getComputedStyle(img).opacity })),
    ready: document.documentElement.hasAttribute('data-sunglasses-ready'),
  }));
  await ext.context.close();

  const photos = authored.pixels.map((a) => {
    const px = png.at(a.x, a.y);
    return { id: a.id, kind: a.kind, authored: a.px, now: px, dE: +deltaE(a.px, px).toFixed(2) };
  });
  const after = ext.frames.filter((f) => f.t >= insertedAt);
  summary.engine = {
    photos, headBg: info.headBg, headImg: info.headImg, blend: info.blend, insertedAt,
    framesAfterInsert: after.length, peakLightAfterInsert: Math.max(0, ...after.map((f) => f.lightShare)),
    peakLightAll: Math.max(0, ...ext.frames.map((f) => f.lightShare)), final,
  };

  for (const p of photos) assert.ok(p.dE <= MAX_DE, `${p.id} ${p.kind}: ΔE ${p.dE} (authored ${p.authored}, now ${p.now})`);
  assert.equal(info.headBg, authored.info.headBg, 'headline over a url() background changed color');
  assert.equal(info.headImg, authored.info.headImg, 'headline over an <img> changed color');
  // T035: promo-card headlines (layered url() sibling, image sibling, saturated solid) keep their color.
  for (const [id, color] of Object.entries(authored.info.slides)) {
    assert.equal(info.slides[id], color, `promo headline #${id} changed color`);
  }
  assert.ok(final.ready, 'engine never became ready');
  assert.ok(after.length > 0, 'no frame after the insert: the sampler covered nothing');
  for (const f of ext.frames) {
    assert.ok(f.lightShare <= MAX_LIGHT, `frame at ${f.t} ms (insert at ${insertedAt}) is ${(f.lightShare * 100).toFixed(1)}% light`);
  }
  assert.equal(final.pending, 0, 'content still tagged pending');
  assert.equal(final.cardBg.length, 3);
  for (const c of [...final.cardBg, ...final.pBg]) assert.ok(relativeLuminance(parseColor(c)) < 0.2, `carousel stayed light: ${c}`);
  for (const m of final.imgs) {
    assert.equal(m.filter, 'none', 'image filtered');
    assert.equal(m.opacity, '1', 'image faded');
  }
});
