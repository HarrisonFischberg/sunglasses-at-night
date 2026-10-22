// T023 acceptance on WebKit: first paint with a slow settings read.
// The settings read (browser.storage.local.get) is delayed 300 ms, as in the
// worst case in Safari. Until it resolves the content script can't know the
// mode, so the manifest-declared content/base.css (stood in for by an init
// script that appends the same text at document start) paints a dark base,
// but only under prefers-color-scheme: dark and without data-sunglasses-off.
//   - system dark, mode always: the first rendered frame, and every frame
//     before the settings arrive, is dark on all 10 T012 fixtures;
//   - system light, mode off: no frame is ever dark (the base doesn't apply);
//   - system dark, mode off: the transient dark base lasts at most the
//     settings-read latency plus one frame, then the page is as authored.
// Evidence: ralph/evidence/t023-e2e.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServers, launch, recordFrames, evidencePath } from './harness.js';
import { defaultSettings } from '../engine/src/settings.js';

const DELAY = 300;
const FIXTURES = [
  { name: 'light', path: '/light.html' },
  { name: 'already-dark', path: '/already-dark.html', alreadyDark: true },
  { name: 'inline', path: '/inline.html' },
  { name: 'spa', path: '/spa.html' },
  { name: 'images', path: '/images.html' },
  { name: 'cross-origin', path: '/cross-origin.html' },
  { name: 'links', path: '/links.html' },
  { name: 'shop', path: '/shop.html' },
  { name: 'shadow', path: '/shadow.html' },
  { name: 'hard-cases', path: '/hard-cases.html' },
];

const ALWAYS = { ...defaultSettings(), mode: 'always' };
const OFF = { ...defaultSettings(), mode: 'off' };

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
  summary._meta = { engine: 'webkit (Playwright 1.64.1)', settingsDelayMs: DELAY, date: new Date().toISOString() };
  writeFileSync(evidencePath('t023-e2e.json'), JSON.stringify(summary, null, 2) + '\n');
});

const record = (name, key, value) => { (summary[name] ??= {})[key] = value; };
const brief = (frames) => frames.map((f) => ({ t: f.t, luminance: f.luminance }));

function frameInterval(frames) {
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t).filter((g) => g > 0).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 17;
}

for (const fx of FIXTURES) {
  test(`${fx.name}: system dark, mode always, settings read ${DELAY} ms: no white frame before settings arrive`, { timeout: 60000 }, async () => {
    const plain = await recordFrames(browser, servers, fx.path, { extension: false, colorScheme: 'dark', stallMs: 0, watchMs: 400 });
    await plain.context.close();
    const ext = await recordFrames(browser, servers, fx.path, {
      extension: true, settings: ALWAYS, colorScheme: 'dark', settingsDelayMs: DELAY, stallMs: 0, watchMs: 800,
    });
    await ext.context.close();
    record(fx.name, 'systemDarkAlways', { baselineFirst: plain.frames[0], settingsAt: ext.settingsAt, frames: brief(ext.frames) });

    assert.ok(ext.frames.length > 0, 'no frames recorded');
    if (!fx.alreadyDark) assert.ok(plain.frames[0].luminance > 0.5, `baseline first frame not light (${JSON.stringify(plain.frames[0])})`);
    // The test must cover the wait: the first frame comes before the settings do.
    assert.ok(ext.frames[0].t < ext.settingsAt, `first frame at ${ext.frames[0].t} ms is after the settings read (${ext.settingsAt} ms)`);
    for (const f of ext.frames) {
      assert.ok(f.luminance < 0.1, `frame at ${f.t} ms not dark (settings at ${ext.settingsAt} ms): ${JSON.stringify(f)}`);
    }
  });
}

for (const fx of FIXTURES) {
  test(`${fx.name}: system light, mode off: no dark frame at all`, { timeout: 60000 }, async () => {
    const ext = await recordFrames(browser, servers, fx.path, {
      extension: true, settings: OFF, colorScheme: 'light', settingsDelayMs: DELAY, stallMs: 0, watchMs: 800,
    });
    await ext.context.close();
    record(fx.name, 'systemLightOff', { settingsAt: ext.settingsAt, frames: brief(ext.frames) });
    assert.ok(ext.frames.length > 0, 'no frames recorded');
    const dark = ext.frames.filter((f) => f.luminance < 0.5);
    // already-dark.html is dark as authored, so only judge fixtures that are light.
    if (!fx.alreadyDark) assert.deepEqual(dark, [], `${dark.length} dark frame(s) with the system light and mode off`);
  });
}

for (const fx of FIXTURES.filter((f) => !f.alreadyDark)) {
  test(`${fx.name}: system dark, mode off: transient dark ≤ settings read + 1 frame, then as authored`, { timeout: 60000 }, async () => {
    const ext = await recordFrames(browser, servers, fx.path, {
      extension: true, settings: OFF, colorScheme: 'dark', settingsDelayMs: DELAY, stallMs: 0, watchMs: 800,
    });
    await ext.context.close();
    const frame = frameInterval(ext.frames);
    const firstDark = ext.frames.find((f) => f.luminance < 0.5);
    const lightAfter = firstDark && ext.frames.find((f) => f.t > firstDark.t && f.luminance >= 0.5);
    const darkMs = firstDark && lightAfter ? lightAfter.t - firstDark.t : 0;
    record(fx.name, 'systemDarkOff', { settingsAt: ext.settingsAt, frameMs: frame, darkMs, frames: brief(ext.frames) });

    assert.ok(ext.frames.length > 0, 'no frames recorded');
    // The page ends as authored (light), not stuck dark.
    assert.ok(ext.frames.at(-1).luminance >= 0.5, `last frame still dark: ${JSON.stringify(ext.frames.at(-1))}`);
    assert.ok(lightAfter || !firstDark, 'dark base never lifted');
    assert.ok(darkMs <= DELAY + frame, `dark for ${darkMs} ms; limit ${DELAY} + 1 frame (${frame} ms)`);
  });
}
