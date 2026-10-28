// WebKit e2e harness. Serves fixtures from a "site" origin and a separate
// "cdn" origin (another port, so its sheets are cross-origin and, without
// CORS headers, unreadable through the CSSOM), and runs the bundled content
// script with a stand-in for the WebExtension APIs. The stand-in's
// sendMessage goes to the real background handler (engine/src/sheet-fetch.js)
// running in Node. Only loopback addresses are contacted.
//
// Difference from Safari: Safari runs content scripts in an isolated world;
// here the script runs in the page's world. The DOM and CSSOM it sees, and
// the cross-origin restriction, are the same.

import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit, chromium } from 'playwright';
import { bundle } from '../engine/scripts/bundle.js';
import { createSheetMessageHandler } from '../engine/src/sheet-fetch.js';
import { defaultSettings } from '../engine/src/settings.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FIXTURES = resolve(ROOT, 'e2e/fixtures');
export const EVIDENCE = resolve(ROOT, 'ralph/evidence');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml',
};

// `?stall=<ms>` on an HTML page sends everything up to and including the
// <body> tag, then holds the rest for <ms>: the browser paints the page
// before any body content exists, which is when a white flash would show.
function serve(dir, vars) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    const file = resolve(dir, '.' + path);
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = readFileSync(file, 'utf8');
    for (const [k, v] of Object.entries(vars())) body = body.replaceAll(`{{${k}}}`, v);
    // `?delay=<ms>` holds the whole response back, like a slow sheet.
    const delay = Number(url.searchParams.get('delay')) || 0;
    if (delay > 0) {
      const timer = setTimeout(() => {
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(body);
      }, delay);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    const stall = Number(url.searchParams.get('stall')) || 0;
    const bodyTag = extname(file) === '.html' ? /<body[^>]*>/i.exec(body) : null;
    if (stall > 0 && bodyTag) {
      const cut = bodyTag.index + bodyTag[0].length;
      // Padding so the parser isn't left waiting for more bytes to sniff.
      res.write(body.slice(0, cut) + `<!--${' '.repeat(2048)}-->`);
      const timer = setTimeout(() => res.end(body.slice(cut)), stall);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    res.end(body);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

export async function startServers() {
  let urls = {};
  const site = await serve(FIXTURES, () => urls);
  const cdn = await serve(resolve(FIXTURES, 'cdn'), () => urls);
  urls = {
    SITE: `http://127.0.0.1:${site.address().port}`,
    CDN: `http://127.0.0.1:${cdn.address().port}`,
  };
  return { ...urls, close: () => Promise.all([site, cdn].map((s) => new Promise((r) => s.close(r)))) };
}

// The manifest has no match_about_blank, so Safari doesn't run the content
// script in about:blank / about:srcdoc frames. Playwright's init scripts run
// in every frame, so skip those here; the parent frame's engine has to cover
// them (dynamic.js adoptFrame).
// `siteFixes` replaces the bundled per-site fix list (site-fixes-data.js).
const contentBundle = (siteFixes) => {
  const substitute = siteFixes
    ? { [resolve(ROOT, 'engine/src/generated/site-fixes-data.js')]: `export function siteFixes() { return ${JSON.stringify(siteFixes)}; }\n` }
    : {};
  return `if (location.protocol !== 'about:') {\n${bundle(resolve(ROOT, 'engine/src/content.js'), { substitute })}\n}`;
};
export const auditBundle = () => bundle(resolve(ROOT, 'e2e/page-audit.js'), { globalName: '__sanAudit' });

// Stand-in for the manifest `css` entry: Safari injects content/base.css
// before first paint with no script. An init script that appends the same
// text to the root at document start is the closest WebKit-under-Playwright
// gets; it runs before the page's first rendering update. Safari's manifest
// css is a user stylesheet, not a DOM node, so the stand-in carries the
// engine's mark: audits treat it as ours, and the engine never rewrites it.
const baseCssText = () => readFileSync(resolve(ROOT, 'Extension/Resources/content/base.css'), 'utf8');
const baseCssShim = (css) => `(() => {
  if (location.protocol === 'about:') return;
  const put = () => {
    const root = document.documentElement;
    if (!root) return false;
    const s = document.createElement('style');
    s.id = 'san-manifest-base';
    s.setAttribute('data-sunglasses-at-night', 'manifest-base');
    s.textContent = ${JSON.stringify(css)};
    root.appendChild(s);
    return true;
  };
  if (!put()) new MutationObserver((_, o) => { if (put()) o.disconnect(); }).observe(document, { childList: true });
})();`;

// `delayMs` holds every settings read back, like a slow storage.local.get.
function apiShim(settings, delayMs = 0) {
  return `(() => {
  const data = { settings: ${JSON.stringify(settings)} };
  const listeners = new Set();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  globalThis.browser = {
    storage: {
      local: {
        get: async (k) => {
          if (${delayMs} > 0) await new Promise((r) => setTimeout(r, ${delayMs}));
          globalThis.__sanSettingsAt = Math.round(performance.now());
          return k in data ? { [k]: clone(data[k]) } : {};
        },
        set: async (o) => {
          const changes = {};
          for (const [k, v] of Object.entries(o)) { changes[k] = { oldValue: clone(data[k]), newValue: clone(v) }; data[k] = clone(v); }
          for (const l of listeners) l(changes, 'local');
        },
        remove: async () => {},
      },
      onChanged: { addListener: (f) => listeners.add(f), removeListener: (f) => listeners.delete(f) },
    },
    runtime: { id: 'e2e', sendMessage: (msg) => globalThis.__sanBackground(msg) },
  };
})();`;
}

// E2E_BROWSER=chromium is a stand-in where WebKit can't be installed (a
// cloud box without the Playwright CDN); results there are not WebKit results.
export async function launch() {
  return process.env.E2E_BROWSER === 'chromium' ? chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH }) : webkit.launch();
}

