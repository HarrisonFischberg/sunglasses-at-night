// Regression: "Fix something on this page" must change the one part you
// picked and nothing else (owner report 2026-10-28: an edit meant for one
// field changed the whole page). Production picker.js and content script,
// real pointer and keyboard input, on e2e/fixtures/regression/forms.html.
// Each test logs what was picked (element, shadow context, selector, matches,
// applied CSS) and writes before/after/diff screenshots to the artifacts
// folder (regression-kit.js). The pixel comparison is before vs after in the
// same run, browser and viewport, so it needs no stored baseline.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServers, launch, openPage } from './harness.js';
import { bundle } from '../engine/scripts/bundle.js';
import { defaultSettings } from '../engine/src/settings.js';
import { artifact, styleChanges, compareShots } from './regression-kit.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const pickerBundle = bundle(resolve(ROOT, 'engine/src/picker.js'));
const PAGE = '/regression/forms.html';
const HOST = '127.0.0.1';
// The fix menu is a 2-column grid: Lighter text, Darker background / Flip
// colors, Hide / Remove dark mode. Arrow keys move in it (picker.js).
const KEYS = { lighter: [], darker: ['ArrowRight'], flip: ['ArrowDown'], hide: ['ArrowDown', 'ArrowRight'], original: ['ArrowDown', 'ArrowDown'] };

let servers, browser;
before(async () => { servers = await startServers(); browser = await launch(); });
after(async () => { await browser?.close(); await servers?.close(); });

const stored = (page) => page.evaluate(async () => (await browser.storage.local.get('settings')).settings);
const fixesOf = async (page) => (await stored(page)).sites[HOST]?.fixes ?? [];
const styles = (page) => page.evaluate(() => __sanAudit.styles());
const settle = (page) => page.waitForFunction(() => document.documentElement.hasAttribute('data-sunglasses-ready')).then(() => page.waitForTimeout(800));

// Rectangle of `locator` grown by `pad` px (focus rings, outlines), clipped to the viewport.
async function rectOf(page, locator, pad = 4) {
  const b = await page.locator(locator).boundingBox();
  return { x: Math.max(0, Math.floor(b.x - pad)), y: Math.max(0, Math.floor(b.y - pad)), width: Math.ceil(b.width + pad * 2), height: Math.ceil(b.height + pad * 2) };
}

async function clickCenter(page, locator) {
  const b = await page.locator(locator).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

// What the picker shows: its shadow root is closed, so the test reads the
// handle the bundle leaves on window (in Safari that's in the extension's
// own world, out of the page's reach).
const pickerState = (page) => page.evaluate(() => globalThis.__sunglassesAtNightPicker?.state?.() ?? null);

// A real click on one of the picker's buttons, found by its label.
async function pressMenuButton(page, label) {
  const r = (await pickerState(page)).buttons[label];
  assert.ok(r, `button ${label} shown`);
  await page.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2);
}

