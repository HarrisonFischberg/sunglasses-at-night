// Regression: dialogs, popovers, menus and modals must stand out from the
// dark page (owner report 2026-10-28: they blend into it). On the light page
// a white surface floats on its shadow; on a dark page that dark shadow
// disappears, so the surface needs its own lighter dark. Measured on the
// screenshot (what is painted, backdrops and shadows included): the surface
// just inside its edge against the page just outside its shadow.
// Fixture: e2e/fixtures/regression/layers.html, production content script.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServers, launch, openPage } from './harness.js';
import { decodePng } from './png.js';
import { relativeLuminance } from '../engine/src/color.js';
import { artifact } from './regression-kit.js';

let servers, browser;
before(async () => { servers = await startServers(); browser = await launch(); });
after(async () => { await browser?.close(); await servers?.close(); });

// Below this a surface's edge is hard to see without its shadow. Material's
// lowest dark elevation step is about 1.12; the page's own text needs 4.5.
const MIN_EDGE = 1.15;
const lum = ([r, g, b]) => relativeLuminance({ r: r / 255, g: g / 255, b: b / 255, alpha: 1 });
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const LAYERS = [
  { name: 'menu', open: '#open-menu', surface: '#menu', side: 'right' },
  { name: 'dialog', open: '#open-dialog', surface: '#dlg', side: 'right' },
  { name: 'popover', open: '#open-popover', surface: '#pop', side: 'bottom' },
  { name: 'custom-modal', open: '#open-modal', surface: '#modal-panel', side: 'right' },
];

async function edge(page, surface, side) {
  const b = await page.locator(surface).boundingBox();
  const shot = decodePng(await page.screenshot());
  const y = b.y + b.height / 2, x = b.x + b.width / 2;
  // Inside: 4 px in from the edge. Outside: 48 px out, past the shadow blur.
  const inside = side === 'right' ? shot.at(b.x + b.width - 4, y) : shot.at(x, b.y + b.height - 4);
  const outside = side === 'right' ? shot.at(Math.min(b.x + b.width + 48, shot.width - 1), y) : shot.at(x, Math.min(b.y + b.height + 48, shot.height - 1));
  return { inside, outside, ratio: +ratio(inside, outside).toFixed(3) };
}

for (const L of LAYERS) {
  test(`layers: the open ${L.name} stands out from the dark page, and its text is readable`, { timeout: 60000 }, async () => {
    const results = {};
    for (const extension of [false, true]) {
      const { page, context } = await openPage(browser, servers, '/regression/layers.html', { extension });
      await page.click(L.open);
      await page.waitForTimeout(300);
      const e = await edge(page, L.surface, L.side);
      const contrast = await page.evaluate((s) => __sanAudit.textContrast(document.querySelector(s)), L.surface);
      artifact(`layers-${L.name}-${extension ? 'on' : 'off'}.png`, await page.screenshot());
      results[extension ? 'on' : 'off'] = { ...e, contrast };
      await context.close();
    }
    artifact(`layers-${L.name}.json`, results);
    const on = results.on;
    assert.ok(lum(on.outside) < 0.2, `the page around it is dark (${on.outside})`);
    assert.ok(on.ratio >= MIN_EDGE, `${L.name} edge ${on.inside} vs page ${on.outside}: ratio ${on.ratio} < ${MIN_EDGE}`);
    const low = on.contrast.filter((c) => c.ratio < 4.5);
    assert.deepEqual(low, [], 'text inside it readable');
  });
}

test('layers: typing into an input inside the dialog and the modal stays readable', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/regression/layers.html', { extension: true });
  const out = {};
  for (const [open, input, close] of [['#open-dialog', '#dlg-input', '#dlg-close'], ['#open-modal', '#modal-input', '#modal-close']]) {
    await page.click(open);
    await page.click(input);
    await page.keyboard.type('Typed text');
    out[input] = await page.evaluate((s) => __sanAudit.textContrast(document.querySelector(s)), input);
    await page.click(close);
    await page.waitForTimeout(200);
  }
  artifact('layers-typing.json', out);
  for (const [k, list] of Object.entries(out)) assert.ok(list.length && list.every((c) => c.ratio >= 4.5), `${k}: ${JSON.stringify(list)}`);
  // Dismissed: nothing of the layers left on screen.
  assert.equal(await page.evaluate(() => document.getElementById('dlg').open || document.getElementById('overlay').classList.contains('open')), false);
  await context.close();
});
