// Regression gallery: each page in e2e/fixtures/regression/ with the
// extension off and on (production content script), real interactions, and
// toggles. Text contrast is measured on what the browser computed, with
// backgrounds composited up the tree; a failure that also happens with the
// extension off is the site's own and is reported, not counted against us.
// Screenshots (off/on per page) go to the artifacts folder: they are the
// fixture gallery, for review by eye. They are not baselines and nothing
// here approves one.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServers, launch, openPage } from './harness.js';
import { decodePng } from './png.js';
import { relativeLuminance, contrastRatio, parseColor } from '../engine/src/color.js';
import { defaultSettings } from '../engine/src/settings.js';
import { artifact, styleChanges } from './regression-kit.js';

let servers, browser;
before(async () => { servers = await startServers(); browser = await launch(); });
after(async () => { await browser?.close(); await servers?.close(); });

const PAGES = ['forms', 'inputs', 'layers', 'css-cases', 'embedded', 'media'];
const px = (shot, x, y) => { const [r, g, b] = shot.at(x, y); return { r: r / 255, g: g / 255, b: b / 255, alpha: 1 }; };

/** Contrast failures (< 4.5) with the extension off and on; regressions are the on-only ones. */
async function contrastBoth(path) {
  const res = {};
  for (const extension of [false, true]) {
    const { page, context } = await openPage(browser, servers, path, { extension });
    res[extension ? 'on' : 'off'] = await page.evaluate(() => __sanAudit.audit({ maxTextBgLuminance: 1 }));
    artifact(`gallery/${path.split('/').pop().replace('.html', '')}-${extension ? 'on' : 'off'}.png`, await page.screenshot({ fullPage: true }));
    await context.close();
  }
  const offFailed = new Set(res.off.failures.map((f) => f.el));
  const regressions = res.on.failures.filter((f) => !offFailed.has(f.el));
  return { ...res, regressions, siteOwn: res.on.failures.filter((f) => offFailed.has(f.el)) };
}

for (const name of PAGES) {
  test(`gallery ${name}: text readable with the extension on; page dark`, { timeout: 60000 }, async () => {
    const r = await contrastBoth(`/regression/${name}.html`);
    artifact(`gallery/${name}.json`, r);
    assert.ok(r.on.rootLuminance < 0.05, `page canvas dark (${r.on.rootLuminance})`);
    assert.deepEqual(r.regressions, [], 'no text the extension made unreadable');
  });
}

test('gallery own-dark: a site with its own dark theme is left as it is', { timeout: 60000 }, async () => {
  const off = await openPage(browser, servers, '/regression/own-dark.html');
  const on = await openPage(browser, servers, '/regression/own-dark.html', { extension: true, ready: null });
  const changes = styleChanges(await off.page.evaluate(() => __sanAudit.styles()), await on.page.evaluate(() => __sanAudit.styles()));
  artifact('gallery/own-dark-off.png', await off.page.screenshot());
  artifact('gallery/own-dark-on.png', await on.page.screenshot());
  artifact('gallery/own-dark.json', { changes });
  assert.deepEqual(changes, []);
  await off.context.close();
  await on.context.close();
});

test('inputs: typed text, placeholders and carets readable in every field, focused and not', { timeout: 90000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/regression/inputs.html', { extension: true });
  const placeholders = await page.evaluate(() => [...document.querySelectorAll('[placeholder]')].map((e) => {
    // ::placeholder color against the field's own background.
    const p = getComputedStyle(e, '::placeholder').color;
    return { id: e.id, placeholder: p, ratio: +__sanAudit.textContrast(e)[0]?.ratio || null };
  }));
  const ids = await page.evaluate(() => [...document.querySelectorAll('input:not([disabled]),textarea,[contenteditable]')].map((e) => e.id));
  const typed = [];
  for (const id of ids) {
    await page.click(`#${id}`);
    await page.keyboard.type('Typed text');
    await page.waitForTimeout(150); // scripts that restyle on input, and the engine after them
    const focused = await page.evaluate((i) => {
      const e = document.getElementById(i);
      const t = e.querySelector('span') ?? e;
      const cs = getComputedStyle(t);
      const c = __sanAudit.textContrast(t)[0] ?? null;
      return { id: i, text: c, caret: cs.caretColor, outline: `${cs.outlineStyle} ${cs.outlineColor}` };
    }, id);
    typed.push(focused);
  }
  await page.click('#submit');
  const submitted = await page.evaluate(() => window.__submitted);
  await page.mouse.click(900, 20); // blur
  const blurred = await page.evaluate((list) => list.map((i) => ({ id: i, text: __sanAudit.textContrast(document.getElementById(i))[0] ?? null })), ids);
  artifact('inputs-typed.png', await page.screenshot({ fullPage: true }));
  artifact('inputs-typed.json', { placeholders, typed, blurred, submitted });
  const bad = [...typed, ...blurred].filter((t) => !t.text || t.text.ratio < 4.5);
  assert.deepEqual(bad, [], 'typed text readable');
  // The caret is drawn in caret-color; it must show on the field.
  for (const t of typed) {
    const caret = parseColor(t.caret);
    assert.ok(caret && relativeLuminance(caret) > 0.3, `${t.id}: caret ${t.caret} visible on a dark field`);
  }
  assert.equal(submitted, 1, 'the form still submits');
  await context.close();
});

