// T010 e2e: the real popup and options pages (Extension/Resources) in
// WebKit, with a stand-in for the WebExtension API. Checks the restricted-
// page state, that keyboard Tab reaches only native, named controls, that a
// rule set from the keyboard is saved, and the Reset dialog's focus handling.
// Screenshots go to ralph/evidence/t010-*.png. Only a loopback server this
// file starts is contacted.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, evidencePath } from './harness.js';
import { shim } from './ui-shim.js';
import { defaultSettings } from '../engine/src/settings.js';

const RES = fileURLToPath(new URL('../Extension/Resources/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript' };

let server, base, browser;
const results = [];

before(async () => {
  server = createServer((req, res) => {
    const file = resolve(RES, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(RES) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launch();
});

after(async () => {
  writeFileSync(evidencePath('t010-e2e.json'), JSON.stringify(results, null, 2) + '\n');
  await browser?.close();
  await new Promise((r) => server.close(r));
});

async function open(page, { scheme = 'light', settings = defaultSettings(), tabUrl = 'https://example.com/', report } = {}) {
  const context = await browser.newContext({ colorScheme: scheme, viewport: { width: page === 'popup' ? 340 : 760, height: 760 } });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.addInitScript({ content: shim({ settings, tabUrl, report }) });
  await p.goto(`${base}/${page}/${page}.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.getElementById('status')?.textContent !== 'Loading…' || !document.getElementById('status'));
  return { p, context, errors };
}

// Tab through the page; describe each focused element. WebKit, like Safari
// with default settings, moves Tab only between text fields and selects;
// Option+Tab ('Alt+Tab') reaches every control, as Tab does once "Press Tab
// to highlight each item" / Keyboard navigation is on. Check both.
async function tabOrder(p, max = 40, key = 'Tab') {
  await p.evaluate(() => document.activeElement?.blur());
  const seen = [];
  for (let i = 0; i < max; i++) {
    await p.keyboard.press(key);
    const d = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const labels = el.labels ? [...el.labels].map((l) => l.textContent.trim()).join(' ') : '';
      return {
        tag: el.tagName.toLowerCase(), type: el.type ?? '', id: el.id,
        name: (el.getAttribute('aria-label') || labels || el.textContent || '').replace(/\s+/g, ' ').trim(),
      };
    });
    if (!d) break;
    if (seen.length && seen[0].tag === d.tag && seen[0].id === d.id && seen[0].name === d.name) break;
    seen.push(d);
  }
  return seen;
}

const NATIVE = new Set(['button', 'input', 'select', 'a', 'textarea', 'summary']);

test('popup on a normal page: site controls, keyboard pass, rule saved from the keyboard', async () => {
  for (const scheme of ['light', 'dark']) {
    const { p, context, errors } = await open('popup', { scheme, report: { on: true, reason: 'mode-always' } });
    assert.equal(await p.isVisible('#site'), true);
    assert.equal(await p.textContent('#host'), 'example.com');
    assert.equal(await p.textContent('#status'), 'Dark mode is on for this page.');
    const order = await tabOrder(p);
    const allOrder = await tabOrder(p, 40, 'Alt+Tab');
    for (const el of [...order, ...allOrder]) {
      assert.ok(NATIVE.has(el.tag), `non-native focus stop ${JSON.stringify(el)}`);
      assert.ok(el.name, `unnamed focus stop ${JSON.stringify(el)}`);
    }
    assert.ok(allOrder.some((e) => e.tag === 'summary' && /More settings/.test(e.name)), `More settings reachable and named ${JSON.stringify(allOrder)}`);
    assert.ok(allOrder.some((e) => e.type === 'radio' && e.name), 'site rule reachable from the keyboard');
    await p.focus('input[name="rule"][value="never"]');
    await p.keyboard.press('Space');
    await p.waitForFunction(() => globalThis.__data.settings.sites?.['example.com']?.rule === 'never');
    await p.screenshot({ path: evidencePath(`t010-popup-${scheme}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ case: `popup-${scheme}`, order, allOrder });
    await context.close();
  }
});

test('popup on a restricted page: no site controls, says why', async () => {
  for (const tabUrl of ['about:blank', 'safari-web-extension://abc/options/options.html', 'file:///x.html']) {
    const { p, context, errors } = await open('popup', { tabUrl, report: null });
    assert.equal(await p.isVisible('#site'), false, tabUrl);
    assert.equal(await p.isVisible('#custom-look-row'), false, tabUrl);
    assert.match(await p.textContent('#status'), /can’t change this page/);
    assert.equal(await p.isVisible('#mode-tiles'), true, 'global mode still available');
    assert.equal(await p.isVisible('#power'), true, 'on/off switch still available');
    if (tabUrl === 'about:blank') await p.screenshot({ path: evidencePath('t010-popup-restricted.png'), fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ case: `popup-restricted ${tabUrl}`, ok: true });
    await context.close();
  }
});

test('popup in Safari: tab.url undefined, host comes from the stored report', async () => {
  const { p, context, errors } = await open('popup', { tabUrl: null, report: { on: true, reason: 'mode-always', host: 'example.com' } });
  assert.equal(await p.isVisible('#site'), true);
  assert.equal(await p.textContent('#host'), 'example.com');
  assert.equal(await p.textContent('#status'), 'Dark mode is on for this page.');
  await p.focus('input[name="rule"][value="never"]');
  await p.keyboard.press('Space');
  await p.waitForFunction(() => globalThis.__data.settings.sites?.['example.com']?.rule === 'never');
  assert.deepEqual(errors, []);
  results.push({ case: 'popup-safari-no-tab-url', ok: true });
  await context.close();
});

test('popup with no tab.url and no stored host is restricted', async () => {
  const { p, context } = await open('popup', { tabUrl: null, report: null });
  assert.equal(await p.isVisible('#site'), false);
  assert.match(await p.textContent('#status'), /can’t change this page/);
  await context.close();
});

test('popup on an already-dark page shows the note and the override', async () => {
  const { p, context } = await open('popup', { report: { on: false, reason: 'already-dark' } });
  assert.equal(await p.isVisible('#already-dark'), true);
  await p.check('#force-dark');
  await p.waitForFunction(() => globalThis.__data.settings.sites?.['example.com']?.detectDark === false);
  await p.screenshot({ path: evidencePath('t010-popup-already-dark.png'), fullPage: true });
  results.push({ case: 'popup-already-dark', ok: true });
  await context.close();
});

test('popup: "Fix something on this page" injects the picker and closes; your fixes are listed and removable', async () => {
  const settings = {
    ...defaultSettings(),
    sites: { 'example.com': { rule: 'default', fixes: [
      { selector: '#top > span', action: 'lighter', label: '“Developer Dashboard”' },
      { selector: 'img.wordmark', action: 'flip', label: 'Picture' },
    ] } },
  };
  const { p, context, errors } = await open('popup', { settings, report: { on: true, reason: 'mode-always', host: 'example.com' } });
  await p.evaluate(() => { globalThis.close = () => { globalThis.__closed = true; }; });
  // The popup scrolls back to the top on its first focus for 800 ms after
  // opening (popup.js openAtTop); a click below the fold waits that out.
  await p.waitForTimeout(900);
  const rows = await p.$$eval('#fixes li', (lis) => lis.map((li) => [li.querySelector('.what').textContent, li.querySelector('.summary').textContent]));
  assert.deepEqual(rows, [['“Developer Dashboard”', 'Lighter text'], ['Picture', 'Flip colors']]);
  assert.equal(await p.getAttribute('#fixes li:nth-child(1) .remove', 'aria-label'), 'Remove fix: Lighter text, “Developer Dashboard”');
  await p.click('#fixes li:nth-child(1) .remove');
  await p.waitForFunction(() => globalThis.__data.settings.sites['example.com'].fixes.length === 1);
  assert.equal(await p.locator('#fixes li').count(), 1);
  await p.click('#pick');
  await p.waitForFunction(() => globalThis.__closed === true);
  assert.deepEqual(await p.evaluate(() => globalThis.__injected), [{ target: { tabId: 5 }, files: ['content/picker.js'] }]);
  assert.deepEqual(errors, []);
  results.push({ case: 'popup-fixes', ok: true });
  await context.close();
});

test('options page: named remove buttons, keyboard pass, Reset dialog focus', async () => {
  const settings = { ...defaultSettings(), mode: 'schedule', sites: { 'a.test': { rule: 'never' }, 'b.test': { rule: 'always' } } };
  for (const scheme of ['light', 'dark']) {
    const { p, context, errors } = await open('options', { scheme, settings });
    await p.waitForSelector('#sites li');
    const labels = await p.$$eval('#sites button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
    assert.deepEqual(labels, ['Remove rule for a.test', 'Remove rule for b.test']);
    assert.equal(await p.isVisible('#schedule'), true);
    const order = await tabOrder(p, 60);
    const allOrder = await tabOrder(p, 60, 'Alt+Tab');
    for (const el of [...order, ...allOrder]) {
      assert.ok(NATIVE.has(el.tag), `non-native focus stop ${JSON.stringify(el)}`);
      assert.ok(el.name, `unnamed focus stop ${JSON.stringify(el)}`);
    }
    for (const name of ['Remove rule for a.test', 'Remove rule for b.test', 'Reset all settings…']) {
      assert.ok(allOrder.some((e) => e.tag === 'button' && e.name === name), `${name} reachable ${JSON.stringify(allOrder)}`);
    }
    await p.screenshot({ path: evidencePath(`t010-options-${scheme}.png`), fullPage: true });
    if (scheme === 'light') {
      await p.click('#sites button[aria-label="Remove rule for a.test"]');
      await p.waitForFunction(() => !globalThis.__data.settings.sites['a.test']);
      await p.focus('#reset');
      await p.keyboard.press('Enter');
      assert.equal(await p.evaluate(() => document.getElementById('reset-dialog').open), true);
      assert.equal(await p.evaluate(() => document.activeElement.textContent.trim()), 'Cancel');
      await p.screenshot({ path: evidencePath('t010-options-reset-dialog.png') });
      await p.keyboard.press('Escape');
      assert.equal(await p.evaluate(() => document.getElementById('reset-dialog').open), false);
      assert.equal(await p.evaluate(() => document.activeElement.id), 'reset');
      assert.equal((await p.evaluate(() => globalThis.__data.settings.mode)), 'schedule', 'Escape does not reset');
      await p.keyboard.press('Enter');
      await p.click('dialog button[value="reset"]');
      await p.waitForFunction(() => document.getElementById('reset-done').textContent === 'All settings were reset.');
      assert.equal(await p.evaluate(() => globalThis.__data.settings.mode), 'system');
    }
    assert.deepEqual(errors, []);
    results.push({ case: `options-${scheme}`, order, allOrder });
    await context.close();
  }
});
