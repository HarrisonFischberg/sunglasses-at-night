import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DARK_LUMINANCE, parseColorScheme, usedColorScheme, detectAlreadyDark, finalDecision,
} from '../src/detect.js';
import { contrastRatio, parseColor } from '../src/color.js';
import {
  SHEET_ID, antiFlashCss, readPageColors, startEarly, whenParsed, whenRoot,
} from '../src/early.js';
import { defaultSettings, validateSettings } from '../src/settings.js';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

// -------------------------------------------------------- color-scheme parse

test('parseColorScheme: keywords, only, normal, junk', () => {
  assert.deepEqual(parseColorScheme('dark'), { light: false, dark: true, only: false });
  assert.deepEqual(parseColorScheme('light dark'), { light: true, dark: true, only: false });
  assert.deepEqual(parseColorScheme('  Only   DARK '), { light: false, dark: true, only: true });
  assert.deepEqual(parseColorScheme('normal'), { light: false, dark: false, only: false });
  assert.deepEqual(parseColorScheme('only'), { light: false, dark: false, only: false });
  assert.deepEqual(parseColorScheme('purple'), { light: false, dark: false, only: false });
  assert.deepEqual(parseColorScheme(''), { light: false, dark: false, only: false });
  assert.deepEqual(parseColorScheme(undefined), { light: false, dark: false, only: false });
});

test('usedColorScheme: CSS beats meta; both schemes follow the system', () => {
  assert.equal(usedColorScheme({ css: 'dark' }), 'dark');
  assert.equal(usedColorScheme({ css: 'light' }), 'light');
  assert.equal(usedColorScheme({ css: 'normal', meta: 'dark' }), 'dark');
  assert.equal(usedColorScheme({ css: 'light', meta: 'dark' }), 'light');
  assert.equal(usedColorScheme({ css: 'light dark', systemDark: false }), 'light');
  assert.equal(usedColorScheme({ css: 'light dark', systemDark: true }), 'dark');
  assert.equal(usedColorScheme({ meta: 'dark light', systemDark: true }), 'dark');
  assert.equal(usedColorScheme({}), 'light');
});

// ------------------------------------------------------------- detection

const DETECT_CASES = [
  // [name, input, dark, reason]
  ['plain white page', { rootBg: TRANSPARENT, bodyBg: TRANSPARENT }, false, 'light-background'],
  ['explicit white body', { rootBg: TRANSPARENT, bodyBg: 'rgb(255, 255, 255)', bodyColor: 'rgb(0, 0, 0)' }, false, 'light-background'],
  ['dark body, light text', { rootBg: TRANSPARENT, bodyBg: '#121212', bodyColor: '#e0e0e0' }, true, 'dark-background'],
  ['dark root, transparent body', { rootBg: 'rgb(30, 30, 30)', bodyBg: TRANSPARENT, rootColor: '#fff' }, true, 'dark-background'],
  ['white root, dark body covers it', { rootBg: '#fff', bodyBg: '#1e1e1e', bodyColor: '#ddd' }, true, 'dark-background'],
  ['dark root, white body covers it', { rootBg: '#000', bodyBg: '#fff', bodyColor: '#000' }, false, 'light-background'],
  ['oklch dark theme', { bodyBg: 'oklch(0.2 0.02 260)', bodyColor: 'oklch(0.9 0.01 260)' }, true, 'dark-background'],
  ['mid-gray is not dark', { bodyBg: '#808080', bodyColor: '#000' }, false, 'light-background'],
  ['dark text on darkish bg still gets fixed', { bodyBg: '#333', bodyColor: '#111' }, false, 'dark-text'],
  ['translucent black over white canvas is light', { bodyBg: 'rgba(0, 0, 0, 0.2)' }, false, 'light-background'],
  ['translucent black, mostly opaque', { bodyBg: 'rgba(0, 0, 0, 0.95)', bodyColor: '#eee' }, true, 'dark-background'],
  ['transparent page with color-scheme dark shows dark canvas', { rootBg: TRANSPARENT, bodyBg: TRANSPARENT, colorScheme: 'dark', bodyColor: 'rgb(255, 255, 255)' }, true, 'dark-background'],
  ['meta dark, transparent page', { rootBg: TRANSPARENT, bodyBg: TRANSPARENT, metaColorScheme: 'dark' }, true, 'dark-background'],
  ['meta dark but page paints white', { bodyBg: '#fff', bodyColor: '#000', metaColorScheme: 'dark' }, false, 'light-background'],
  ['light dark, system light, transparent', { rootBg: TRANSPARENT, colorScheme: 'light dark', systemDark: false }, false, 'light-background'],
  ['light dark, system dark, transparent', { rootBg: TRANSPARENT, colorScheme: 'light dark', systemDark: true }, true, 'dark-background'],
  ['no readable colors, light scheme', {}, false, 'no-background'],
  ['no readable colors, dark scheme', { colorScheme: 'only dark' }, true, 'scheme-dark'],
  ['unparseable var() colors fall back', { bodyBg: 'var(--bg)', rootBg: 'garbage' }, false, 'no-background'],
];

