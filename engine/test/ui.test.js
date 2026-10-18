import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pageHost, popupView, siteEntry, withRule, withLook, withDetectDark, matchPreset, presetLook, siteRows, scheduleHint,
} from '../src/ui-core.js';
import { createBackground } from '../src/background-core.js';
import { createMemoryArea, createSettingsStore, defaultSettings, validateSettings } from '../src/settings.js';
import { GET_TAB_STATE, RESET_ALL, TAB_STATE } from '../src/messages.js';
import { contrastRatio, parseColor } from '../src/color.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const withSites = (sites, extra = {}) => validateSettings({ ...defaultSettings(), ...extra, sites }).settings;

// ---------------------------------------------------------------- pageHost

test('pageHost: http(s) pages give their hostname', () => {
  assert.equal(pageHost('https://Example.com/a?b#c'), 'example.com');
  assert.equal(pageHost('http://sub.example.co.uk:8080/'), 'sub.example.co.uk');
  assert.equal(pageHost('http://127.0.0.1:3000/x'), '127.0.0.1');
});

test('pageHost: restricted pages give null', () => {
  for (const url of [
    undefined, null, '', 'not a url', 'about:blank', 'about:srcdoc', 'file:///Users/x/a.html', 'data:text/html,hi',
    'safari-web-extension://abc/popup/popup.html', 'favorites://', 'blob:https://example.com/123', 'javascript:void 0',
  ]) assert.equal(pageHost(url), null, String(url));
});

// --------------------------------------------------------------- popupView

test('popupView: restricted page shows the restricted state and no site controls', () => {
  const v = popupView({ settings: defaultSettings(), url: 'about:blank', report: undefined });
  assert.equal(v.restricted, true);
  assert.equal(v.host, null);
  assert.equal(v.rule, undefined);
  assert.match(v.status, /can’t change this page/);
  assert.equal(v.preset, 'standard');
  assert.deepEqual(v.look, defaultSettings().look);
});

test('popupView: site default, always, never', () => {
  for (const rule of ['default', 'always', 'never']) {
    const s = withSites(rule === 'default' ? {} : { 'example.com': { rule } });
    const v = popupView({ settings: s, url: 'https://example.com/', report: { on: true, reason: 'mode-always' } });
    assert.equal(v.restricted, false);
    assert.equal(v.host, 'example.com');
    assert.equal(v.rule, rule);
  }
});

test('popupView: status text for on, each off reason, and no report', () => {
  const s = defaultSettings();
  const at = (report) => popupView({ settings: s, url: 'https://a.test/', report }).status;
  assert.equal(at({ on: true, reason: 'system-dark' }), 'Dark mode is on for this page.');
  assert.equal(at({ on: false, reason: 'site-never' }), 'Dark mode is off: never dark on this site.');
  assert.equal(at({ on: false, reason: 'system-light' }), 'Dark mode is off: system appearance is light.');
  assert.equal(at({ on: false, reason: 'weird' }), 'Dark mode is off.');
  assert.match(at(null), /Not running on this page yet/);
});

test('popupView: already-dark detected, and the per-site override that forces dark', () => {
  const s = withSites({ 'a.test': { rule: 'default', detectDark: false } });
  const dark = popupView({ settings: defaultSettings(), url: 'https://a.test/', report: { on: false, reason: 'already-dark' } });
  assert.equal(dark.alreadyDark, true);
  assert.equal(dark.forcedDark, false);
  const forced = popupView({ settings: s, url: 'https://a.test/', report: { on: true, reason: 'site-always' } });
  assert.equal(forced.alreadyDark, false);
  assert.equal(forced.forcedDark, true);
});

test('popupView: per-site look overrides the global look', () => {
  const s = withSites({ 'a.test': { rule: 'default', look: { sepia: 40, brightness: 95, contrast: 95 } } });
  const v = popupView({ settings: s, url: 'https://a.test/', report: null });
  assert.equal(v.customLook, true);
  assert.deepEqual(v.look, { brightness: 95, contrast: 95, sepia: 40, grayscale: 0 });
  assert.equal(v.preset, 'warm');
  assert.equal(popupView({ settings: s, url: 'https://b.test/', report: null }).customLook, false);
});

// ------------------------------------------------------------ entry edits

