// T008 acceptance on WebKit: the filter fallback engine darkens the page
// while media show as authored (not inverted, not double-inverted); image
// modes (dim) and "hide background images" work in both engines; and the
// per-site engine switches dynamic ↔ filter on an open page without a reload.
// Checked on real screenshot pixels, since a filter doesn't change computed
// colors. Evidence: ralph/evidence/t008-*.png and t008-e2e.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServers, launch, openPage, evidencePath } from './harness.js';
import { decodePng } from './png.js';
import { defaultSettings } from '../engine/src/settings.js';
import { relativeLuminance } from '../engine/src/color.js';

const LIGHT = [230, 200, 150];
const DARK = [40, 40, 60];
const DIMMED = LIGHT.map((v) => Math.round(v * 0.8));
const TOL = 12;
const AS_AUTHORED = ['plain', 'pic', 'linked', 'nofilter', 'reverted', 'fig', 'cv'];

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
  writeFileSync(evidencePath('t008-e2e.json'), JSON.stringify(summary, null, 2) + '\n');
});

const settingsWith = (patch) => ({ ...defaultSettings(), mode: 'always', ...patch });
const lum = ([r, g, b]) => relativeLuminance({ r: r / 255, g: g / 255, b: b / 255, alpha: 1 });
const near = (a, b, tol = TOL) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// Screenshot pixels at the center of each fixture element, plus the page
// background (top-left, inside <body>) and the canvas below all content.
async function sample(page, shot) {
  const points = await page.evaluate(() => {
    const out = {};
    for (const id of ['plain', 'dark', 'pic', 'linked', 'nofilter', 'reverted', 'fig', 'cv', 'bg']) {
      const r = document.getElementById(id).getBoundingClientRect();
      out[id] = [r.left + r.width / 2, r.top + r.height / 2];
    }
    const bottom = document.body.getBoundingClientRect().bottom;
    out.pageBg = [6, 6];
    out.belowContent = [innerWidth - 20, Math.min(innerHeight - 10, bottom + 40)];
    out._contentEnds = bottom;
    return out;
  });
  assert.ok(points._contentEnds < 860, `fixture too tall for the below-content sample (${points._contentEnds})`);
  delete points._contentEnds;
  const png = decodePng(await page.screenshot({ path: shot }));
  return Object.fromEntries(Object.entries(points).map(([k, [x, y]]) => [k, png.at(x, y)]));
}

function assertDarkPage(px, label) {
  assert.ok(lum(px.pageBg) < 0.1, `${label}: page background ${px.pageBg} not dark`);
  assert.ok(lum(px.belowContent) < 0.1, `${label}: canvas below content ${px.belowContent} not dark`);
}

function assertMedia(px, label) {
  for (const id of AS_AUTHORED) assert.ok(near(px[id], LIGHT), `${label}: #${id} is ${px[id]}, expected ≈ ${LIGHT}`);
  assert.ok(near(px.dark, DARK), `${label}: #dark is ${px.dark}, expected ≈ ${DARK}`);
}

// brightness(80%) scales sRGB values by 0.8, or ~0.9 if the filter runs in
// linear light; either way darker than authored, same hue, not inverted.
function assertDimmed(px, label) {
  for (const id of AS_AUTHORED) {
    const c = px[id];
    const ok = c.every((v, i) => v <= LIGHT[i] - 8 && v >= LIGHT[i] * 0.7) && c[0] > c[1] && c[1] > c[2];
    assert.ok(ok, `${label}: #${id} is ${c}, expected dimmed ${LIGHT} (≈ ${DIMMED})`);
  }
  assert.ok(px.dark.every((v, i) => v <= DARK[i] + 2 && v >= DARK[i] * 0.6), `${label}: #dark is ${px.dark}`);
}