for (const [name, input, dark, reason] of DETECT_CASES) {
  test(`detectAlreadyDark: ${name}`, () => {
    const r = detectAlreadyDark(input);
    assert.equal(r.dark, dark);
    assert.equal(r.reason, reason);
  });
}

test('detectAlreadyDark: luminance threshold is exclusive and reported', () => {
  const below = detectAlreadyDark({ bodyBg: 'rgb(88 88 88)', bodyColor: '#fff' });
  const above = detectAlreadyDark({ bodyBg: 'rgb(90 90 90)', bodyColor: '#fff' });
  assert.ok(below.luminance < DARK_LUMINANCE && below.dark);
  assert.ok(above.luminance >= DARK_LUMINANCE && !above.dark);
});

// --------------------------------------------------------- final decision

test('finalDecision: inactive, already dark, detection off, apply', () => {
  const on = { on: true, reason: 'mode-always' };
  assert.deepEqual(finalDecision({ activation: { on: false, reason: 'site-never' } }), { apply: false, reason: 'site-never' });
  assert.deepEqual(finalDecision({ activation: on, detectDark: true, detection: { dark: true } }), { apply: false, reason: 'already-dark' });
  assert.deepEqual(finalDecision({ activation: on, detectDark: false, detection: { dark: true } }), { apply: true, reason: 'mode-always' });
  assert.deepEqual(finalDecision({ activation: on, detectDark: true, detection: { dark: false } }), { apply: true, reason: 'mode-always' });
  assert.deepEqual(finalDecision({ activation: on, detectDark: true, detection: null }), { apply: true, reason: 'mode-always' });
  assert.deepEqual(finalDecision({}), { apply: false, reason: 'inactive' });
});

// -------------------------------------------------------- anti-flash sheet

test('antiFlashCss: dark root, readable text, colors only', () => {
  const css = antiFlashCss();
  const bg = /background-color:(rgb\([^)]*\))/.exec(css)[1];
  const fg = /;color:(rgb\([^)]*\))/.exec(css)[1];
  assert.ok(detectAlreadyDark({ bodyBg: bg, bodyColor: fg }).dark, 'sheet colors read as dark');
  assert.ok(contrastRatio(parseColor(fg), parseColor(bg)) >= 4.5);
  assert.match(css, /color-scheme:dark/);
  assert.doesNotMatch(css, /pointer-events|position|display|z-index|opacity|filter|visibility/);
});

test('antiFlashCss: follows the look (brightness lowers the bg)', () => {
  const lum = (css) => detectAlreadyDark({ bodyBg: /background-color:(rgb\([^)]*\))/.exec(css)[1] }).luminance;
  assert.ok(lum(antiFlashCss({ brightness: 60 })) < lum(antiFlashCss({ brightness: 100 })));
});

// ------------------------------------------------------------- fake DOM

