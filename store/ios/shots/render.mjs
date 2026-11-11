// Renders the App Store screenshots into store/ios/screenshots*/en-US.
// Run: node store/ios/shots/render.mjs   (needs `npm install`, Playwright WebKit)
//
// Each shot is one page in WebKit: a caption, a drawn device frame, and inside
// it the shipped extension at work: the demo pages (article.html, shop.html)
// darkened by Extension/Resources/content/engine.js, and the real popup and
// options pages with a stand-in WebExtension API (e2e/ui-shim.js). Only a
// loopback server this file starts is contacted. The Safari chrome around the
// pages is drawn here, it is not a capture of Safari.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';
import { decodePng } from '../../../e2e/png.js';
import { shim } from '../../../e2e/ui-shim.js';
import { defaultSettings } from '../../../engine/src/settings.js';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const ROOT = resolve(HERE, '../../..');
const RES = resolve(ROOT, 'Extension/Resources');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Captions: `*…*` marks the words shown in the accent color.
const SHOTS = [
  { name: '01-split', kind: 'split', page: 'article', title: 'Dark mode *for Safari*', sub: 'Bright pages turn dark, so they are easier to read at night.' },
  { name: '02-schedule', kind: 'popup', page: 'article', title: 'Choose *when* it turns on', sub: 'It can follow your device, stay on all the time, or run between hours you set.' },
  { name: '03-site', kind: 'popup', page: 'article', scrollTo: 'look', title: 'Set *each site* separately', sub: 'Keep a site always dark or never dark, or give it its own brightness and contrast.' },
  { name: '04-shop', kind: 'page', page: 'shop', title: 'Pictures *keep their colors*', sub: 'Shopping pages and long feeds go dark. The pictures are left as they are.' },
  { name: '05-privacy', kind: 'settings', page: 'article', scrollTo: 'more-settings', title: 'Settings stay *on your device*', sub: 'You do not need an account. The app has no analytics and does not track you.' },
];
const HOSTS = { article: 'owl-and-lamp.example', shop: 'fernwood.example' };

// w/h: base canvas in CSS px, times dpr = the size App Store Connect wants.
const DEVICES = [
  { id: 'iphone69', cls: 'phone', dir: 'screenshots', w: 440, h: 956, dpr: 3 },
  { id: 'iphone63', cls: 'phone', dir: 'screenshots', w: 402, h: 874, dpr: 3, scale: 402 / 440 },
  { id: 'ipad13', cls: 'pad', dir: 'screenshots', w: 1032, h: 1376, dpr: 2 },
  { id: 'mac', cls: 'mac', dir: 'screenshots-mac', w: 1440, h: 900, dpr: 2 },
];

const LOOK = { brightness: 92, contrast: 104, sepia: 18, grayscale: 0 };
const uiSettings = {
  ...defaultSettings(),
  mode: 'schedule',
  schedule: { start: '21:00', end: '07:00' },
  sites: {
    'owl-and-lamp.example': { rule: 'default', look: LOOK },
    'fernwood.example': { rule: 'always' },
    'night-shift-notes.example': { rule: 'never' },
  },
};

// Runs in /dark/ frames only: the API the content script needs, then the
// manifest's base.css and engine.js, as Safari injects them at document start.
const darkInit = (look) => `if (location.pathname.startsWith('/dark/')) {
  const data = { settings: ${JSON.stringify({ ...defaultSettings(), mode: 'always', look })} };
  globalThis.browser = {
    storage: {
      local: { get: async (k) => (k in data ? { [k]: data[k] } : {}), set: async () => {}, remove: async () => {} },
      onChanged: { addListener() {}, removeListener() {} },
    },
    runtime: { id: 'shots', sendMessage: async () => undefined },
  };
  const css = document.createElement('style');
  css.textContent = ${JSON.stringify(readFileSync(resolve(RES, 'content/base.css'), 'utf8'))};
  const put = () => document.documentElement?.appendChild(css);
  if (!put()) new MutationObserver((_, o) => { if (put()) o.disconnect(); }).observe(document, { childList: true });
  ${readFileSync(resolve(RES, 'content/engine.js'), 'utf8')}
}`;
const uiInit = (host) => `if (location.pathname.startsWith('/res/')) {
  ${shim({ settings: uiSettings, tabUrl: `https://${host}/`, report: { on: true, reason: 'mode-schedule' } })}
}`;

const glasses = '<img src="/res/images/toolbar-light-48.png" alt="">';
const arrows = '<span class="nav"><svg viewBox="0 0 12 20"><path d="M10 2 2 10l8 8"/></svg><svg viewBox="0 0 12 20"><path d="m2 2 8 8-8 8"/></svg></span>';

function stage(shot, dev) {
  const phone = dev.cls === 'phone';
  // On iPhone the settings live in the popup; iPad and Mac show the options page.
  const options = shot.kind === 'settings' && !phone;
  const popup = shot.kind === 'popup' || (shot.kind === 'settings' && phone);
  const url = options ? 'Sunglasses at Night settings' : HOSTS[shot.page];
  const title = shot.title.replace(/\*(.+?)\*/, '<em>$1</em>');
  const view = options
    ? '<iframe src="/res/options/options.html"></iframe>'
    : (shot.kind === 'split' ? `<iframe src="/light/${shot.page}.html"></iframe>` : '') +
      `<iframe class="dark${shot.kind === 'split' ? ' half' : ''}" src="/dark/${shot.page}.html"></iframe>` +
      (shot.kind === 'split' ? '<div class="split"></div><div class="knob"><img src="/res/images/icon-256.png" alt=""></div>' : '') +
      (popup ? '<div class="scrim"></div><div class="pop"><iframe src="/res/popup/popup.html"></iframe></div>' : '');
  const ext = `<span class="ext${popup ? ' open' : ''}">${glasses}</span>`;
  const top = {
    phone: '<div class="bar status"><span>9:41</span><span class="batt"></span></div>',
    pad: `<div class="bar status"><span>9:41</span><span>100%</span></div><div class="bar tool">${arrows}<span class="url">${url}</span>${ext}</div>`,
    mac: `<div class="bar tool"><span class="lights"><b></b><b></b><b></b></span>${arrows}<span class="url">${url}</span>${ext}</div>`,
  }[dev.cls];
  const foot = phone ? `<div class="bar foot"><span class="url">${glasses}${url}</span><i></i></div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/stage.css"></head>
