// Strict CSP (style-src 'self', no 'unsafe-inline') on WebKit: every <style>
// the extension adds is refused, so its sheets are mirrored into adopted
// constructable sheets (adopted.js). The page must end up dark and readable.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServers, launch, openPage } from './harness.js';

let servers, browser;
before(async () => { servers = await startServers(); browser = await launch(); });
after(async () => { await browser?.close(); await servers?.close(); });

test('strict CSP: our <style> sheets are refused, adopted mirrors darken the page', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/csp.html', { extension: true });
  const r = await page.evaluate(() => ({
    refused: [...document.querySelectorAll('style[data-sunglasses-at-night="override"]')].every((s) => !s.sheet),
    adopted: document.adoptedStyleSheets.length,
    audit: __sanAudit.audit(),
    panel: getComputedStyle(document.querySelector('.panel')).backgroundColor,
  }));
  assert.ok(r.refused, 'the fixture really refuses inline <style>');
  assert.ok(r.adopted >= 2, `mirrored sheets adopted (${r.adopted})`);
  assert.ok(r.audit.rootLuminance < 0.1, `page dark (root luminance ${r.audit.rootLuminance})`);
  assert.ok(r.audit.minRatio >= 4.5, `text readable (min ratio ${r.audit.minRatio})`);
  assert.notEqual(r.panel, 'rgb(242, 242, 242)');
  await context.close();
});
