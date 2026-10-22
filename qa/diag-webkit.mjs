#!/usr/bin/env node
// SUPPLEMENTARY DIAGNOSIS ONLY (not Safari acceptance): load a live URL in
// Playwright WebKit with the bundled content script and a stand-in API (same
// shim as e2e/harness.js), then print computed styles of elements matching a
// selector. Used to find causes after the installed-extension runs show a defect.
//   node qa/diag-webkit.mjs <url> '<css selector>' [--off] [--mobile] [--shot out.png]
import { webkit, devices } from 'playwright';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '../engine/scripts/bundle.js';
import { createSheetMessageHandler } from '../engine/src/sheet-fetch.js';
import { defaultSettings } from '../engine/src/settings.js';
import { readFileSync } from 'node:fs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const [url, sel] = process.argv.slice(2);
const off = process.argv.includes('--off');
const shotI = process.argv.indexOf('--shot');
const browser = await webkit.launch();
const ctx = await browser.newContext(process.argv.includes('--mobile') ? { ...devices['iPhone 15'] } : { viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
if (!off) {
  const handler = createSheetMessageHandler({ fetch: (u, i) => fetch(u, { ...i, cache: undefined }), extensionId: 'e2e' });
  await page.exposeFunction('__sanBackground', (msg) => new Promise((r) => { if (handler(msg, { tab: { id: 1 }, id: 'e2e' }, r) === false) r(undefined); }));
  const css = readFileSync(resolve(ROOT, 'Extension/Resources/content/base-on.css'), 'utf8');
  await page.addInitScript({ content: `(() => { const put = () => { const r = document.documentElement; if (!r) return false; const s = document.createElement('style'); s.setAttribute('data-sunglasses-at-night','manifest-base'); s.textContent = ${JSON.stringify(css)}; r.appendChild(s); return true; }; if (!put()) new MutationObserver((_, o) => { if (put()) o.disconnect(); }).observe(document, { childList: true }); })();` });
  await page.addInitScript({ content: `(() => { const data = { settings: ${JSON.stringify({ ...defaultSettings(), mode: 'always' })} }; globalThis.browser = { storage: { local: { get: async (k) => (k in data ? { [k]: data[k] } : {}), set: async () => {}, remove: async () => {} }, onChanged: { addListener() {}, removeListener() {} } }, runtime: { id: 'e2e', sendMessage: (m) => globalThis.__sanBackground(m) } }; })();` });
  await page.addInitScript({ content: `if (location.protocol !== 'about:') {\n${bundle(resolve(ROOT, 'engine/src/content.js'))}\n}` });
}
await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch((e) => console.log('goto:', e.message));
await page.waitForTimeout(4000);
const out = await page.evaluate((sel) => [...document.querySelectorAll(sel)].slice(0, 12).map((el) => {
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  const chain = []; for (let e = el; e && e.nodeType === 1 && chain.length < 8; e = e.parentElement) { const c = getComputedStyle(e); chain.push(`${e.localName}.${[...e.classList].slice(0, 2).join('.')} op=${c.opacity} vis=${c.visibility} disp=${c.display} bg=${c.backgroundColor} fill=${c.fill} color=${c.color} filt=${c.filter} blend=${c.mixBlendMode}`); }
  return { tag: el.localName, src: (el.currentSrc || el.src || '').slice(0, 90), rect: [r.x, r.y, r.width, r.height].map(Math.round), complete: el.complete, natural: [el.naturalWidth, el.naturalHeight], attrs: [...el.attributes].map((a) => `${a.name}=${a.value.slice(0, 40)}`).join(' '), chain };
}), sel);
console.log(JSON.stringify(out, null, 1));
if (shotI > 0) await page.screenshot({ path: process.argv[shotI + 1] });
await browser.close();
