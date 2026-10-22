// "Fix something on this page" on WebKit: the picker (picker.js) finds a
// lasting address for the element you point at, saves the one-tap fix to
// this site's settings, and content.js applies it at once and on the next
// visit. Picking never presses the page's links or buttons, Esc leaves, and
// Undo takes the fix back out. Fixture: a header like the Chrome Web Store
// dashboard's: a wordmark picture the engine leaves dark, grey subtitle text\n// with hashed class names, and an SVG icon.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServers, launch, openPage } from './harness.js';
import { bundle } from '../engine/scripts/bundle.js';
import { defaultSettings } from '../engine/src/settings.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const pickerBundle = () => bundle(resolve(ROOT, 'engine/src/picker.js'));
const coreBundle = () => bundle(resolve(ROOT, 'engine/src/picker-core.js'), { globalName: '__sanPickerCore' });

let servers, browser;
before(async () => { servers = await startServers(); browser = await launch(); });
after(async () => { await browser?.close(); await servers?.close(); });

const stored = (page) => page.evaluate(async () => (await browser.storage.local.get('settings')).settings);
const pickerOpen = (page) => page.evaluate(() => !!document.querySelector('[data-sunglasses-at-night="picker"]'));

async function centerOf(page, selector) {
  const box = await page.locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('picker: click the wordmark picture, Flip colors, saved and applied; applied again on the next visit', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/picker.html', { extension: true });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.wordmark')).filter), 'none', 'the engine leaves pictures alone');
  await page.addScriptTag({ content: pickerBundle() });
  assert.equal(await pickerOpen(page), true);
  const at = await centerOf(page, '.wordmark');
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  // The menu opens with its first fix focused, in a 2×2 grid: Lighter text,
  // Darker background / Flip colors, Hide. Arrow keys move in the grid (Tab
  // depends on the browser's keyboard setting).
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('style[data-sunglasses-at-night="site-fix"]')?.textContent.includes('invert'));

  const settings = await stored(page);
  const fixes = settings.sites['127.0.0.1']?.fixes;
  assert.equal(fixes?.length, 1, 'one fix saved for this site');
  assert.equal(fixes[0].action, 'flip');
  assert.equal(fixes[0].label, 'Picture');
  assert.equal(await page.evaluate((s) => document.querySelectorAll(s).length, fixes[0].selector), 1, `${fixes[0].selector} finds one element`);
  assert.equal(await page.evaluate((s) => document.querySelector(s) === document.querySelector('.wordmark'), fixes[0].selector), true);
  const flipped = /invert\(1\)|invert\(100%\)/;
  assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('.wordmark')).filter), flipped);
  await context.close();

  // Next visit: the stored settings alone bring the fix back.
  const again = await openPage(browser, servers, '/picker.html', { extension: true, settings });
  await again.page.waitForFunction(() => document.querySelector('style[data-sunglasses-at-night="site-fix"]'));
  assert.match(await again.page.evaluate(() => getComputedStyle(document.querySelector('.wordmark')).filter), flipped);
  await again.context.close();
});

test('picker: grey subtitle, Lighter text, comes out near-white', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/picker.html', { extension: true });
  const color = () => page.evaluate(() => getComputedStyle(document.querySelector('#top span')).color);
  const before = await color();
  await page.addScriptTag({ content: pickerBundle() });
  const at = await centerOf(page, '#top span');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter'); // Lighter text
  await page.waitForFunction(() => document.querySelector('style[data-sunglasses-at-night="site-fix"]')?.textContent.includes('color:'));
  const fixes = (await stored(page)).sites['127.0.0.1'].fixes;
  assert.deepEqual(fixes, [{ selector: '#top > span', action: 'lighter', label: '“Developer Dashboard”' }]);
  const after = await color();
  assert.ok(luminance(after) > luminance(before), `lighter than before (${before} → ${after})`);
  assert.ok(luminance(after) > 0.6, `near-white (${after})`);
  await context.close();
});

test('picker: Undo takes the fix back out', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/picker.html', { extension: true });
  await page.addScriptTag({ content: pickerBundle() });
  const at = await centerOf(page, '#top span');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  await page.waitForFunction(async () => (await browser.storage.local.get('settings')).settings.sites['127.0.0.1']);
  // The toast's Undo button has focus.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('[data-sunglasses-at-night="picker"]'));
  assert.deepEqual((await stored(page)).sites, {});
  await context.close();
});

test('picker: the page never gets the press, and Esc leaves without saving', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/picker.html', { extension: true });
  const url = page.url();
  await page.addScriptTag({ content: pickerBundle() });
  for (const sel of ['#away', '#buy']) {
    const at = await centerOf(page, sel);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Escape'); // closes the menu, keeps picking
  }
  await page.waitForTimeout(300);
  assert.equal(page.url(), url, 'the link was not followed');
  assert.equal(await page.evaluate(() => window.__pressed === true), false, 'the button was not pressed');
  assert.equal(await pickerOpen(page), true);
  await page.keyboard.press('Escape'); // leaves
  assert.equal(await pickerOpen(page), false);
  assert.deepEqual((await stored(page)).sites, {});
  await context.close();
});

test('picker: a second injection while picking does not stack a second picker', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/picker.html', { extension: true });
  await page.addScriptTag({ content: pickerBundle() });
  await page.addScriptTag({ content: pickerBundle() });
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-sunglasses-at-night="picker"]').length), 1);
  await context.close();
});

test('buildSelector: prefers names, skips hashed classes, anchors on an id, uses position only when it must', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/picker.html', { extension: false });
  await page.addScriptTag({ content: coreBundle() });
  const r = await page.evaluate(() => {
    const { buildSelector, pickTarget } = globalThis.__sanPickerCore;
    const cards = document.querySelectorAll('.card');
    return {
      link: buildSelector(document.getElementById('away')),
      subtitle: buildSelector(document.querySelector('#top span')),
      second: buildSelector(cards[1]),
      svgFromText: pickTarget(document.querySelector('.mark text')) === document.querySelector('.mark'),
      fromTextNode: pickTarget(document.querySelector('.card').firstChild) === cards[0],
    };
  });
  assert.equal(r.link, '#away');
  assert.equal(r.subtitle, '#top > span', 'hashed classes skipped, anchored on #top');
  assert.match(r.second, /div\.card:nth-of-type\(2\)$/);
  assert.equal(r.svgFromText, true, 'text inside an SVG picks the whole SVG');
  assert.equal(r.fromTextNode, true);
  await context.close();
});

test('picker: settings with a fix but dark mode off for the site leave the page alone', { timeout: 60000 }, async () => {
  const settings = { ...defaultSettings(), mode: 'always', sites: { '127.0.0.1': { rule: 'never', fixes: [{ selector: '#top span', action: 'hide' }] } } };
  const { page, context } = await openPage(browser, servers, '/picker.html', { extension: true, settings, ready: null });
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#top span')).display), 'none');
  await context.close();
});
