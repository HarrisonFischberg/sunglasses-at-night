// T036 acceptance on WebKit: a page that is already "ready" adds three
// cross-origin stylesheets painting #main white, while the extension's re-fetch
// of their text takes 800 ms (real Safari: worker wake-up + message round trip).
// The interim rule must come back (data-sunglasses-ready off) the moment the
// sheets are added, and lift again (on) once the rewrite lands:
//   - no frame from first paint to 3 s after the last sheet has >2% near-white;
//   - the ready attribute toggles on, off, on;
//   - the final colors are dark (as T012).
// Evidence: ralph/evidence/t036-e2e.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServers, launch, recordFrames, evidencePath } from './harness.js';
import { defaultSettings } from '../engine/src/settings.js';
import { parseColor, relativeLuminance } from '../engine/src/color.js';

const MAX_LIGHT = 0.02;
const FETCH_DELAY_MS = 800;
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
  writeFileSync(evidencePath('t036-e2e.json'), JSON.stringify(summary, null, 2) + '\n');
});

for (const colorScheme of ['dark', 'light']) {
  test(`late-sheets: sheets added after ready never paint white (${colorScheme} system, re-fetch ${FETCH_DELAY_MS} ms)`, { timeout: 90000 }, async () => {
    const ext = await recordFrames(browser, servers, '/late-sheets.html', {
      extension: true, settings: ALWAYS, colorScheme, stallMs: 0, fetchDelayMs: FETCH_DELAY_MS, watchMs: 7500, sampler: 'light',
    });
    const { page } = ext;
    await page.waitForFunction(() => globalThis.__fixtureDone === true);
    const times = await page.evaluate(() => ({ insertedAt: globalThis.__sanInsertedAt, lastSheetAt: globalThis.__sanLastSheetAt }));
    const final = await page.evaluate(() => ({
      ready: document.documentElement.hasAttribute('data-sunglasses-ready'),
      mainBg: getComputedStyle(document.getElementById('main')).backgroundColor,
      mainColor: getComputedStyle(document.getElementById('main')).color,
      interim: document.querySelectorAll('style[data-sunglasses-at-night="interim"]').length,
    }));
    await ext.context.close();

    const covered = ext.frames.filter((f) => f.t <= times.lastSheetAt + 3000);
    // ready toggles: collapse consecutive equal values.
    const toggles = [];
    for (const f of covered) if (toggles[toggles.length - 1] !== f.ready) toggles.push(f.ready);
    const peak = Math.max(0, ...covered.map((f) => f.lightShare));
    summary[colorScheme] = { ...times, frames: covered.length, peakLight: peak, toggles, final };

    assert.ok(covered.some((f) => f.t >= times.insertedAt), 'no frame after the sheets were added');
    for (const f of covered) {
      assert.ok(f.lightShare <= MAX_LIGHT, `frame at ${f.t} ms (sheets added at ${times.insertedAt}) is ${(f.lightShare * 100).toFixed(1)}% light`);
    }
    assert.deepEqual(toggles.slice(-3), [true, false, true], `ready attribute did not toggle on, off, on: ${JSON.stringify(toggles)}`);
    assert.ok(final.ready, 'engine never became ready again');
    assert.equal(final.interim, 0, 'interim rule left behind');
    assert.ok(relativeLuminance(parseColor(final.mainBg)) < 0.2, `#main stayed light: ${final.mainBg}`);
    assert.ok(relativeLuminance(parseColor(final.mainColor)) > 0.3, `#main text stayed dark: ${final.mainColor}`);
  });
}
