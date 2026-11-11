// Interaction e2e (docs/interaction-matrix.md): removing a site rule or a fix
// offers Undo for 6 s, Reduce Motion stops every transition (pseudo-elements
// too), and a pending Reset cannot be pressed twice. The real popup and
// options pages in WebKit against the ui-shim API; only a loopback server
// this file starts is contacted.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './harness.js';
import { shim } from './ui-shim.js';
import { defaultSettings } from '../engine/src/settings.js';
import { UNDO_MS } from '../engine/src/undo-toast.js';

const RES = fileURLToPath(new URL('../Extension/Resources/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript' };
const LOOK = { brightness: 90, contrast: 100, sepia: 0, grayscale: 0 };
const SITES = {
  'a.test': { rule: 'never' },
  'example.com': { rule: 'always', look: LOOK, fixes: [{ selector: '#banner', action: 'hide', label: 'Banner' }] },
};

let server, base, browser;

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
  await browser?.close();
  await new Promise((r) => server.close(r));
});

async function open(name, { reducedMotion = 'no-preference', viewport = { width: 360, height: 560 } } = {}) {
  const context = await browser.newContext({ colorScheme: 'dark', viewport, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript({ content: shim({ settings: { ...defaultSettings(), sites: SITES }, tabUrl: 'https://example.com/', report: { on: true, reason: 'mode-always' } }) });
  await page.goto(`${base}/${name}/${name}.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#sites li').length === 2);
  // The popup holds itself at the top for its first 800 ms (openAtTop).
  if (name === 'popup') await page.waitForTimeout(900);
  return { context, page, errors };
}

const sites = (page) => page.evaluate(() => globalThis.__data.settings.sites);
// Settled state: the toast leaves over --dur-exit.
const toastShown = async (page) => {
  await page.waitForTimeout(250);
  return page.evaluate(() => getComputedStyle(document.getElementById('toast')).visibility === 'visible');
};

for (const name of ['popup', 'options']) {
  test(`${name}: removing a site rule offers Undo, which puts the whole rule back and takes focus there`, async () => {
    const { context, page, errors } = await open(name);
    assert.equal(await toastShown(page), false, 'no toast (and no Undo in the tab order) before a removal');
    if (name === 'popup') await page.click('#more-settings > summary');
    await page.click('#sites button[data-host="example.com"]');
    await page.waitForFunction(() => document.querySelectorAll('#sites li').length === 1);
    assert.deepEqual(Object.keys(await sites(page)), ['a.test'], 'the removal is saved at once');
    assert.equal(await toastShown(page), true);
    assert.equal(await page.textContent('#toast-text'), 'Removed rule for example.com');
    const box = await page.locator('#toast-undo').boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44, 'Undo is at least 44 px');

    await page.click('#toast-undo');
    await page.waitForFunction(() => document.querySelectorAll('#sites li').length === 2);
    assert.deepEqual((await sites(page))['example.com'], SITES['example.com'], 'rule, look and fixes are all back');
    assert.equal(await toastShown(page), false);
    await page.waitForTimeout(400); // the popup re-renders once more after 300 ms
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.host), 'example.com', 'focus is on the restored row');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('popup: removing a fix offers Undo; Cmd/Ctrl+Z does the same; a later change withdraws the offer', async () => {
  const { context, page, errors } = await open('popup');
  await page.click('#fixes button.remove');
  await page.waitForFunction(() => document.querySelectorAll('#fixes li').length === 0);
  assert.equal((await sites(page))['example.com'].fixes, undefined);
  assert.equal(await page.textContent('#toast-text'), 'Removed fix: Banner');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForFunction(() => document.querySelectorAll('#fixes li').length === 1);
  assert.deepEqual((await sites(page))['example.com'], SITES['example.com']);

  await page.click('#fixes button.remove');
  await page.waitForFunction(() => document.querySelectorAll('#fixes li').length === 0);
  assert.equal(await toastShown(page), true);
  await page.check('input[name="rule"][value="never"]', { force: true });
  await page.waitForFunction(() => globalThis.__data.settings.sites['example.com'].rule === 'never');
  assert.equal(await toastShown(page), false, 'an old Undo would overwrite the newer choice');
  assert.deepEqual(errors, []);
  await context.close();
});

test(`options: the Undo offer leaves after ${UNDO_MS / 1000} s, but not from under the pointer`, { timeout: 30000 }, async () => {
  const { context, page } = await open('options', { viewport: { width: 900, height: 700 } });
  await page.click('#sites button[data-host="a.test"]');
  await page.hover('#toast');
  await page.waitForTimeout(UNDO_MS + 500);
  assert.equal(await toastShown(page), true, 'stays while hovered');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(UNDO_MS + 500);
  assert.equal(await toastShown(page), false);
  assert.deepEqual(Object.keys(await sites(page)), ['example.com'], 'the rule stays removed');
  await context.close();
});

test('popup: Reduce Motion stops every transition and animation, pseudo-elements included', async () => {
  const durations = () => {
    const d = (el, pseudo) => getComputedStyle(el, pseudo).transitionDuration;
    document.getElementById('more-settings').open = true;
    return {
      thumb: d(document.querySelector('.thumb')),
      tick: d(document.getElementById('force-dark'), '::after'),
      bridge: d(document.getElementById('site'), '::before'),
      chevron: d(document.querySelector('#more-settings > summary'), '::after'),
      toast: d(document.getElementById('toast')),
      reveal: getComputedStyle(document.querySelector('#more-settings > fieldset')).animationName,
    };
  };
  const still = await open('popup', { reducedMotion: 'reduce' });
  const off = await still.page.evaluate(durations);
  for (const [k, v] of Object.entries(off)) {
    if (k === 'reveal') assert.equal(v, 'none');
    else assert.ok(v.split(', ').every((t) => t === '0s'), `${k}: ${v}`);
  }
  await still.context.close();

  const moving = await open('popup');
  const on = await moving.page.evaluate(durations);
  assert.ok(on.thumb.includes('0.18s') && on.tick === '0.18s' && on.reveal === 'reveal', JSON.stringify(on));
  // First paint is never animated: nothing outside "More settings" has an animation.
  assert.equal(await moving.page.evaluate(() => {
    document.getElementById('more-settings').open = false;
    return [...document.querySelectorAll('body, body *')].filter((el) => getComputedStyle(el).animationName !== 'none' && el.getClientRects().length).length;
  }), 0);
  await moving.context.close();
});

test('popup: Reset all cannot be pressed twice while it is pending', async () => {
  const { context, page } = await open('popup');
  await page.click('#more-settings > summary');
  await page.click('#reset');
  await page.evaluate(() => {
    const send = browser.runtime.sendMessage;
    browser.runtime.sendMessage = async (m) => { await new Promise((r) => setTimeout(r, 300)); return send(m); };
  });
  await page.click('#reset-go');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('reset-go').disabled, document.getElementById('reset-cancel').disabled]), [true, true]);
  await page.waitForFunction(() => document.getElementById('reset-done').textContent !== '');
  assert.equal(await page.textContent('#reset-done'), 'All settings were reset.');
  assert.equal(await page.evaluate(() => __sent.filter((m) => m.type.endsWith('reset-all')).length), 1);
  await context.close();
});
