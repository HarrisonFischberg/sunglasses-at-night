// Per-site fixes (site-fixes.js, lists from third_party/darkreader) on
// WebKit: the fix sheet lands after the engine's override sheet, so a fix
// rule beats the rewrite of the same selector without !important, and INVERT
// selectors get the inversion filter.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServers, launch, openPage } from './harness.js';

let servers, browser;
before(async () => { servers = await startServers(); browser = await launch(); });
after(async () => { await browser?.close(); await servers?.close(); });

const FIXES = [
  { url: ['*'], css: '.never-there { color: red; }' },
  { url: ['/site-fix\\.html/'], invert: ['.logo'], css: '.card { background-color: var(--darkreader-neutral-background); }' },
];

test('site fix: sheet after the override, fix rule wins, INVERT applied', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/site-fix.html', { extension: true, siteFixes: FIXES });
  await page.waitForFunction(() => document.querySelector('style[data-sunglasses-at-night="site-fix"]'));
  const r = await page.evaluate(() => {
    const roles = [...document.documentElement.children].filter((e) => e.localName === 'style').map((e) => e.getAttribute('data-sunglasses-at-night'));
    const neutral = getComputedStyle(document.documentElement).getPropertyValue('--darkreader-neutral-background').trim();
    const probe = document.createElement('i');
    probe.style.backgroundColor = neutral;
    document.body.append(probe);
    const want = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      roles,
      card: getComputedStyle(document.querySelector('.card')).backgroundColor,
      want,
      logoFilter: getComputedStyle(document.querySelector('.logo')).filter,
    };
  });
  assert.deepEqual(r.roles.slice(-3), ['override', 'dynamic', 'site-fix']);
  assert.equal(r.card, r.want, 'fix rule beats the override for .card');
  assert.match(r.logoFilter, /invert\(1\)|invert\(100%\)/);
  await context.close();
});

test('site fix: no matching fix, no fix sheet', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/light.html', { extension: true, siteFixes: FIXES });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => !!document.querySelector('style[data-sunglasses-at-night="site-fix"]')), false);
  await context.close();
});