/** Diagnostics for one stored fix: where it points and what it matched. */
async function describeFix(page, fix) {
  return page.evaluate((f) => {
    const matched = [...document.querySelectorAll(f.selector)].map((e) => `<${e.localName}${e.id ? `#${e.id}` : ''}>`);
    const css = document.querySelector('style[data-sunglasses-at-night="site-fix"]')?.textContent ?? '';
    return { ...f, matched, appliedCss: css.split('\n').filter((l) => l.includes(f.selector) || l.includes('data-sunglasses-keep')) };
  }, fix);
}

test('picker: Remove dark mode on one input changes that input only; page and other inputs keep their look', { timeout: 90000 }, async () => {
  const { page, context } = await openPage(browser, servers, PAGE, { extension: true });
  await page.fill('#email', 'me@example.com');
  await page.fill('input[name="password"]', 'secret');
  await page.evaluate(() => document.activeElement.blur()); // the picker takes focus; compare like with like
  const before = await styles(page);
  const shotBefore = await page.screenshot();
  const region = await rectOf(page, '#email');
  await page.addScriptTag({ content: pickerBundle });
  await clickCenter(page, '#email');
  for (const k of KEYS.original) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-sunglasses-keep]'));
  // Let the toast go (Escape on the Undo button would undo nothing; wait it out).
  await page.evaluate(() => globalThis.__sunglassesAtNightPicker?.stop());
  await settle(page);
  const fixes = await fixesOf(page);
  const diag = await describeFix(page, fixes[0]);
  const afterStyles = await styles(page);
  const changes = styleChanges(before, afterStyles);
  const shotAfter = await page.screenshot();
  const outside = compareShots('picker-one-input', shotBefore, shotAfter, [region]);
  const contrast = await page.evaluate(() => __sanAudit.textContrast(document.getElementById('email')));
  artifact('picker-one-input.json', { picked: '<input#email> (top frame, no shadow root)', fix: diag, changes, pixelsChangedOutsideField: outside, contrast });

  assert.equal(fixes.length, 1);
  assert.deepEqual(diag.matched, ['<input#email>'], 'the selector finds exactly the picked input');
  const changedEls = [...new Set(changes.map((c) => c.el))];
  assert.deepEqual(changedEls, ['/html[0]/body[0]/form[1]#signin/input[1]#email'], `only #email changed: ${JSON.stringify(changes, null, 1)}`);
  const body = afterStyles['/html[0]/body[0]'];
  assert.equal(body.bg, before['/html[0]/body[0]'].bg, 'page background unchanged');
  assert.equal(outside, 0, 'no pixel outside the input changed (see picker-one-input-diff.png)');
  assert.equal(afterStyles['/html[0]/body[0]/form[1]#signin/input[1]#email'].bg, 'rgb(255, 255, 255)', 'the input shows the site’s own white');
  assert.ok(contrast.every((c) => c.ratio >= 4.5), `typed text readable on it: ${JSON.stringify(contrast)}`);
  await context.close();

  // Next visit: the stored fix alone restores the same result, still only there.
  const settings = { ...defaultSettings(), mode: 'always', sites: { [HOST]: { rule: 'default', fixes } } };
  const again = await openPage(browser, servers, PAGE, { extension: true, settings });
  await again.page.waitForFunction(() => document.querySelector('[data-sunglasses-keep]'));
  await settle(again.page);
  const fresh = await openPage(browser, servers, PAGE, { extension: true });
  const reloadChanges = styleChanges(await styles(fresh.page), await styles(again.page)).map((c) => c.el);
  assert.deepEqual([...new Set(reloadChanges)], ['/html[0]/body[0]/form[1]#signin/input[1]#email'], 'after reload, still only #email differs from a page without the fix');
  await again.context.close();
  await fresh.context.close();
});

test('picker: a positional pick (no id or name) flips exactly that input; Undo restores the page pixel for pixel', { timeout: 90000 }, async () => {
  const { page, context } = await openPage(browser, servers, PAGE, { extension: true });
  const target = '.field:nth-of-type(2) input'; // "Last name": only its position tells it apart
  const before = await styles(page);
  const shotBefore = await page.screenshot();
  const region = await rectOf(page, target);
  await page.addScriptTag({ content: pickerBundle });
  await clickCenter(page, target);
  for (const k of KEYS.flip) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /invert/.test(document.querySelector('style[data-sunglasses-at-night="site-fix"]')?.textContent ?? ''));
  await page.waitForTimeout(300);
  const fixes = await fixesOf(page);
  const diag = await describeFix(page, fixes[0]);
  const mid = await styles(page);
  const changes = styleChanges(before, mid);
  const shotMid = await page.screenshot({ animations: 'disabled' });
  // The picker's own toast sits over the page while it shows: leave it out.
  const [tx, ty, tw, th] = (await pickerState(page)).toast;
  const toast = { x: Math.floor(tx) - 30, y: Math.floor(ty) - 30, width: Math.ceil(tw) + 60, height: Math.ceil(th) + 60 };
  const outside = compareShots('picker-positional', shotBefore, shotMid, [region, toast]);
  artifact('picker-positional.json', { picked: target, fix: diag, changes, pixelsChangedOutsideField: outside });
  assert.equal(diag.matched.length, 1, `selector ${fixes[0].selector} is unique`);
  assert.equal(await page.evaluate(([s, t]) => document.querySelector(s) === document.querySelector(t), [fixes[0].selector, target]), true);
  assert.deepEqual([...new Set(changes.map((c) => c.el))].length, 1, `one element changed: ${JSON.stringify(changes)}`);
  assert.equal(outside, 0, 'no pixel outside the input changed');

  await page.keyboard.press('Enter'); // the toast's Undo has focus
  await page.waitForFunction(() => !document.querySelector('[data-sunglasses-at-night="picker"]'));
  await settle(page);
  assert.deepEqual((await stored(page)).sites, {}, 'undo removed the fix');
  assert.deepEqual(styleChanges(before, await styles(page)), [], 'every computed style back as before');
  assert.equal(compareShots('picker-undo', shotBefore, await page.screenshot()), 0, 'every pixel back as before');
  assert.equal(await page.evaluate(() => document.querySelectorAll('style[data-sunglasses-at-night="site-fix"]').length), 0, 'no fix sheet left behind');
  await context.close();
});