test('entry edits: inherit-only entries become null (delete)', () => {
  assert.equal(withRule({ rule: 'never' }, 'default'), null);
  assert.equal(withLook({ rule: 'default', look: { sepia: 10 } }, null), null);
  assert.equal(withDetectDark({ rule: 'default', detectDark: false }, undefined), null);
});

test('entry edits: other fields are kept', () => {
  const e = { rule: 'always', look: { sepia: 10 }, engine: 'filter', detectDark: false };
  assert.deepEqual(withRule(e, 'never'), { ...e, rule: 'never' });
  assert.deepEqual(withLook(e, null), { rule: 'always', engine: 'filter', detectDark: false });
  assert.deepEqual(withDetectDark(e, undefined), { rule: 'always', look: { sepia: 10 }, engine: 'filter' });
  assert.deepEqual(withRule({ rule: 'default' }, 'always'), { rule: 'always' });
});

test('entry edits round-trip through the settings store', async () => {
  const store = createSettingsStore(createMemoryArea());
  let { settings } = await store.load();
  ({ settings } = await store.setSite('a.test', withRule(siteEntry(settings, 'a.test'), 'never')));
  assert.deepEqual(settings.sites['a.test'], { rule: 'never' });
  ({ settings } = await store.setSite('a.test', withLook(siteEntry(settings, 'a.test'), presetLook('mono'))));
  assert.equal(settings.sites['a.test'].look.grayscale, 100);
  ({ settings } = await store.setSite('a.test', withDetectDark(siteEntry(settings, 'a.test'), false)));
  ({ settings } = await store.setSite('a.test', withRule(siteEntry(settings, 'a.test'), 'default')));
  ({ settings } = await store.setSite('a.test', withLook(siteEntry(settings, 'a.test'), null)));
  assert.deepEqual(settings.sites['a.test'], { rule: 'default', detectDark: false });
  ({ settings } = await store.setSite('a.test', withDetectDark(siteEntry(settings, 'a.test'), undefined)));
  assert.deepEqual(settings.sites, {});
});

// ----------------------------------------------------- presets, rows, hint

test('matchPreset / presetLook', () => {
  for (const name of ['standard', 'soft', 'warm', 'mono']) assert.equal(matchPreset(presetLook(name)), name);
  assert.equal(matchPreset({ brightness: 101, contrast: 100, sepia: 0, grayscale: 0 }), 'custom');
  assert.equal(presetLook('nope'), null);
});

test('siteRows: sorted with a readable summary', () => {
  const s = withSites({
    'b.test': { rule: 'never' },
    'a.test': { rule: 'always', look: { sepia: 5 }, engine: 'filter', detectDark: false },
  });
  assert.deepEqual(siteRows(s), [
    { host: 'a.test', summary: 'Always dark, custom look, filter engine, darken even if already dark' },
    { host: 'b.test', summary: 'Never dark' },
  ]);
  assert.deepEqual(siteRows(defaultSettings()), []);
});

test('scheduleHint: overnight, same day, and empty window', () => {
  assert.match(scheduleHint({ start: '20:00', end: '07:00' }), /overnight/);
  assert.equal(scheduleHint({ start: '08:00', end: '17:00' }), '');
  assert.match(scheduleHint({ start: '09:00', end: '09:00' }), /never turns dark mode on/);
});

// ---------------------------------------------- background: popup messages

function bgApi() {
  const local = createMemoryArea();
  const ls = (set = new Set()) => ({ addListener: (f) => set.add(f), removeListener: (f) => set.delete(f), set });
  const onMessage = ls(), onChanged = ls();
  local.onChanged.addListener((c, a) => [...onChanged.set].forEach((f) => f(c, a)));
  const api = {
    runtime: { id: 'ext', onMessage },
    storage: { local, onChanged },
    tabs: { query: async () => [], sendMessage: async () => {} },
  };
  const send = (message, sender) => new Promise((done) => {
    const handler = [...onMessage.set][0];
    const async = handler(message, sender, done);
    if (!async) setTimeout(() => done('(no response)'), 5);
  });
  return { api, local, send };
}