// Minimal DOM: elements with page-authored computed colors. While our early
// sheet is attached and enabled, root/body backgrounds read as the sheet's,
// exactly what a real browser would report, so tests catch a measurement
// taken with the sheet still on.
function fakeDom({ root = {}, body = {}, meta, readyState = 'interactive', withHead = true } = {}) {
  const listeners = {};
  const attached = new Set();
  const mkEl = (tag) => ({
    tagName: tag.toUpperCase(),
    media: '',
    textContent: '',
    id: '',
    parent: null,
    remove() { if (this.parent) { this.parent.children.delete(this); attached.delete(this); this.parent = null; } },
    children: new Set(),
    appendChild(child) { child.parent = this; this.children.add(child); attached.add(child); return child; },
  });
  const documentElement = { ...mkEl('html'), computed: root };
  const head = withHead ? mkEl('head') : null;
  const bodyEl = { ...mkEl('body'), computed: body };
  const metaEl = meta === undefined ? null : { getAttribute: (n) => (n === 'content' ? meta : null) };
  const document = {
    documentElement, head, body: bodyEl, readyState,
    createElement: mkEl,
    querySelector: (sel) => (sel.startsWith('meta[name="color-scheme"') ? metaEl : null),
    getElementById: (id) => [...attached].find((e) => e.id === id) ?? null,
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    fire: (type) => (listeners[type] ?? []).forEach((fn) => fn()),
  };
  let reads = 0;
  const getComputedStyle = (el) => {
    reads++;
    const sheet = document.getElementById(SHEET_ID);
    const on = sheet && sheet.media !== 'not all';
    const own = el.computed;
    if (on && (el === documentElement || el === bodyEl)) {
      return { ...own, backgroundColor: 'rgb(26, 26, 30)', color: 'rgb(230, 230, 230)', colorScheme: 'dark' };
    }
    return { backgroundColor: TRANSPARENT, color: 'rgb(0, 0, 0)', colorScheme: 'normal', ...own };
  };
  return { document, getComputedStyle, reads: () => reads };
}

function settings(patch = {}) {
  const { settings: s, errors } = validateSettings({ ...defaultSettings(), mode: 'always', ...patch });
  assert.deepEqual(errors, []);
  return s;
}

const HOST = 'example.com';

test('startEarly: injects the sheet at document_start when active', () => {
  const dom = fakeDom();
  const ctl = startEarly({ ...dom, settings: settings(), hostname: HOST });
  assert.equal(ctl.activation.on, true);
  assert.ok(ctl.style);
  assert.equal(ctl.style.id, SHEET_ID);
  assert.equal(ctl.style.textContent, antiFlashCss());
  assert.equal(dom.document.getElementById(SHEET_ID), ctl.style);
});

test('startEarly: no head yet → sheet goes on the root element', () => {
  const dom = fakeDom({ withHead: false });
  const ctl = startEarly({ ...dom, settings: settings(), hostname: HOST });
  assert.equal(ctl.style.parent, dom.document.documentElement);
});

test('startEarly: inactive → no sheet, finish does not measure', () => {
  const dom = fakeDom();
  const ctl = startEarly({ ...dom, settings: settings({ mode: 'off' }), hostname: HOST });
  assert.equal(ctl.style, null);
  assert.equal(dom.document.getElementById(SHEET_ID), null);
  assert.deepEqual(ctl.finish(), { apply: false, reason: 'mode-off', detection: null });
  assert.equal(dom.reads(), 0);
});

test('startEarly: system mode with light system → no sheet', () => {
  const dom = fakeDom();
  const ctl = startEarly({ ...dom, settings: settings({ mode: 'system' }), hostname: HOST, systemDark: false });
  assert.equal(ctl.style, null);
});

test('finish: sheet removed when the site is already dark', () => {
  const dom = fakeDom({ body: { backgroundColor: 'rgb(18, 18, 18)', color: 'rgb(224, 224, 224)' } });
  const ctl = startEarly({ ...dom, settings: settings(), hostname: HOST });
  assert.ok(dom.document.getElementById(SHEET_ID));
  const r = ctl.finish();
  assert.equal(r.apply, false);
  assert.equal(r.reason, 'already-dark');
  assert.equal(r.detection.reason, 'dark-background');
  assert.equal(dom.document.getElementById(SHEET_ID), null);
  assert.equal(ctl.style, null);
});

test('finish: sheet removed on a transparent page that declares color-scheme dark via meta', () => {
  const dom = fakeDom({ meta: 'dark', body: { color: 'rgb(240, 240, 240)' } });
  const ctl = startEarly({ ...dom, settings: settings(), hostname: HOST });
  assert.equal(ctl.finish().reason, 'already-dark');
  assert.equal(dom.document.getElementById(SHEET_ID), null);
});