test('css-cases: hover state, text selection and the patterned background stay readable', { timeout: 60000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/regression/css-cases.html', { extension: true });
  await page.hover('#hover');
  const hover = await page.evaluate(() => __sanAudit.textContrast(document.getElementById('hover'))[0]);
  // Select a sentence: the selection colors must keep it readable.
  await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('select-me')); getSelection().addRange(r); });
  const sel = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('select-me'), '::selection'); return { bg: cs.backgroundColor, color: cs.color }; });
  artifact('css-cases-hover-select.png', await page.screenshot());
  const selRatio = contrastRatio(parseColor(sel.color), parseColor(sel.bg));
  artifact('css-cases-states.json', { hover, selection: { ...sel, ratio: selRatio } });
  assert.ok(hover.ratio >= 4.5, `hover: ${JSON.stringify(hover)}`);
  assert.ok(selRatio >= 4.5, `selection: ${JSON.stringify(sel)}`);
  await context.close();
});

test('embedded: shadow root, frames, inserted content and SPA navigation all go dark and stay readable', { timeout: 90000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/regression/embedded.html', { extension: true });
  const out = {};
  out.shadow = await page.evaluate(() => __sanAudit.textContrast(document.querySelector('info-card'))[0]);
  for (const id of ['same', 'cross']) {
    const frame = page.frameLocator(`#${id}`);
    await frame.locator('#frame-input').click();
    await page.keyboard.type('4242 4242');
    const inner = page.frames().find((f) => f.url().includes(id === 'same' ? '/regression/frame.html' : 'regression-frame.html'));
    const colors = await inner.evaluate(() => ({ text: getComputedStyle(document.getElementById('frame-text')).color, input: getComputedStyle(document.getElementById('frame-input')).color }));
    // A transparent frame shows the parent's paint: measure on the screenshot.
    const box = await page.locator(`#${id}`).boundingBox();
    const shot = decodePng(await page.screenshot());
    const behind = px(shot, box.x + box.width - 12, box.y + box.height - 12);
    out[id] = { ...colors, behind: shot.at(box.x + box.width - 12, box.y + box.height - 12), textRatio: +contrastRatio(parseColor(colors.text), behind).toFixed(2), inputRatio: +contrastRatio(parseColor(colors.input), behind).toFixed(2) };
  }
  await page.click('#add');
  await page.waitForTimeout(400);
  out.inserted = await page.evaluate(() => __sanAudit.textContrast(document.getElementById('inserted'))[0]);
  await page.click('#spa-link');
  await page.waitForTimeout(400);
  out.spa = await page.evaluate(() => ({ url: location.search, text: __sanAudit.textContrast(document.getElementById('page2'))[0], canvas: __sanAudit.canvasColor().luminance }));
  artifact('embedded-after.png', await page.screenshot({ fullPage: true }));
  artifact('embedded.json', out);
  assert.ok(out.shadow.ratio >= 4.5, `shadow: ${JSON.stringify(out.shadow)}`);
  for (const id of ['same', 'cross']) {
    assert.ok(out[id].textRatio >= 4.5 && out[id].inputRatio >= 4.5, `${id} frame: ${JSON.stringify(out[id])}`);
  }
  assert.ok(out.inserted.ratio >= 4.5, `inserted: ${JSON.stringify(out.inserted)}`);
  assert.equal(out.spa.url, '?page=2');
  assert.ok(out.spa.text.ratio >= 4.5 && out.spa.canvas < 0.05, `after SPA navigation: ${JSON.stringify(out.spa)}`);
  await context.close();
});