test('background answers GET_TAB_STATE for the popup only', async () => {
  const { api, send } = bgApi();
  createBackground({ api, fetch: async () => { throw new Error('no network'); } });
  await send({ type: TAB_STATE, on: false, reason: 'already-dark' }, { id: 'ext', tab: { id: 7 }, frameId: 0 });
  assert.deepEqual(await send({ type: GET_TAB_STATE, tabId: 7 }, { id: 'ext' }), { on: false, reason: 'already-dark' });
  assert.equal(await send({ type: GET_TAB_STATE, tabId: 8 }, { id: 'ext' }), null);
  // A content script (has sender.tab) or another extension gets nothing.
  assert.equal(await send({ type: GET_TAB_STATE, tabId: 7 }, { id: 'ext', tab: { id: 7 } }), '(no response)');
  assert.equal(await send({ type: GET_TAB_STATE, tabId: 7 }, { id: 'other' }), '(no response)');
});

test('background RESET_ALL from the options page resets settings; content scripts cannot', async () => {
  const { api, local, send } = bgApi();
  const bg = createBackground({ api, fetch: async () => { throw new Error('no network'); } });
  await bg.store.update({ mode: 'off', sites: { 'a.test': { rule: 'never' } } });
  assert.equal(await send({ type: RESET_ALL }, { id: 'ext', tab: { id: 1 } }), '(no response)');
  assert.equal(local._raw().settings.mode, 'off');
  assert.deepEqual(await send({ type: RESET_ALL }, { id: 'ext' }), { ok: true });
  assert.deepEqual(local._raw().settings, defaultSettings());
});

// --------------------------------------------- static HTML accessibility

