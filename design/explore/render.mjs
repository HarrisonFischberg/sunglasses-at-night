// Design exploration previews: the REAL popup and settings page from
// Extension/Resources (real HTML, ui.css and JS, stand-in WebExtension API from
// e2e/ui-shim.js) in Playwright WebKit, as shipped ("baseline") and with one of
// three extra stylesheets (A.css, B.css, C.css) added after ui.css.
// Same approach as store/ios/shots/render.mjs. Nothing here ships.
//
// Run: node design/explore/render.mjs [outDir] [baseline A B C]
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';
import { shim } from '../../e2e/ui-shim.js';
import { defaultSettings } from '../../engine/src/settings.js';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const ROOT = resolve(HERE, '../..');
const DIRS = { res: resolve(ROOT, 'Extension/Resources'), dark: resolve(ROOT, 'store/ios/shots'), design: HERE };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const [OUT = resolve(HERE, 'out'), ...only] = process.argv.slice(2);
const VARIANTS = only.length ? only : ['baseline', 'A', 'B', 'C'];
const HOST = 'owl-and-lamp.example';
const LOOK = { brightness: 92, contrast: 104, sepia: 18, grayscale: 0 };
const settings = {
  ...defaultSettings(),
  mode: 'schedule',
  schedule: { start: '21:00', end: '07:00' },
  sites: { [HOST]: { rule: 'always', look: LOOK }, 'fernwood.example': { rule: 'always' }, 'night-shift-notes.example': { rule: 'never' } },
};

const darkInit = `if (location.pathname.startsWith('/dark/')) {
  const data = { settings: ${JSON.stringify({ ...defaultSettings(), mode: 'always', look: LOOK })} };
  globalThis.browser = {
    storage: { local: { get: async (k) => (k in data ? { [k]: data[k] } : {}), set: async () => {}, remove: async () => {} }, onChanged: { addListener() {}, removeListener() {} } },
    runtime: { id: 'shots', sendMessage: async () => undefined },
  };
  const css = document.createElement('style');
  css.textContent = ${JSON.stringify(readFileSync(resolve(DIRS.res, 'content/base.css'), 'utf8'))};
  const put = () => document.documentElement?.appendChild(css);
  if (!put()) new MutationObserver((_, o) => { if (put()) o.disconnect(); }).observe(document, { childList: true });
  ${readFileSync(resolve(DIRS.res, 'content/engine.js'), 'utf8')}
}`;
const uiInit = `if (location.pathname.startsWith('/res/')) {
  ${shim({ settings, tabUrl: `https://${HOST}/`, report: { on: true, reason: 'mode-schedule' } })}
}`;

const glasses = '<img src="/res/images/toolbar-light-48.png" alt="">';
const stage = (cls, v) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/design/stage.css"></head><body class="${cls}">
${cls === 'phone'
    ? '<div class="bar status"><span>9:41</span><span class="batt"></span></div>'
    : `<div class="bar tool"><span class="lights"><b></b><b></b><b></b></span><span class="url">${HOST}</span><span class="ext">${glasses}</span></div>`}
<iframe class="page" src="/dark/article.html"></iframe>${cls === 'phone' ? '<div class="scrim"></div>' : ''}
<div class="pop"><iframe src="/res/popup/popup.html?design=${v}" width="360" height="560"></iframe></div></body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const [, top, ...rest] = decodeURIComponent(url.pathname).split('/');
  if (top === 'stage') return res.writeHead(200, { 'content-type': TYPES['.html'] }).end(stage(rest[0], rest[1]));
  const dir = DIRS[top];
  const file = dir && resolve(dir, rest.join('/'));
  if (!file || !file.startsWith(dir) || !existsSync(file)) return res.writeHead(404).end();
  let body = readFileSync(file);
  // The switch: ?design=A adds design/explore/A.css after the shipped ui.css.
  const v = url.searchParams.get('design');
  if (top === 'res' && ['A', 'B', 'C'].includes(v)) body = String(body).replace('</head>', `<link rel="stylesheet" href="/design/${v}.css"></head>`);
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await webkit.launch();
mkdirSync(OUT, { recursive: true });

// name suffix, viewport, touch, url
const SHOTS = [
  { n: '1', w: 402, h: 874, dpr: 3, touch: true, path: (v) => `/stage/phone/${v}` },
  { n: '2', w: 1280, h: 900, dpr: 2, touch: false, full: true, path: (v) => `/res/options/options.html?design=${v}` },
  { n: '3', w: 1000, h: 680, dpr: 2, touch: false, path: (v) => `/stage/mac/${v}` },
  { n: '4', w: 1000, h: 680, dpr: 2, touch: false, scrollTo: 'site', path: (v) => `/stage/mac/${v}` },
];

for (const v of VARIANTS) {
  for (const s of SHOTS) {
    const context = await browser.newContext({ colorScheme: 'dark', locale: 'en-US', viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, hasTouch: s.touch });
    await context.addInitScript({ content: uiInit });
    await context.addInitScript({ content: darkInit });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + s.path(v), { waitUntil: 'load' });
    for (const frame of page.frames()) {
      const path = new URL(frame.url()).pathname;
      if (path.startsWith('/dark/')) await frame.waitForFunction(() => document.documentElement.hasAttribute('data-sunglasses-ready'));
      if (path.startsWith('/res/popup/')) {
        await frame.waitForFunction(() => document.getElementById('status').textContent !== 'Loading…');
        if (s.scrollTo) await frame.evaluate((id) => {
          // C dissolves #site into the popup grid (no box of its own): show Look there.
          const want = document.getElementById(id), box = document.getElementById('scroll');
          const el = want.getClientRects().length ? want : document.getElementById('look');
          box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
        }, s.scrollTo);
        // Self-check: nothing in the popup may be wider than the popup.
        assert.equal(await frame.evaluate(() => document.getElementById('scroll').scrollWidth <= document.getElementById('scroll').clientWidth + 1), true, `${v}-${s.n}: popup overflows sideways`);
      }
      if (path.startsWith('/res/options/')) {
        await frame.waitForFunction(() => document.querySelectorAll('#sites li').length === 3);
        assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${v}-${s.n}: settings page overflows sideways`);
      }
    }
    await page.waitForTimeout(1500); // the engine's 1 s poll
    const file = resolve(OUT, `${v}-${s.n}.png`);
    await page.screenshot({ path: file, fullPage: !!s.full });
    await context.close();
    assert.deepEqual(errors, [], `${v}-${s.n}: page errors`);
    console.log(file);
  }
}
await browser.close();
await new Promise((r) => server.close(r));
