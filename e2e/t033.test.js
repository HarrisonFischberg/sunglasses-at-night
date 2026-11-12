// T033 e2e: the popup at 360×560 keeps a constant document size and one inner
// scroll container, so wheel scrolling responds on every step even while the
// popup re-renders (300 ms after a change). Only a loopback server this file
// starts is contacted. Results: ralph/evidence/t033-e2e.json.

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
  writeFileSync(evidencePath('t033-e2e.json'), JSON.stringify(results, null, 2) + '\n');
  await browser?.close();
  await new Promise((r) => server.close(r));
});

const docMetrics = () => ({
  docHeight: document.documentElement.scrollHeight,
  bodyHeight: document.body.getBoundingClientRect().height,
  bodyWidth: document.body.getBoundingClientRect().width,
  scrollTop: document.getElementById('scroll').scrollTop,
});

async function open({ tabUrl, report }) {
  const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: 360, height: 560 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript({ content: shim({ settings: defaultSettings(), tabUrl, report }) });
  await page.addInitScript(() => {
    globalThis.__cls = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) globalThis.__cls += e.value; })
        .observe({ type: 'layout-shift', buffered: true });
    } catch { /* layout-shift not supported by this engine; layout boxes are compared instead */ }
  });
  await page.goto(`${base}/popup/popup.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('status')?.textContent !== 'Loading…');
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

for (const [name, tabUrl, report] of [
  ['normal page (all sections)', 'https://example.com/', { on: true, reason: 'mode-always' }],
  ['restricted page (fewer sections)', 'about:blank', null],
]) {
  test(`popup 360x560, ${name}: wheel scrolls on every step through the 300 ms re-render`, async () => {
    const { context, page } = await open({ tabUrl, report });
    const first = await page.evaluate(docMetrics);
    const css = await page.evaluate(() => {
      const s = getComputedStyle(document.getElementById('scroll'));
      return { overflowY: s.overflowY, overscroll: s.overscrollBehaviorY, smooth: s.scrollBehavior, gutter: s.scrollbarGutter };
    });
    assert.equal(css.overflowY, 'auto');
    assert.equal(css.overscroll, 'contain');
    assert.equal(css.smooth, 'auto');
    assert.equal(first.docHeight, 560, 'document height is fixed at 560');
    assert.equal(first.bodyWidth, 360, 'document width is fixed at 360');

    // Trigger a commit: it re-renders now and again after 300 ms.
    await page.check('input[name="mode"][value="always"]', { force: true });
    await page.mouse.move(180, 300);

    const samples = [];
    const range = await page.evaluate(() => { const s = document.getElementById('scroll'); return s.scrollHeight - s.clientHeight; });
    for (const dir of [1, -1]) {
      for (let i = 0; i < 20; i++) {
        const before = (await page.evaluate(docMetrics)).scrollTop;
        await page.mouse.wheel(0, dir * 40);
        await page.waitForTimeout(25);
        const m = await page.evaluate(docMetrics);
        samples.push({ dir, step: i, before, after: m.scrollTop, docHeight: m.docHeight, bodyHeight: m.bodyHeight });
      }
      if (dir === 1) {
        assert.ok(range > 0 || name.startsWith('restricted'), 'normal page overflows the 560 box');
      }
    }
    await page.waitForTimeout(400);
    const cls = await page.evaluate(() => globalThis.__cls);
    const last = await page.evaluate(docMetrics);
    results.push({ name, range, cls, first, last, samples });

    assert.ok(samples.every((s) => s.docHeight === 560 && s.bodyHeight === 560), 'document height constant during scroll');
    assert.equal(cls, 0, 'no layout shift after first render');
    if (range > 0) {
      const moved = samples.filter((s) => s.after !== s.before);
      const stuck = samples.filter((s) => s.after === s.before && !((s.dir === 1 && s.before >= range) || (s.dir === -1 && s.before <= 0)));
      assert.deepEqual(stuck, [], 'scrollTop changes on every step that is not at an end');
      assert.ok(moved.length >= 20, 'scroll moved down and back up');
    }
    await context.close();
  });
}

// iPad shows the popup as a popover that Safari sizes to the document, so the
// viewport starts short. The popup must keep its 560 box there instead of
// filling that short viewport (customer report 2026-11-12: collapsed to the
// header on an 11 inch iPad).
test('iPad popover keeps the 560 box when the viewport starts short', async () => {
  const context = await browser.newContext({
    colorScheme: 'dark', viewport: { width: 360, height: 60 }, screen: { width: 834, height: 1194 }, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript({ content: shim({ settings: defaultSettings(), tabUrl: 'https://example.com/', report: { on: true, reason: 'mode-always' } }) });
  await page.goto(`${base}/popup/popup.html`, { waitUntil: 'load' });
  const m = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, body: document.body.getBoundingClientRect().height }));
  results.push({ name: 'ipad-popover', ...m });
  assert.ok(m.coarse, 'emulated iPad has a coarse pointer');
  assert.equal(m.body, 560);
  await context.close();
});
