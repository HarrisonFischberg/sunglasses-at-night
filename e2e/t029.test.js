// T029 acceptance on WebKit: no white pop-in on a heavy page.
// heavy-grid.html keeps every white container in cross-origin sheets that the
// server holds back 1500 ms, and the settings read takes 300 ms. Every
// animation frame from document start is sampled for the share of the viewport
// painted light (OKLCH L > 0.9, image boxes excluded):
//   - system dark, mode always: never more than 2% of the viewport, before
//     the engine is ready (data-sunglasses-ready) or after;
//   - images are never inverted or faded, during or after;
//   - mode off, or a "never" site: once settings arrive the interim rule is
//     gone and the page is as authored (white), with no ready attribute.
// Evidence: ralph/evidence/t029-e2e.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServers, launch, recordFrames, evidencePath } from './harness.js';
import { defaultSettings } from '../engine/src/settings.js';

const DELAY = 300;
const PATH = '/heavy-grid.html';
const MAX_LIGHT = 0.02;

const ALWAYS = { ...defaultSettings(), mode: 'always' };
const OFF = { ...defaultSettings(), mode: 'off' };
const NEVER_SITE = { ...defaultSettings(), mode: 'always', sites: { '127.0.0.1': { rule: 'never' } } };

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
  summary._meta = { engine: 'webkit (Playwright 1.64.1)', settingsDelayMs: DELAY, sheetDelayMs: 1500, date: new Date().toISOString() };
  writeFileSync(evidencePath('t029-e2e.json'), JSON.stringify(summary, null, 2) + '\n');
});

const mediaState = (page) => page.evaluate(() => [...document.querySelectorAll('img')].map((img) => {
  const cs = getComputedStyle(img);
  return { filter: cs.filter, opacity: cs.opacity, mixBlend: cs.mixBlendMode };
}));

const peak = (frames) => frames.reduce((m, f) => Math.max(m, f.lightShare), 0);
const brief = (frames) => frames.map((f) => ({ t: f.t, lightShare: f.lightShare, ready: f.ready }));

test('heavy-grid: unmodified page is mostly light (the sampler can see white)', { timeout: 60000 }, async () => {
  const plain = await recordFrames(browser, servers, PATH, { extension: false, colorScheme: 'dark', stallMs: 0, watchMs: 400, sampler: 'light' });
  await plain.context.close();
  summary.baseline = { peakLightShare: peak(plain.frames), frames: plain.frames.length };
  assert.ok(peak(plain.frames) > 0.3, `baseline never light: peak ${peak(plain.frames)}`);
});

test('heavy-grid: system dark, mode always, sheets 1500 ms late, settings 300 ms: no white frame, images untouched', { timeout: 60000 }, async () => {
  const ext = await recordFrames(browser, servers, PATH, {
    extension: true, settings: ALWAYS, colorScheme: 'dark', settingsDelayMs: DELAY, stallMs: 0, watchMs: 1500, sampler: 'light',
  });
  const media = await mediaState(ext.page);
  const finalState = await ext.page.evaluate(() => ({
    ready: document.documentElement.hasAttribute('data-sunglasses-ready'),
    early: Boolean(document.getElementById('sunglasses-at-night-early')),
    override: Boolean(document.querySelector('style[data-sunglasses-at-night="override"]')),
  }));
  await ext.page.screenshot({ path: evidencePath('t029-heavy-grid-after.png') });
  await ext.context.close();

  const beforeReady = ext.frames.filter((f) => !f.ready);
  const readyAt = ext.frames.find((f) => f.ready)?.t ?? null;
  summary.systemDarkAlways = {
    settingsAt: ext.settingsAt, readyAt, peakLightShare: peak(ext.frames),
    peakBeforeReady: peak(beforeReady), framesBeforeReady: beforeReady.length, media, final: finalState, frames: brief(ext.frames),
  };

  assert.ok(ext.frames.length > 0, 'no frames recorded');
  assert.ok(beforeReady.length > 0, 'no frame before the engine was ready: the test covered nothing');
  assert.ok(readyAt !== null, 'engine never became ready');
  for (const f of ext.frames) {
    assert.ok(f.lightShare <= MAX_LIGHT, `frame at ${f.t} ms (ready=${f.ready}) is ${(f.lightShare * 100).toFixed(1)}% light`);
  }
  assert.ok(finalState.ready && !finalState.early && finalState.override, `final state ${JSON.stringify(finalState)}`);
  assert.equal(media.length, 2);
  for (const m of media) {
    assert.equal(m.filter, 'none', 'image filtered');
    assert.equal(m.opacity, '1', 'image faded');
  }
});

for (const [name, settings] of [['mode off', OFF], ['a "never" site', NEVER_SITE]]) {
  test(`heavy-grid: system dark, ${name}: the interim rule never applies after settings arrive`, { timeout: 60000 }, async () => {
    const ext = await recordFrames(browser, servers, PATH, {
      extension: true, settings, colorScheme: 'dark', settingsDelayMs: DELAY, stallMs: 0, watchMs: 1200, sampler: 'light',
    });
    const state = await ext.page.evaluate(() => {
      const tile = document.querySelector('.tile');
      return {
        tileBg: getComputedStyle(tile).backgroundColor,
        ready: document.documentElement.hasAttribute('data-sunglasses-ready'),
        off: document.documentElement.hasAttribute('data-sunglasses-off'),
        ours: document.querySelectorAll('[data-sunglasses-at-night]:not([data-sunglasses-at-night="manifest-base"])').length,
      };
    });
    await ext.context.close();
    summary[name === 'mode off' ? 'systemDarkOff' : 'neverSite'] = { settingsAt: ext.settingsAt, state, peakLightShare: peak(ext.frames), frames: brief(ext.frames) };

    assert.equal(state.tileBg, 'rgb(255, 255, 255)', 'page not as authored');
    assert.equal(state.ready, false);
    assert.equal(state.off, true);
    assert.equal(state.ours, 0, 'something of ours is still in the page');
    // The sheets arrive after the settings, so every light frame with content is the page's own.
    const late = ext.frames.filter((f) => f.t > ext.settingsAt + 100);
    assert.ok(late.length > 0 && peak(late) > 0.3, 'page not light as authored after settings');
  });
}
