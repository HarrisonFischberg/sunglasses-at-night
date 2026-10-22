// Per-tab style cache (style-cache.js) on WebKit: after the first visit the
// finished override CSS is in sessionStorage; on reload it is adopted at
// document start (before the engine is ready) and dropped once it is.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServers, launch, openPage } from './harness.js';

let servers, browser;
before(async () => { servers = await startServers(); browser = await launch(); });
after(async () => { await browser?.close(); await servers?.close(); });

test('style cache: stored after the first visit, adopted on reload before ready, removed when ready', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/shop.html', { extension: true });
  const stored = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('sunglasses-at-night:css:')).map((k) => sessionStorage.getItem(k).length));
  assert.equal(stored.length, 1, 'one cache entry for this page');
  assert.ok(stored[0] > 100, 'it holds the override CSS');

  // Record every assignment to document.adoptedStyleSheets during the reload
  // (the fixture is small enough that the engine can be ready within one frame).
  await page.addInitScript({ content: `(() => {
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'adoptedStyleSheets');
    globalThis.__adoptedBeforeReady = 0;
    Object.defineProperty(Document.prototype, 'adoptedStyleSheets', { ...d, set(v) {
      if (!document.documentElement?.hasAttribute('data-sunglasses-ready')) globalThis.__adoptedBeforeReady = Math.max(globalThis.__adoptedBeforeReady, v.length);
      d.set.call(this, v);
    } });
  })();` });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-sunglasses-ready'));
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ early: globalThis.__adoptedBeforeReady, now: document.adoptedStyleSheets.length, canvas: __sanAudit.canvasColor().luminance }));
  assert.ok(r.early >= 1, `cached sheet adopted before the engine was ready (${r.early})`);
  assert.equal(r.now, 0, 'cached sheet dropped once the engine is ready');
  assert.ok(r.canvas < 0.1, `dark after reload (${JSON.stringify(r)})`);
  await context.close();
});
