import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseCss, BASE_CSS_PATH } from '../scripts/base-css.js';
import { startEarly, OFF_ATTRIBUTE } from '../src/early.js';
import { defaultSettings } from '../src/settings.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('content/base.css is up to date', () => {
  assert.equal(readFileSync(BASE_CSS_PATH, 'utf8'), baseCss(), 'stale: run node engine/scripts/base-css.js');
});

test('base.css paints only under a dark system and without the off attribute, using no network or layout properties', () => {
  const css = baseCss();
  assert.match(css, /^@media \(prefers-color-scheme: dark\)\{/m);
  assert.ok(css.includes(`:root:not([${OFF_ATTRIBUTE}]){`), 'root not gated');
  assert.ok(css.includes(`:root:not([${OFF_ATTRIBUTE}]) body{`), 'body not gated from the root attribute');
  assert.ok(!/url\(|@import/.test(css));
  assert.ok(!/\b(display|position|width|height|margin|padding|pointer-events)\s*:/.test(css));
});

test('manifest declares base.css on the content script that runs at document_start', () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'Extension/Resources/manifest.json'), 'utf8'));
  const cs = manifest.content_scripts[0];
  assert.deepEqual(cs.css, ['content/base.css']);
  assert.equal(cs.run_at, 'document_start');
});

function fakeDocument() {
  const attrs = {};
  const root = { setAttribute: (k, v) => { attrs[k] = v; } };
  return {
    attrs,
    documentElement: root,
    head: { appendChild() {} },
    createElement: () => ({ remove() {}, style: {} }),
    querySelector: () => null,
  };
}

test('startEarly sets the off attribute whether the sheet is painted or the page is off', () => {
  for (const mode of ['always', 'off']) {
    const document = fakeDocument();
    startEarly({
      document, getComputedStyle: () => ({}), settings: { ...defaultSettings(), mode }, hostname: 'example.com', systemDark: true,
    });
    assert.ok(OFF_ATTRIBUTE in document.attrs, `mode ${mode}: attribute not set`);
  }
});

test('startEarly sets the off attribute for a "never" site', () => {
  const document = fakeDocument();
  const settings = { ...defaultSettings(), mode: 'always', sites: { 'example.com': { rule: 'never' } } };
  const ctl = startEarly({ document, getComputedStyle: () => ({}), settings, hostname: 'example.com', systemDark: true });
  assert.equal(ctl.activation.on, false);
  assert.ok(OFF_ATTRIBUTE in document.attrs);
});