test('media: photos keep their pixels, icons stay visible and keep their hue', { timeout: 60000 }, async () => {
  const shots = {};
  for (const extension of [false, true]) {
    const { page, context } = await openPage(browser, servers, '/regression/media.html', { extension });
    const at = async (sel, dx = 0.5, dy = 0.5) => { const b = await page.locator(sel).boundingBox(); return [b.x + b.width * dx, b.y + b.height * dy]; };
    const shot = decodePng(await page.screenshot());
    const points = { photo: await at('#photo', 0.3, 0.7), brand: await at('#icon-brand'), black: await at('#icon-black'), current: await at('#icon-current', 0.5, 0.8), page: [900, 300] };
    shots[extension ? 'on' : 'off'] = Object.fromEntries(Object.entries(points).map(([k, [x, y]]) => [k, shot.at(x, y)]));
    await context.close();
  }
  artifact('media.json', shots);
  const { on, off } = shots;
  const c = (a) => ({ r: a[0] / 255, g: a[1] / 255, b: a[2] / 255, alpha: 1 });
  assert.deepEqual(on.photo, off.photo, 'photo pixels unchanged');
  assert.ok(on.brand[0] > on.brand[1] + 60 && on.brand[0] > on.brand[2] + 60, `brand icon still red: ${on.brand}`);
  for (const k of ['black', 'current']) {
    assert.ok(contrastRatio(c(on[k]), c(on.page)) >= 3, `${k} icon visible on the dark page: ${on[k]} vs ${on.page}`);
  }
});

test('toggles: on and off three times leaves no duplicate sheets, and off restores every computed style', { timeout: 120000 }, async () => {
  const { page, context } = await openPage(browser, servers, '/regression/css-cases.html', { extension: true });
  const fresh = await openPage(browser, servers, '/regression/css-cases.html');
  const pristine = await fresh.page.evaluate(() => __sanAudit.styles());
  await fresh.context.close();
  const ours = () => page.evaluate(() => ({
    sheets: [...document.querySelectorAll('style[data-sunglasses-at-night]')].map((s) => s.getAttribute('data-sunglasses-at-night')).filter((r) => r !== 'manifest-base').sort(),
    adopted: document.adoptedStyleSheets.length,
    // Besides the stand-in for Safari's manifest css (a user sheet there, not a node).
    attrs: [...document.querySelectorAll('*')].filter((e) => e.getAttribute('data-sunglasses-at-night') !== 'manifest-base' && e !== document.documentElement)
      .flatMap((e) => [...e.attributes].map((a) => a.name)).filter((n) => /^data-(san|sunglasses)-/.test(n)),
    rootAttrs: [...document.documentElement.attributes].map((a) => a.name).filter((n) => /^data-(san|sunglasses)-/.test(n)),
  }));
  const set = (mode) => page.evaluate(async (m) => {
    const { settings } = await browser.storage.local.get('settings');
    await browser.storage.local.set({ settings: { ...settings, mode: m } });
  }, mode);
  const first = await ours();
  const rounds = [];
  for (let i = 0; i < 3; i++) {
    await set('off');
    await page.waitForTimeout(600);
    const off = { ...(await ours()), changes: styleChanges(pristine, await page.evaluate(() => __sanAudit.styles())) };
    await set('always');
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-sunglasses-ready'));
    await page.waitForTimeout(600);
    rounds.push({ off, on: await ours() });
  }
  artifact('toggles.json', { first, rounds });
  for (const [i, r] of rounds.entries()) {
    assert.deepEqual(r.off.sheets, [], `round ${i + 1} off: no sheet of ours left`);
    assert.deepEqual(r.off.attrs, [], `round ${i + 1} off: no attribute of ours left`);
    // data-sunglasses-off on the root switches the manifest css off once the
    // settings are known (early.js), on or off.
    assert.deepEqual(r.off.rootAttrs, ['data-sunglasses-off'], `round ${i + 1} off: only the manifest-css switch on the root`);
    assert.deepEqual(r.on.rootAttrs.sort(), first.rootAttrs.sort(), `round ${i + 1} on: the same root attributes as the first time`);
    assert.deepEqual(r.off.changes, [], `round ${i + 1} off: every computed style as the site made it`);
    assert.deepEqual(r.on.sheets, first.sheets, `round ${i + 1} on: the same sheets as the first time, none doubled`);
    assert.equal(r.on.adopted, first.adopted, `round ${i + 1} on: no extra adopted sheets`);
  }
  await context.close();
});

test('settings: a fix stored for another site, and the "never" rule, change nothing here', { timeout: 60000 }, async () => {
  const settings = { ...defaultSettings(), mode: 'always', sites: { '127.0.0.1': { rule: 'never', fixes: [] }, 'example.com': { rule: 'default', fixes: [{ selector: 'body', action: 'hide' }] } } };
  const off = await openPage(browser, servers, '/regression/forms.html');
  const on = await openPage(browser, servers, '/regression/forms.html', { extension: true, settings, ready: null });
  assert.deepEqual(styleChanges(await off.page.evaluate(() => __sanAudit.styles()), await on.page.evaluate(() => __sanAudit.styles())), []);
  await off.context.close();
  await on.context.close();
});
