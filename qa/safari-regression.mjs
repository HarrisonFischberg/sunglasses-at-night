#!/usr/bin/env node
// The regression fixture pages (e2e/fixtures/regression/) in real macOS
// Safari with the INSTALLED extension: the counterpart of the WebKit harness
// run (e2e/regression-*.test.js), which injects the same production code
// into Playwright WebKit instead. Nothing here injects the extension.
//
//   node qa/safari-regression.mjs [--out dir]
//
// Same one-time setup as qa/run-mac.mjs (qa/README.md): the build installed
// and re-ticked in Safari, "Allow JavaScript from Apple Events", Screen
// Recording and Accessibility for the calling app, Safari's HTTPS-Only mode
// off for http://localhost. First proves the extension is enabled and
// affecting a fixture page (its ready mark on <html>, a dark canvas); stops if
// not. Then, per page: window screenshot, text contrast (e2e/page-audit.js,
// read-only), and for the forms/layers pages typed text and opened layers.
// The picker needs the toolbar popup: manual, see e2e/REGRESSION.md.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServers, auditBundle } from '../e2e/harness.js';
import { decodePng } from '../e2e/png.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'e2e/regression-out/safari-macos');
const MAC = join(ROOT, 'build/qa-mac');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const osa = (s) => execFileSync('osascript', ['-e', s], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 25000 }).trim();
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
let WIN = null;
const js = (code) => osa(`tell application "Safari" to do JavaScript "${esc(code)}" in current tab of (first window whose id is ${WIN.asId})`);
const setUrl = (url) => osa(`tell application "Safari" to set URL of current tab of (first window whose id is ${WIN.asId}) to "${esc(url)}"`);
const AUDIT = auditBundle();
// page-audit.js, loaded into the page once per navigation (read-only checks).
const inPage = (expr) => JSON.parse(js(`(() => { if (!globalThis.__sanAudit) { ${AUDIT} } return JSON.stringify(${expr}); })()`));
const markers = () => inPage("({ ready: document.documentElement.hasAttribute('data-sunglasses-ready'), ours: document.querySelectorAll('style[data-sunglasses-at-night]').length, canvas: __sanAudit.canvasColor().luminance, rs: document.readyState })");

async function waitReady(ms = 10000) {
  const t0 = Date.now();
  let m = null;
  while (Date.now() - t0 < ms) {
    try { m = markers(); if (m.rs === 'complete' && m.ready) break; } catch { /* navigating */ }
    await sleep(300);
  }
  await sleep(600);
  return m;
}

function shot(name) {
  const file = join(OUT, `${name}.png`);
  execFileSync(MAC, ['shot', String(WIN.cgId), file], { encoding: 'utf8', timeout: 30000 });
  return file;
}

// Window pixel under a page point (CSS px): the page sits at the bottom of
// the captured window, below Safari's toolbar.
function pixelAt(file, x, y) {
  const img = decodePng(readFileSync(file));
  const { dpr, ih } = inPage('({ dpr: devicePixelRatio, ih: innerHeight })');
  const top = img.height - ih * dpr;
  return img.at(x * dpr, top + y * dpr);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  execFileSync('swiftc', ['-O', join(ROOT, 'qa/tools/qa-mac.swift'), '-o', MAC], { stdio: 'inherit' });
  const servers = await startServers();
  const base = servers.SITE.replace('127.0.0.1', 'localhost');
  const report = { safari: execFileSync('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString'], { encoding: 'utf8' }).trim(), pages: {} };
  try {
    const before = new Set(JSON.parse(execFileSync(MAC, ['windows'], { encoding: 'utf8' })).map((w) => w.id));
    osa(`tell application "Safari" to make new document with properties {URL:"${base}/regression/forms.html"}`);
    await sleep(2500);
    const asId = osa('tell application "Safari" to get id of front window');
    osa(`tell application "Safari" to set bounds of (first window whose id is ${asId}) to {60, 60, 1084, 960}`);
    await sleep(800);
    const w = JSON.parse(execFileSync(MAC, ['windows'], { encoding: 'utf8' })).find((x) => !before.has(x.id));
    WIN = { asId, cgId: w?.id };
    // Proof: enabled and affecting this page, before any result is trusted.
    const proof = await waitReady();
    report.proof = proof;
    if (!proof?.ready || proof.canvas > 0.05) {
      report.error = 'The extension is not active on the fixture page (no ready mark or a light canvas): enable it in Safari ▸ Settings ▸ Extensions (untick and re-tick after a rebuild) and check dark mode is on.';
      return;
    }
    for (const page of ['forms', 'inputs', 'layers', 'css-cases', 'embedded', 'media', 'own-dark']) {
      setUrl(`${base}/regression/${page}.html`);
      const m = await waitReady();
      const r = { markers: m, shot: shot(`${page}-on`), audit: inPage('__sanAudit.audit({ maxTextBgLuminance: 1 })') };
      if (page === 'inputs' || page === 'forms') {
        r.typed = [];
        const ids = inPage("[...document.querySelectorAll('input:not([disabled]):not([type=password]),textarea')].map((e) => e.id).filter(Boolean)");
        for (const id of ids) {
          js(`document.getElementById(${JSON.stringify(id)}).focus()`);
          osa('tell application "Safari" to activate');
          osa('tell application "System Events" to keystroke "Typed text"');
          await sleep(200);
          r.typed.push({ id, ...inPage(`__sanAudit.textContrast(document.getElementById(${JSON.stringify(id)}))[0] ?? null`) });
        }
        r.shotTyped = shot(`${page}-typed`);
      }
      if (page === 'layers') {
        r.layers = {};
        for (const [open, surface] of [['open-menu', 'menu'], ['open-dialog', 'dlg'], ['open-popover', 'pop'], ['open-modal', 'modal-panel']]) {
          js(`document.getElementById('${open}').click()`);
          await sleep(400);
          const b = inPage(`(() => { const r = document.getElementById('${surface}').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
          const file = shot(`layers-${surface}`);
          const inside = pixelAt(file, b[0] + b[2] - 4, b[1] + b[3] / 2);
          const outside = pixelAt(file, Math.min(b[0] + b[2] + 48, 1000), b[1] + b[3] / 2);
          r.layers[surface] = { inside, outside };
          js("document.querySelector('dialog[open]')?.close(); document.querySelector(':popover-open')?.hidePopover(); document.getElementById('overlay').classList.remove('open'); document.getElementById('menu').classList.remove('open')");
          await sleep(200);
        }
      }
      report.pages[page] = r;
    }
  } finally {
    writeFileSync(join(OUT, 'safari-regression.json'), JSON.stringify(report, null, 2));
    await servers.close();
    console.log(report.error ?? `done: ${Object.keys(report.pages).length} pages, results in ${OUT}`);
  }
}

main();
