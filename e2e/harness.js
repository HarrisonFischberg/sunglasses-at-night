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
import { webkit } from 'playwright';
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
const contentBundle = () =>
  `if (location.protocol !== 'about:') {\n${bundle(resolve(ROOT, 'engine/src/content.js'))}\n}`;
export const auditBundle = () => bundle(resolve(ROOT, 'e2e/page-audit.js'), { globalName: '__sanAudit' });

function apiShim(settings) {
  return `(() => {
  const data = { settings: ${JSON.stringify(settings)} };
  const listeners = new Set();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  globalThis.browser = {
    storage: {
      local: {
        get: async (k) => (k in data ? { [k]: clone(data[k]) } : {}),
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

export async function launch() {
  return webkit.launch();
}

/**
 * Open `path` on the site origin. With `extension`, the content script runs
 * at document start with mode "always" (or `settings`); `ready` is the role
 * of the engine sheet to wait for ('override' for dynamic, 'filter'), or
 * null when the engine is expected to back off (already-dark pages).
 */
export async function openPage(browser, servers, path, { extension = false, settings, ready = 'override' } = {}) {
  const { page, context, fetchLog } = await preparePage(browser, servers, { extension, settings });
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

/**
 * Start loading `path` with the body held back by the server (`?stall`),
 * wait until the browser has rendered frames of the bodiless page, and
 * return what it painted the canvas with (page-audit canvasColor()).
 */
export async function openFirstPaint(browser, servers, path, { extension = false, settings, stallMs = 8000, paintMs = 800 } = {}) {
  const { page, context } = await preparePage(browser, servers, { extension, settings });
  await page.goto(`${servers.SITE}${path}?stall=${stallMs}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.body, null, { timeout: 5000 });
  await page.waitForTimeout(paintMs);
  const canvas = await page.evaluate(() => new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(__sanAudit.canvasColor())))));
  return { page, context, canvas };
}

async function preparePage(browser, servers, { extension, settings }) {
  const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1024, height: 900 } });
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
      if (handler(msg, { tab: { id: 1 }, id: 'e2e' }, resolveMsg) === false) resolveMsg(undefined);
    }));
    await page.addInitScript({ content: apiShim(settings ?? { ...defaultSettings(), mode: 'always' }) });
    await page.addInitScript({ content: contentBundle() });
  }
  return { page, context, fetchLog };
}

export function evidencePath(name) {
  mkdirSync(EVIDENCE, { recursive: true });
  return resolve(EVIDENCE, name);
}