/**
 * Open `path` on the site origin. With `extension`, the content script runs
 * at document start with mode "always" (or `settings`); `ready` is the role
 * of the engine sheet to wait for ('override' for dynamic, 'filter'), or
 * null when the engine is expected to back off (already-dark pages).
 */
export async function openPage(browser, servers, path, { extension = false, settings, ready = 'override', siteFixes } = {}) {
  const { page, context, fetchLog } = await preparePage(browser, servers, { extension, settings, siteFixes });
  await page.goto(servers.SITE + path, { waitUntil: 'load' });
  if (extension && ready) {
    await page.waitForFunction((role) => document.querySelector(`style[data-sunglasses-at-night="${role}"]`), ready);
  } else if (extension) {
    await page.waitForFunction(() => !document.getElementById('sunglasses-at-night-early'));
  }
  // Let fixture scripts finish (they set __fixtureDone) and the 1 s poll run.
  await page.waitForFunction(() => globalThis.__fixtureDone !== false, null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  return { page, context, fetchLog };
}

// Records the canvas at the page's first rendering update: a rAF callback
// queued at document start runs in the first frame WebKit renders. WebKit
// renders no frames of a document whose body is still empty (it keeps the
// layer tree frozen until there is content to show), so with `?stall` that
// first frame is the one the user sees first, whenever it comes.
const FIRST_FRAME = `if (location.protocol !== 'about:') requestAnimationFrame(() => {
  globalThis.__sanFirstFrame = { ...__sanAudit.canvasColor(), atMs: Math.round(performance.now()) };
});`;

/**
 * Start loading `path` with the body held back by the server (`?stall`) and
 * return what the browser painted the canvas with in the first frame it
 * rendered (page-audit canvasColor(), plus bodyChildren at that moment).
 */
export async function openFirstPaint(browser, servers, path, { extension = false, settings, stallMs = 8000, colorScheme, settingsDelayMs } = {}) {
  const { page, context } = await preparePage(browser, servers, { extension, settings, colorScheme, settingsDelayMs });
  await page.addInitScript({ content: FIRST_FRAME });
  await page.goto(`${servers.SITE}${path}?stall=${stallMs}`, { waitUntil: 'commit' });
  const handle = await page.waitForFunction(() => globalThis.__sanFirstFrame, null, { polling: 50, timeout: stallMs + 10000 });
  const canvas = await handle.jsonValue();
  return { page, context, canvas };
}

// `fetchDelayMs` holds every background sheet re-fetch back, like Safari's
// worker wake-up plus message round trip.
// `siteFixes` replaces the bundled per-site fix list (see contentBundle).
async function preparePage(browser, servers, { extension, settings, colorScheme = 'light', settingsDelayMs = 0, fetchDelayMs = 0, siteFixes }) {
  const context = await browser.newContext({ colorScheme, viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript({ content: auditBundle() });
  const fetchLog = [];
  if (extension) {
    // Node's fetch has no HTTP cache, so the cache hint is dropped here only.
    const nodeFetch = (url, init) => {
      fetchLog.push(url);
      return fetch(url, { ...init, cache: undefined });
    };
    const handler = createSheetMessageHandler({ fetch: nodeFetch, extensionId: 'e2e' });
    await page.exposeFunction('__sanBackground', (msg) => new Promise((resolveMsg) => {
      const respond = fetchDelayMs > 0 ? (res) => setTimeout(() => resolveMsg(res), fetchDelayMs) : resolveMsg;
      if (handler(msg, { tab: { id: 1, url: page.url() }, id: 'e2e' }, respond) === false) resolveMsg(undefined);
    }));
    await page.addInitScript({ content: baseCssShim(baseCssText()) });
    await page.addInitScript({ content: apiShim(settings ?? { ...defaultSettings(), mode: 'always' }, settingsDelayMs) });
    await page.addInitScript({ content: contentBundle(siteFixes) });
  }
  return { page, context, fetchLog };
}

// Every rendered frame's canvas color from document start, recorded by a
// rAF loop (page-audit canvasColor()).
// With `sampler` 'light', each frame is the fraction of the viewport painted
// light instead (page-audit lightFraction()), plus whether the engine is ready.
const frameLog = (sampler) => `if (location.protocol !== 'about:') {
  globalThis.__sanFrames = [];
  const tick = () => {
    globalThis.__sanFrames.push({ t: Math.round(performance.now()), ${sampler === 'light'
      ? "...__sanAudit.lightFraction(), ready: document.documentElement.hasAttribute('data-sunglasses-ready')"
      : '...__sanAudit.canvasColor()'} });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}`;

/**
 * Load `path` (body held back `stallMs`) and log every frame until `watchMs`
 * after the load event. Returns { frames, settingsAt } where settingsAt is
 * the performance.now() at which the settings read resolved.
 */
export async function recordFrames(browser, servers, path, { extension = true, settings, colorScheme, settingsDelayMs, fetchDelayMs, watchMs = 1200, stallMs = 1500, sampler = 'canvas' } = {}) {
  const { page, context } = await preparePage(browser, servers, { extension, settings, colorScheme, settingsDelayMs, fetchDelayMs });
  await page.addInitScript({ content: frameLog(sampler) });
  await page.goto(`${servers.SITE}${path}${stallMs > 0 ? `?stall=${stallMs}` : ''}`, { waitUntil: 'load' });
  await page.waitForTimeout(watchMs);
  const out = await page.evaluate(() => ({ frames: globalThis.__sanFrames, settingsAt: globalThis.__sanSettingsAt ?? null }));
  return { ...out, page, context };
}

export function evidencePath(name) {
  mkdirSync(EVIDENCE, { recursive: true });
  return resolve(EVIDENCE, name);
}