test('picker: a field inside a web component is never silently widened to the whole component', { timeout: 90000 }, async () => {
  const { page, context } = await openPage(browser, servers, PAGE, { extension: true });
  await page.addScriptTag({ content: pickerBundle });
  const inner = await page.locator('app-shell >> #q').boundingBox();
  await page.mouse.move(inner.x + inner.width / 2, inner.y + inner.height / 2);
  const hover = await pickerState(page);
  await page.mouse.click(inner.x + inner.width / 2, inner.y + inner.height / 2);
  const state = await pickerState(page);
  // Try every fix the menu offers for it.
  for (const label of ['Lighter text', 'Darker background', 'Flip colors', 'Hide', 'Remove dark mode']) {
    const r = state.buttons[label];
    if (r) await page.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2);
  }
  await page.waitForTimeout(800);
  const fixes = await fixesOf(page);
  artifact('picker-shadow-field.json', { picked: 'app-shell → #shadow-root(open) → input#q', hover, state, fixesSaved: fixes });
  const box = [inner.x - 2, inner.y - 2, inner.width + 4, inner.height + 4].map(Math.round);
  assert.deepEqual(hover.outline.map(Math.round), box, 'hover outlines the field itself, not the component');
  assert.deepEqual(state.outline.map(Math.round), box, 'the pick is the field itself');
  assert.match(state.message, /component/i, 'the menu says why it can’t be fixed on its own');
  assert.deepEqual(Object.keys(state.buttons).filter((b) => b !== 'Bigger area' && b !== 'Cancel'), [], 'no fix is offered for it');
  assert.deepEqual(fixes, [], `no fix saved for the whole component: ${JSON.stringify(fixes)}`);
  await context.close();
});

test('picker: choosing the whole component on purpose works, and unreadable text after Remove dark mode is reported', { timeout: 90000 }, async () => {
  const { page, context } = await openPage(browser, servers, PAGE, { extension: true });
  await page.addScriptTag({ content: pickerBundle });
  await clickCenter(page, 'app-shell >> #q');
  // "Bigger area" widens to the component, by choice.
  await pressMenuButton(page, 'Bigger area');
  for (const k of KEYS.original) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
  await page.waitForFunction(async () => (await browser.storage.local.get('settings')).settings.sites['127.0.0.1']?.fixes?.length);
  await page.waitForFunction(() => /hard to read/i.test(globalThis.__sunglassesAtNightPicker?.state?.().message ?? ''), null, { timeout: 5000 }).catch(() => {});
  const state = await pickerState(page);
  const fixes = await fixesOf(page);
  const contrast = await page.evaluate(() => __sanAudit.textContrast(document.querySelector('app-shell')));
  artifact('picker-component-conflict.json', { fix: await describeFix(page, fixes[0]), state, contrast });
  artifact('picker-component-conflict.png', await page.screenshot());
  assert.equal(fixes[0]?.selector, 'body > app-shell');
  const low = contrast.filter((c) => c.ratio < 3 && !c.image);
  assert.ok(low.length > 0, 'the fixture does produce unreadable text here (keep-original cannot reach inside the component)');
  assert.match(state?.message ?? '', /hard to read/i, `the picker reports the conflict: ${JSON.stringify(state)}`);
  await context.close();
});

test('picker: a part that went away before you chose a fix is not saved', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, PAGE, { extension: true });
  await page.addScriptTag({ content: pickerBundle });
  await clickCenter(page, '#email');
  // The page re-renders the field (SPA-style) while the menu is open.
  await page.evaluate(() => { const e = document.getElementById('email'); e.replaceWith(e.cloneNode(true)); });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const state = await pickerState(page);
  artifact('picker-stale.json', { state, fixes: await fixesOf(page) });
  assert.deepEqual(await fixesOf(page), []);
  assert.match(state?.message ?? '', /changed|again/i);
  await context.close();
});

test('stored fix: a selector that now matches more than one element is not applied to any of them', { timeout: 60000 }, async () => {
  // The picker saved "#signin > div.field > input" when there was one such
  // field; the page has two now.
  const fixes = [{ selector: '#signin > div.field > input', action: 'flip' }];
  const settings = { ...defaultSettings(), mode: 'always', sites: { [HOST]: { rule: 'default', fixes } } };
  const { page, context } = await openPage(browser, servers, PAGE, { extension: true, settings });
  await settle(page);
  const filters = await page.evaluate(() => [...document.querySelectorAll('#signin > div.field > input')].map((e) => getComputedStyle(e).filter));
  artifact('stored-ambiguous.json', { fixes, filters });
  assert.equal(filters.length, 2);
  assert.deepEqual(filters, ['none', 'none'], 'neither input flipped');
  await context.close();
});