// Minimal tag scanner: enough for our own two pages (no dependencies).
function tags(html) {
  const out = [];
  const re = /<([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    for (const a of m[2].matchAll(/([^\s=>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    out.push({ name: m[1].toLowerCase(), attrs, index: m.index, end: re.lastIndex });
  }
  return out;
}

const PAGES = [
  { html: 'Extension/Resources/popup/popup.html', js: 'engine/src/popup.js' },
  { html: 'Extension/Resources/options/options.html', js: 'engine/src/options.js' },
];

for (const { html: htmlPath, js: jsPath } of PAGES) {
  const html = read(htmlPath);
  const js = read(jsPath);
  const all = tags(html);

  test(`${htmlPath}: only native controls, no ARIA widget roles or click handlers on non-controls`, () => {
    for (const t of all) {
      // Live regions are announcements, not controls; any other role means a hand-made widget.
      if ('role' in t.attrs) assert.ok(['status', 'alert'].includes(t.attrs.role), `role="${t.attrs.role}" on <${t.name}>: use a native element`);
      assert.ok(!Object.keys(t.attrs).some((a) => a.startsWith('on')), `inline handler on <${t.name}>`);
      if ('tabindex' in t.attrs) assert.ok(Number(t.attrs.tabindex) <= 0, `tabindex>0 on <${t.name}>`);
      if (['div', 'span', 'li', 'p', 'svg'].includes(t.name)) assert.ok(!('tabindex' in t.attrs), `focusable <${t.name}>`);
    }
    assert.ok(!/\.(setAttribute\(\s*'role'|onclick\s*=|tabIndex\s*=)/.test(js), `${jsPath} must not fake controls`);
  });

  test(`${htmlPath}: every button has a name; icon buttons have aria-label; icons are hidden`, () => {
    for (const t of all.filter((x) => x.name === 'button')) {
      const close = html.indexOf('</button>', t.end);
      const text = html.slice(t.end, close).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
      const inTemplate = html.lastIndexOf('<template', t.index) > html.lastIndexOf('</template>', t.index);
      if (text) continue;
      if (t.attrs['aria-label']) continue;
      // A row button in a <template> gets its per-row name from the script.
      assert.ok(inTemplate && /setAttribute\('aria-label',/.test(js), `unnamed button at ${t.index}`);
    }
    for (const t of all.filter((x) => x.name === 'button')) assert.ok(t.attrs.type || html.slice(0, t.index).includes('method="dialog"'), 'buttons declare type');
    for (const t of all.filter((x) => x.name === 'svg')) {
      assert.equal(t.attrs['aria-hidden'], 'true', 'decorative svg must be aria-hidden');
      assert.equal(t.attrs.focusable, 'false');
    }
  });

  test(`${htmlPath}: every input and select is labelled`, () => {
    for (const t of all.filter((x) => ['input', 'select', 'textarea'].includes(x.name))) {
      const id = t.attrs.id;
      const byFor = id && all.some((x) => x.name === 'label' && x.attrs.for === id);
      const wrapped = html.lastIndexOf('<label', t.index) > html.lastIndexOf('</label>', t.index);
      assert.ok(byFor || wrapped, `unlabelled <${t.name}${id ? ` id=${id}` : ''}>`);
    }
  });

  test(`${htmlPath}: no inline script, lang set, script ids exist in the page`, () => {
    assert.ok(/<html lang="en">/.test(html));
    for (const t of all.filter((x) => x.name === 'script')) assert.ok(t.attrs.src, 'inline scripts are blocked by extension CSP');
    const ids = new Set(all.map((t) => t.attrs.id).filter(Boolean));
    for (const [, id] of js.matchAll(/\$\('([\w-]+)'\)/g)) assert.ok(ids.has(id), `${jsPath} uses #${id}, missing in ${htmlPath}`);
    for (const [, k] of js.matchAll(/\$\(`\$\{k\}(-value)`\)/g)) {
      for (const s of ['brightness', 'contrast', 'sepia', 'grayscale']) assert.ok(ids.has(s + k) && ids.has(s));
    }
  });
}

test('popup: the restricted state hides site controls (wired by id)', () => {
  const js = read('engine/src/popup.js');
  assert.match(js, /\$\('site'\)\.hidden = view\.restricted/);
  assert.match(js, /\$\('custom-look-row'\)\.hidden = view\.restricted/);
  assert.match(read('Extension/Resources/popup/popup.html'), /<fieldset id="site" hidden>/);
});

test('manifest points at the popup and options page, and they exist', () => {
  const m = JSON.parse(read('Extension/Resources/manifest.json'));
  assert.equal(m.action.default_popup, 'popup/popup.html');
  assert.equal(m.options_ui.page, 'options/options.html');
  for (const p of [m.action.default_popup, m.options_ui.page, 'popup/popup.js', 'options/options.js', 'ui/ui.css']) {
    assert.ok(existsSync(resolve(ROOT, 'Extension/Resources', p)), p);
  }
});

test('popup and options bundles make no network requests', () => {
  for (const p of ['Extension/Resources/popup/popup.js', 'Extension/Resources/options/options.js']) {
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\/(?!x\.invalid)/.test(read(p)), p);
  }
  assert.ok(!/https?:\/\//.test(read('Extension/Resources/ui/ui.css')), 'no remote fonts or images');
});

test('ui.css (Dusk) tokens meet contrast, and focus stays visible', () => {
  const css = read('Extension/Resources/ui/ui.css');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('* {'));
  const t = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], parseColor(m[2])]));
  for (const surface of ['bg', 'group', 'raised']) {
    for (const fg of ['fg', 'muted', 'accent', 'warning', 'danger']) {
      const r = contrastRatio(t[fg], t[surface]);
      assert.ok(r >= 4.5, `--${fg} on --${surface} is ${r.toFixed(2)}:1`);
    }
  }
  assert.ok(contrastRatio(t['on-accent'], t.accent) >= 4.5, '--on-accent on --accent');
  for (const surface of ['bg', 'group']) {
    assert.ok(contrastRatio(t.edge, t[surface]) >= 3, `--edge (control outlines) on --${surface} >= 3:1`);
    assert.ok(contrastRatio(t.focus, t[surface]) >= 3, `--focus on --${surface}`);
  }
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*\d+px solid var\(--focus\)/);
  assert.ok(!/outline:\s*(none|0)/.test(css), 'never remove the focus outline');
});

test('ui.css: colors, type sizes, radii and durations come from :root tokens only', () => {
  const css = read('Extension/Resources/ui/ui.css');
  const start = css.indexOf(':root {');
  const end = css.indexOf('\n}\n', start) + 3;
  const rest = css.slice(0, start) + css.slice(end);
  const body = rest.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/#[0-9A-Fa-f]{3,8}\b/.test(body), 'hex color outside :root');
  assert.ok(!/\b(?:hsl|oklch|oklab|lch)a?\(/.test(body), 'color function outside :root');
  assert.ok(!/(?<!\w)(?:color|background|border|outline|fill|stroke)[\w-]*:[^;]*\brgba?\(/.test(body), 'rgb() color outside :root');
  assert.ok(!/font-size:\s*[\d.]+(?:rem|px|em)/.test(body), 'font-size must use a --text-* token');
  assert.ok(!/border-radius:\s*[\d.]+px/.test(body), 'border-radius must use a --r-* token');
  assert.ok(!/(?:transition|animation)[^;]*\b\d+m?s\b(?!\))/.test(body.replace(/var\([^)]*\)/g, '')), 'durations come from --dur');
});
