// T007 acceptance on WebKit: fixture pages render dark (root canvas dark,
// every visible text element on a dark background at ≥ 4.5:1), and the
// engine changes no element's pointer-events, adds no element other than its
// <style> sheets, and leaves every control hittable and clickable.
// Screenshots and a JSON summary go to ralph/evidence/t007-*.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServers, launch, openPage, evidencePath } from './harness.js';

const FIXTURES = [
  { name: 'light', path: '/light.html' },
  { name: 'inline', path: '/inline.html' },
  { name: 'spa', path: '/spa.html' },
  { name: 'shadow', path: '/shadow.html' },
  { name: 'cross-origin', path: '/cross-origin.html', crossOrigin: true },
  { name: 'links', path: '/links.html' },
  { name: 'shop', path: '/shop.html' },
  { name: 'shopify-dawn', path: '/shopify-dawn.html' },
];

let servers, browser;
const summary = {};

before(async () => {
  servers = await startServers();
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await servers?.close();
  if (!Object.keys(summary).length) return; // nothing ran: write no evidence
  summary._meta = { engine: 'webkit (Playwright 1.64.1)', date: new Date().toISOString() };
  writeFileSync(evidencePath('t007-e2e.json'), JSON.stringify(summary, null, 2) + '\n');
});

for (const fx of FIXTURES) {
  test(`${fx.name}: renders dark, readable, and nothing intercepts pointer events`, { timeout: 60000 }, async () => {
    const plain = await openPage(browser, servers, fx.path);
    const beforeSnap = await plain.page.evaluate(() => __sanAudit.snapshot());
    const beforeAudit = await plain.page.evaluate(() => __sanAudit.audit());
    await plain.page.screenshot({ path: evidencePath(`t007-${fx.name}-before.png`), fullPage: true });
    await plain.context.close();

    const dark = await openPage(browser, servers, fx.path, { extension: true });
    const { page } = dark;
    const afterSnap = await page.evaluate(() => __sanAudit.snapshot());
    const result = await page.evaluate(() => __sanAudit.audit());
    await page.screenshot({ path: evidencePath(`t007-${fx.name}-after.png`), fullPage: true });
    summary[fx.name] = {
      before: { rootLuminance: beforeAudit.rootLuminance, minRatio: beforeAudit.minRatio },
      after: result,
      ourElements: afterSnap.ours,
      sheetFetches: dark.fetchLog,
    };

    // The fixture really was light to begin with.
    assert.ok(beforeAudit.rootLuminance > 0.5, `${fx.name} baseline is not light`);

    // Renders dark and readable.
    assert.ok(result.rootLuminance < 0.1, `root canvas luminance ${result.rootLuminance}`);
    assert.ok(result.checked > 0, 'no text checked');
    assert.deepEqual(result.failures, [], `${result.failures.length} text element(s) not dark/readable`);

    // Only <style> elements were added; the page's own elements are unchanged
    // in number, order, pointer-events and hit-testing.
    assert.ok(afterSnap.ours.length > 0 && afterSnap.ours.every((t) => t === 'style'), `engine added ${afterSnap.ours}`);
    assert.deepEqual(afterSnap.elements.map((e) => e.tag), beforeSnap.elements.map((e) => e.tag), 'element structure changed');
    const peChanges = afterSnap.elements
      .map((e, i) => ({ el: e.label, before: beforeSnap.elements[i].pointerEvents, after: e.pointerEvents }))
      .filter((d) => d.before !== d.after);
    assert.deepEqual(peChanges, [], 'pointer-events changed');
    const blocked = afterSnap.elements
      .map((e, i) => ({ el: e.label, before: beforeSnap.elements[i].hittable, after: e.hittable }))
      .filter((d) => d.before === true && d.after !== true);
    assert.deepEqual(blocked, [], 'controls covered after darkening');

    if (fx.crossOrigin) {
      assert.ok(dark.fetchLog.length >= 1, 'cross-origin sheet was not re-fetched');
      assert.ok(dark.fetchLog.every((u) => u.startsWith(servers.CDN + '/')), `fetched outside the sheet origin: ${dark.fetchLog}`);
    } else {
      assert.deepEqual(dark.fetchLog, [], 'same-origin page triggered a re-fetch');
    }

    if (fx.name === 'shop') {
      // Real clicks: Playwright fails a click when another element would receive it.
      await page.click('#add-1');
      await page.click('#add-2');
      await page.fill('#qty', '3');
      await page.selectOption('#size', 'l');
      assert.equal(await page.textContent('#cart-count'), '2');
      assert.equal(await page.inputValue('#qty'), '3');
    }
    if (fx.name === 'shopify-dawn') {
      // Channel-list variables (T038): header, body and every section render dark,
      // and buttons that use one variable for background and text stay readable.
      const paint = await page.evaluate(() => {
        const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor;
        return {
          header: bg('.header'), body: bg('body'),
          sections: [...document.querySelectorAll('section')].map((s) => getComputedStyle(s).backgroundColor),
        };
      });
      const lum = (css) => {
        const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map((v) => {
          const c = Number(v) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      summary[fx.name].paint = paint;
      for (const [what, css] of Object.entries({ header: paint.header, body: paint.body })) {
        assert.ok(lum(css) < 0.1, `${what} stays light: ${css}`);
      }
      paint.sections.forEach((css, i) => assert.ok(lum(css) < 0.1, `section ${i} stays light: ${css}`));
      await page.click('#add-1');
      await page.click('#add-2');
    }
    if (fx.name === 'links') {
      await page.click('#jump');
      assert.equal(await page.evaluate(() => location.hash), '#target');
    }
    await dark.context.close();
  });
}
