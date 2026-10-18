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

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript' };

function serve(dir, vars) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = resolve(dir, '.' + path);
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = readFileSync(file, 'utf8');
    for (const [k, v] of Object.entries(vars())) body = body.replaceAll(`{{${k}}}`, v);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
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

const contentBundle = () => bundle(resolve(ROOT, 'engine/src/content.js'));
const auditBundle = () => bundle(resolve(ROOT, 'e2e/page-audit.js'), { globalName: '__sanAudit' });

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
 * of the engine sheet to wait for ('override' for dynamic, 'filter').
 */
export async function openPage(browser, servers, path, { extension = false, settings, ready = 'override' } = {}) {
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
  await page.goto(servers.SITE + path, { waitUntil: 'load' });
  if (extension) {
    await page.waitForFunction((role) => document.querySelector(`style[data-sunglasses-at-night="${role}"]`), ready);
  }
  // Let fixture scripts finish (they set __fixtureDone) and the 1 s poll run.
  await page.waitForFunction(() => globalThis.__fixtureDone !== false, null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  return { page, context, fetchLog };
}

export function evidencePath(name) {
  mkdirSync(EVIDENCE, { recursive: true });
  return resolve(EVIDENCE, name);
}
