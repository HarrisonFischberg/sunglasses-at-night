// An open page follows the system appearance: in "Match system" mode a page
// loaded light goes dark when the system turns dark (macOS Auto at sunset),
// and back, without a reload.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServers, launch, openPage } from './harness.js';
import { defaultSettings } from '../engine/src/settings.js';

let servers, browser;
before(async () => { servers = await startServers(); browser = await launch(); });
after(async () => { await browser?.close(); await servers?.close(); });

const override = 'style[data-sunglasses-at-night="override"]';

test('system appearance change: an open page goes dark and back without a reload', { timeout: 60000 }, async () => {
  const settings = { ...defaultSettings(), mode: 'system' };
  const { page, context } = await openPage(browser, servers, '/light.html', { extension: true, settings, ready: null });
  assert.equal(await page.$(override), null, 'light system: page left light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForSelector(override, { state: 'attached', timeout: 5000 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForSelector(override, { state: 'detached', timeout: 5000 });
  await context.close();
});