test('filter engine: page dark, media as authored (not inverted, not double-inverted), nothing intercepts clicks', { timeout: 60000 }, async () => {
  const plain = await openPage(browser, servers, '/images.html');
  const beforeSnap = await plain.page.evaluate(() => __sanAudit.snapshot());
  const basePx = await sample(plain.page, evidencePath('t008-before.png'));
  await plain.context.close();
  assert.ok(lum(basePx.pageBg) > 0.5, 'fixture baseline is light');
  assertMedia(basePx, 'baseline');

  const { page, context } = await openPage(browser, servers, '/images.html', {
    extension: true, settings: settingsWith({ engine: 'filter' }), ready: 'filter',
  });
  const px = await sample(page, evidencePath('t008-filter-after.png'));
  const afterSnap = await page.evaluate(() => __sanAudit.snapshot());
  summary.filter = { before: basePx, after: px, ourElements: afterSnap.ours };

  assertDarkPage(px, 'filter');
  assertMedia(px, 'filter');
  assert.deepEqual(afterSnap.ours, ['style'], 'filter engine adds exactly one <style>');
  assert.deepEqual(afterSnap.elements.map((e) => e.tag), beforeSnap.elements.map((e) => e.tag), 'element structure changed');
  const pe = afterSnap.elements.filter((e, i) => e.pointerEvents !== beforeSnap.elements[i].pointerEvents);
  assert.deepEqual(pe, [], 'pointer-events changed');
  const blocked = afterSnap.elements.filter((e, i) => beforeSnap.elements[i].hittable === true && e.hittable !== true);
  assert.deepEqual(blocked, [], 'controls covered');
  await page.click('#link');
  assert.equal(await page.evaluate(() => location.hash), '#para');
  await context.close();
});

test('dynamic engine: media untouched by default', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/images.html', { extension: true, settings: settingsWith({}) });
  const px = await sample(page, evidencePath('t008-dynamic-after.png'));
  summary.dynamic = px;
  assertDarkPage(px, 'dynamic');
  assertMedia(px, 'dynamic');
  assert.ok(near(px.bg, LIGHT), `dynamic: url() background shown by default (${px.bg})`);
  await context.close();
});

for (const engine of ['dynamic', 'filter']) {
  test(`${engine} engine: images "dim" dims media; "hide background images" hides url() backgrounds`, { timeout: 60000 }, async () => {
    const { page, context } = await openPage(browser, servers, '/images.html', {
      extension: true,
      settings: settingsWith({ engine, images: 'dim', hideBackgroundImages: true }),
      ready: engine === 'filter' ? 'filter' : 'override',
    });
    const px = await sample(page, evidencePath(`t008-${engine}-dim-hide.png`));
    summary[`${engine}-dim-hide`] = px;
    assertDarkPage(px, `${engine} dim`);
    assertDimmed(px, `${engine} dim`);
    assert.ok(near(px.bg, px.pageBg), `${engine}: background image hidden (${px.bg} vs page ${px.pageBg})`);
    await context.close();
  });
}

test('per-site engine switches dynamic → filter → dynamic without a reload', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/images.html', { extension: true, settings: settingsWith({}) });
  await page.evaluate(() => { globalThis.__sameDocument = 'yes'; });
  const roles = () => page.evaluate(() =>
    [...document.querySelectorAll('[data-sunglasses-at-night]:not([data-sunglasses-at-night="manifest-base"])')].map((e) => e.getAttribute('data-sunglasses-at-night')).sort());
  const setSites = (sites) => page.evaluate(async (s) => {
    const t0 = performance.now();
    const { settings } = await browser.storage.local.get('settings');
    await browser.storage.local.set({ settings: { ...settings, sites: s } });
    return t0;
  }, sites);
  const timings = {};

  assert.deepEqual(await roles(), ['base', 'dynamic', 'override']);

  const t1 = await setSites({ '127.0.0.1': { rule: 'default', engine: 'filter' } });
  await page.waitForFunction(() => document.querySelector('style[data-sunglasses-at-night="filter"]')
    && !document.querySelector('style[data-sunglasses-at-night="override"]'));
  timings.toFilterMs = +(await page.evaluate((t) => performance.now() - t, t1)).toFixed(1);
  assert.deepEqual(await roles(), ['filter'], 'only the filter sheet is left');
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-san-inline],[data-san-fix],#sunglasses-at-night-early').length), 0, 'dynamic engine cleaned up');
  const filterPx = await sample(page, evidencePath('t008-toggle-filter.png'));
  assertDarkPage(filterPx, 'toggled to filter');
  assertMedia(filterPx, 'toggled to filter');

  const t2 = await setSites({});
  await page.waitForFunction(() => document.querySelector('style[data-sunglasses-at-night="override"]')
    && !document.querySelector('style[data-sunglasses-at-night="filter"]'));
  timings.toDynamicMs = +(await page.evaluate((t) => performance.now() - t, t2)).toFixed(1);
  assert.deepEqual(await roles(), ['base', 'dynamic', 'override']);
  const dynPx = await sample(page, evidencePath('t008-toggle-dynamic.png'));
  assertDarkPage(dynPx, 'toggled back to dynamic');
  assertMedia(dynPx, 'toggled back to dynamic');

  assert.equal(await page.evaluate(() => globalThis.__sameDocument), 'yes', 'page was not reloaded');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);
  summary.toggle = { timings, filter: filterPx, dynamic: dynPx };
  await context.close();
});
