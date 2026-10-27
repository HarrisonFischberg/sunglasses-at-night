// T030 e2e: the real popup and options pages (Extension/Resources) restyled to
// the Dusk design system, rendered in WebKit at 390×844 and 1440×900 with a
// stand-in WebExtension API. Writes design/screenshots/real-*.png and measures
// what a screenshot cannot show: horizontal overflow, touch-target height and
// text contrast. Only a loopback server this file starts is contacted.
// Results: ralph/evidence/t030-e2e.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, evidencePath } from './harness.js';
import { shim } from './ui-shim.js';
import { defaultSettings } from '../engine/src/settings.js';

const RES = fileURLToPath(new URL('../Extension/Resources/', import.meta.url));
const SHOTS = fileURLToPath(new URL('../design/screenshots/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript' };
const SIZES = [{ name: '390x844', width: 390, height: 844 }, { name: '1440x900', width: 1440, height: 900 }];

let server, base, browser;
const results = [];

before(async () => {
  mkdirSync(SHOTS, { recursive: true });
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
  writeFileSync(evidencePath('t030-e2e.json'), JSON.stringify(results, null, 2) + '\n');
  await browser?.close();
  await new Promise((r) => server.close(r));
});

// Runs in the page: overflow, controls under 44 px, text under 4.5:1 (3:1 large).
function measure() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.99) return c;
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };

  const lowContrast = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!visible(el) || el.closest('[aria-hidden="true"]') || el.closest('[hidden]')) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const r = ratio(fg, bgOf(el));
    if (r < (large ? 3 : 4.5)) lowContrast.push({ text: t.textContent.trim().slice(0, 40), ratio: +r.toFixed(2) });
  }

  const small = [];
  const sel = 'button, select, input[type="time"], input[type="range"], label:has(input[type="radio"]), label:has(input[type="checkbox"]), a';
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5) small.push({ el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''), text: (el.textContent || '').trim().slice(0, 30), h: +r.height.toFixed(1) });
  }

  return {
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    lowContrast,
    small,
  };
}

async function capture({ page, size, tag, settings = defaultSettings(), tabUrl = 'https://example.com/', report }) {
  const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.addInitScript({ content: shim({ settings, tabUrl, report }) });
  await p.goto(`${base}/${page}/${page}.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.getElementById('status')?.textContent !== 'Loading…' || !document.getElementById('status'));
  await p.evaluate(() => document.fonts.ready);
  // The checked tile's background fades in (180 ms) while its text color
  // switches at once: measure the settled colors, not mid-transition.
  await p.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  const m = await p.evaluate(measure);
  const file = `real-${page}-${size.name}${tag}.png`;
  await p.screenshot({ path: resolve(SHOTS, file), fullPage: true });
  await context.close();
  results.push({ page, size: size.name, state: tag || 'default', screenshot: `design/screenshots/${file}`, ...m, errors });
  assert.deepEqual(errors, [], 'page errors');
  assert.equal(m.overflowX, 0, 'no horizontal scroll');
  assert.deepEqual(m.small, [], 'every control is at least 44px tall');
  assert.deepEqual(m.lowContrast, [], 'text contrast >= 4.5:1 (3:1 large)');
}

for (const size of SIZES) {
  test(`popup @ ${size.name}: on, normal page`, () => capture({ page: 'popup', size, report: { on: true, reason: 'mode-always' } }));
  test(`popup @ ${size.name}: off`, () => capture({ page: 'popup', size, tag: '-off', settings: { ...defaultSettings(), mode: 'off' }, report: { on: false, reason: 'mode-off' } }));
  test(`popup @ ${size.name}: already-dark note`, () => capture({ page: 'popup', size, tag: '-already-dark', report: { on: false, reason: 'already-dark' } }));
  test(`popup @ ${size.name}: restricted page`, () => capture({ page: 'popup', size, tag: '-restricted', tabUrl: 'about:blank', report: null }));
  test(`options @ ${size.name}`, () => capture({
    page: 'options', size,
    settings: { ...defaultSettings(), mode: 'schedule', sites: { 'a.test': { rule: 'never' }, 'b.test': { rule: 'always', look: { brightness: 90, contrast: 100, sepia: 0, grayscale: 0 } } } },
  }));
  test(`options @ ${size.name}: no site rules`, () => capture({ page: 'options', size, tag: '-empty' }));
}