<body class="${dev.cls}"><div class="stage" style="transform:scale(${dev.scale ?? 1})">
<header class="cap"><h1>${title}</h1><p>${shot.sub}</p></header>
<div class="device">${top}<div class="view">${view}</div>${foot}</div>
</div></body></html>`;
}

// App Store Connect rejects PNGs with an alpha channel and WebKit writes RGBA,
// so rewrite the file as 8-bit RGB (each row stored as differences from the
// pixel to the left, PNG filter 1, which keeps the gradients small).
function dropAlpha(file) {
  const img = decodePng(readFileSync(file));
  const stride = img.width * 3 + 1;
  const raw = Buffer.alloc(stride * img.height);
  for (let y = 0; y < img.height; y++) {
    let left = [0, 0, 0];
    raw[y * stride] = 1;
    for (let x = 0; x < img.width; x++) {
      const px = img.at(x, y);
      for (let c = 0; c < 3; c++) raw[y * stride + 1 + x * 3 + c] = (px[c] - left[c]) & 0xff;
      left = px;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0); ihdr.writeUInt32BE(img.height, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// Self-check on what was written: exact size, 8-bit RGB, and it decodes.
function checkPng(file, w, h) {
  const b = readFileSync(file);
  assert.equal(b[25], 2, `${file} must have no alpha channel`);
  const img = decodePng(b);
  assert.deepEqual([img.width, img.height], [w, h], `${file} size`);
}

let html = '';
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/stage') return res.writeHead(200, { 'content-type': TYPES['.html'] }).end(html);
  const [, top, ...rest] = path.split('/');
  const dir = top === 'res' ? RES : HERE;
  const file = resolve(dir, top === 'stage.css' ? top : rest.join('/'));
  if (!file.startsWith(dir) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await webkit.launch();

for (const dev of DEVICES) {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      colorScheme: 'dark', locale: 'en-US', viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, hasTouch: dev.cls !== 'mac',
    });
    await context.addInitScript({ content: uiInit(HOSTS[shot.page]) });
    await context.addInitScript({ content: darkInit(shot.scrollTo === 'look' ? LOOK : defaultSettings().look) });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    html = stage(shot, dev);
    await page.goto(`${base}/stage`, { waitUntil: 'load' });
    for (const frame of page.frames()) {
      const path = new URL(frame.url()).pathname;
      if (path.startsWith('/dark/')) await frame.waitForFunction(() => document.documentElement.hasAttribute('data-sunglasses-ready'));
      if (path.startsWith('/res/popup/')) {
        await frame.waitForFunction(() => document.getElementById('status').textContent !== 'Loading…');
        if (shot.scrollTo) await frame.evaluate((id) => { 
          // Not scrollIntoView: it would scroll the stage page around the frame too.
          const el = document.getElementById(id), box = document.getElementById('scroll');
          el.open = true;
          box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top;
         }, shot.scrollTo);
      }
    }
    await page.waitForTimeout(1500); // the engine's 1 s poll, and fonts
    const out = resolve(ROOT, 'store/ios', dev.dir, 'en-US');
    mkdirSync(out, { recursive: true });
    const file = resolve(out, `${dev.id}-${shot.name}.png`);
    await page.screenshot({ path: file, omitBackground: false });
    await context.close();
    assert.deepEqual(errors, [], `${dev.id} ${shot.name}: page errors`);
    dropAlpha(file);
    checkPng(file, dev.w * dev.dpr, dev.h * dev.dpr);
    console.log(`${dev.id}-${shot.name}.png ${dev.w * dev.dpr}x${dev.h * dev.dpr}`);
  }
}

await browser.close();
await new Promise((r) => server.close(r));
