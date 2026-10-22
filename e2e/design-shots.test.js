// T026 e2e: renders the three Phase 3B concept previews (design/concepts/{a,b,c})
// in WebKit at 1440×900 and 390×844, writes the screenshots to
// design/screenshots/, and measures what a screenshot cannot show: horizontal
// overflow, touch-target size and text contrast. Only a loopback server this
// file starts is contacted. Results: ralph/evidence/t026-e2e.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, evidencePath } from './harness.js';

const ROOT = fileURLToPath(new URL('../design/', import.meta.url));
const SHOTS = resolve(ROOT, 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript' };
const SIZES = [{ name: '1440x900', width: 1440, height: 900 }, { name: '390x844', width: 390, height: 844 }];
const CONCEPTS = ['a', 'b', 'c'];
// Extra pinned states (mobile only): shades off, and a page Safari will not let us touch.
const STATES = [{ tag: '', query: '' }, { tag: '-off', query: '?mode=off' }, { tag: '-restricted', query: '?restricted=1' }];

let server, base, browser;
const results = [];

before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(ROOT, '.' + path);
    if (!file.startsWith(ROOT) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launch();
});

after(async () => {
  writeFileSync(evidencePath('t026-e2e.json'), JSON.stringify(results, null, 2) + '\n');
  await browser?.close();
  await new Promise((r) => server.close(r));
});

// Runs in the page. Returns overflow, small targets and low-contrast text.
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
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };

  const lowContrast = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const r = ratio(fg, bgOf(el));
    if (r < (large ? 3 : 4.5)) lowContrast.push({ text: t.textContent.trim().slice(0, 40), ratio: +r.toFixed(2) });
  }

  const small = [];
  for (const el of document.querySelectorAll('button, summary, select, input[type="time"], input[type="range"], label:has(input[type="radio"]), label:has(input[type="checkbox"]), a')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5) small.push({ el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''), text: (el.textContent || '').trim().slice(0, 30), h: +r.height.toFixed(1) });
  }

  return {
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    lowContrast,
    small,
  };
}

for (const concept of CONCEPTS) {
  for (const size of SIZES) {
    for (const st of STATES) {
      if (st.tag && size.name !== '390x844') continue;
      test(`concept ${concept} @ ${size.name}${st.tag}`, async () => {
        const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(`${base}/concepts/${concept}/${st.query}`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('headline')?.textContent);
        const m = await page.evaluate(measure);
        const file = `${concept}-${size.name}${st.tag}.png`;
        await page.screenshot({ path: resolve(SHOTS, file), fullPage: size.width < 800 });
        await context.close();
        results.push({ concept, size: size.name, state: st.tag || 'default', screenshot: `design/screenshots/${file}`, ...m, errors });
        assert.deepEqual(errors, [], 'page errors');
        assert.equal(m.overflowX, 0, 'no horizontal scroll');
        assert.deepEqual(m.small, [], 'every control is at least 44px tall');
        assert.deepEqual(m.lowContrast, [], 'text contrast >= 4.5:1 (3:1 large)');
      });
    }
  }
}