test('finish: sheet kept on a light site (measured with the sheet off, then restored)', () => {
  const dom = fakeDom({ body: { backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(17, 17, 17)' } });
  const ctl = startEarly({ ...dom, settings: settings(), hostname: HOST });
  const r = ctl.finish();
  assert.equal(r.apply, true);
  assert.equal(r.detection.reason, 'light-background');
  const sheet = dom.document.getElementById(SHEET_ID);
  assert.ok(sheet);
  assert.equal(sheet.media, '', 'sheet re-enabled after measuring');
});

test('finish: global detectDark off keeps the sheet on a dark site', () => {
  const dom = fakeDom({ body: { backgroundColor: '#111', color: '#eee' } });
  const ctl = startEarly({ ...dom, settings: settings({ detectDark: false }), hostname: HOST });
  const r = ctl.finish();
  assert.equal(r.apply, true);
  assert.equal(r.detection, null);
  assert.ok(dom.document.getElementById(SHEET_ID));
});

test('finish: per-site detectDark override beats the global setting', () => {
  const darkBody = { body: { backgroundColor: '#111', color: '#eee' } };
  const off = fakeDom(darkBody);
  startEarly({ ...off, settings: settings({ sites: { [HOST]: { detectDark: false } } }), hostname: HOST }).finish();
  assert.ok(off.document.getElementById(SHEET_ID), 'site opted out of detection');

  const on = fakeDom(darkBody);
  startEarly({ ...on, settings: settings({ detectDark: false, sites: { [HOST]: { detectDark: true } } }), hostname: HOST }).finish();
  assert.equal(on.document.getElementById(SHEET_ID), null, 'site opted in to detection');
});

test('finish: site rule never → no sheet even on a light page', () => {
  const dom = fakeDom();
  const ctl = startEarly({ ...dom, settings: settings({ sites: { [HOST]: { rule: 'never' } } }), hostname: HOST });
  assert.equal(ctl.style, null);
  assert.equal(ctl.finish().reason, 'site-never');
});

test('finish: idempotent', () => {
  const dom = fakeDom({ body: { backgroundColor: '#111', color: '#eee' } });
  const ctl = startEarly({ ...dom, settings: settings(), hostname: HOST });
  const a = ctl.finish();
  const reads = dom.reads();
  assert.equal(ctl.finish(), a);
  assert.equal(dom.reads(), reads);
});

test('readPageColors: reads page colors, not the sheet, and restores media', () => {
  const dom = fakeDom({ root: { colorScheme: 'light dark' }, body: { backgroundColor: 'rgb(250, 250, 250)' }, meta: 'light' });
  const ctl = startEarly({ ...dom, settings: settings(), hostname: HOST });
  const c = readPageColors(dom.document, dom.getComputedStyle, ctl.style);
  assert.equal(c.bodyBg, 'rgb(250, 250, 250)');
  assert.equal(c.colorScheme, 'light dark');
  assert.equal(c.metaColorScheme, 'light');
  assert.equal(ctl.style.media, '');
});

test('whenRoot: runs now with a root, else once <html> is inserted', () => {
  let n = 0;
  whenRoot(fakeDom().document, () => n++);
  assert.equal(n, 1);

  const early = fakeDom();
  const html = early.document.documentElement;
  early.document.documentElement = null;
  let observer = null;
  class FakeObserver {
    constructor(cb) { this.cb = cb; observer = this; }
    observe(target, opts) { this.target = target; this.opts = opts; }
    disconnect() { this.disconnected = true; }
  }
  whenRoot(early.document, () => n++, FakeObserver);
  assert.equal(n, 1);
  assert.equal(observer.target, early.document);
  assert.deepEqual(observer.opts, { childList: true });
  observer.cb([]); // a doctype node arrives first
  assert.equal(n, 1);
  early.document.documentElement = html;
  observer.cb([]);
  assert.equal(n, 2);
  assert.equal(observer.disconnected, true);
});

test('whenParsed: runs now after parsing, else on DOMContentLoaded', () => {
  let n = 0;
  const parsed = fakeDom({ readyState: 'interactive' });
  whenParsed(parsed.document, () => n++);
  assert.equal(n, 1);
  const loading = fakeDom({ readyState: 'loading' });
  whenParsed(loading.document, () => n++);
  assert.equal(n, 1);
  loading.document.fire('DOMContentLoaded');
  assert.equal(n, 2);
});
