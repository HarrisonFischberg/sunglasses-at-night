// Your own fixes ("Fix something on this page"): validation, storage in
// settings, the CSS each one-tap fix writes, the popup's list, the report
// draft, and which ids and classes the picker trusts as an address.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeSelector, normalizeFixes, tidyLabel, MAX_FIXES_PER_SITE, FIX_ACTIONS } from '../src/fix-rules.js';
import { validateSettings, defaultSettings, resolveSite, createMemoryArea, createSettingsStore } from '../src/settings.js';
import { userFixCss } from '../src/site-fixes.js';
import { withFix, withoutFix, withRule, withEngine, siteEntry, siteRows, popupView } from '../src/ui-core.js';
import { reportSettings } from '../src/report.js';
import { isStableToken, describeElement } from '../src/picker-core.js';
import { parseColor, relativeLuminance } from '../src/color.js';

const LOOK = defaultSettings().look;

// ------------------------------------------------------------ validation

test('isSafeSelector: ordinary selectors pass', () => {
  for (const s of [
    '#hero', 'h1.title', 'header.top > span:nth-of-type(2)', 'a[aria-label="Chrome Web Store"]',
    'body > div:nth-of-type(3) > svg', 'div[data-testid="logo"]',
  ]) assert.equal(isSafeSelector(s), true, s);
});

test('isSafeSelector: anything that could break out of the rule or load something is refused', () => {
  for (const s of [
    '', '   ', null, 42, 'a{color:red}', 'a}body{display:none', 'a;b', 'a /* x */', '@import x', 'a, b',
    'div[style*="url(x)"]', 'a\\7d', 'a\nb', 'x'.repeat(401), 'a>b',
  ]) assert.equal(isSafeSelector(s), false, String(s));
});

test('normalizeFixes: keeps valid fixes, drops bad ones with a reason, last fix per element wins', () => {
  const errors = [];
  const out = normalizeFixes([
    { selector: '#a', action: 'lighter', label: '  “Chrome   Web Store”  ' },
    { selector: '#b', action: 'explode' },
    { selector: 'a{}', action: 'hide' },
    'nope',
    { selector: '#a', action: 'flip' },
  ], 'fixes', errors);
  assert.deepEqual(out, [{ selector: '#a', action: 'flip' }]);
  assert.equal(errors.length, 3);
  assert.deepEqual(normalizeFixes({}, 'fixes', errors), []);
});

test('normalizeFixes: at most MAX_FIXES_PER_SITE, the newest kept', () => {
  const errors = [];
  const many = Array.from({ length: MAX_FIXES_PER_SITE + 5 }, (_, i) => ({ selector: `#f${i}`, action: 'hide' }));
  const out = normalizeFixes(many, 'fixes', errors);
  assert.equal(out.length, MAX_FIXES_PER_SITE);
  assert.equal(out.at(-1).selector, `#f${MAX_FIXES_PER_SITE + 4}`);
  assert.equal(errors.length, 1);
});

test('tidyLabel: one line, at most 60 characters', () => {
  assert.equal(tidyLabel(' a\n\n b '), 'a b');
  assert.equal(tidyLabel('x'.repeat(80)).length, 60);
  assert.equal(tidyLabel(undefined), '');
});

// ------------------------------------------------------------- settings

test('settings: a site entry keeps its fixes; an entry with only fixes is kept', () => {
  const { settings, errors } = validateSettings({
    ...defaultSettings(),
    sites: { 'chrome.google.com': { rule: 'default', fixes: [{ selector: 'span.title', action: 'lighter' }] } },
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.sites['chrome.google.com'].fixes, [{ selector: 'span.title', action: 'lighter' }]);
  assert.deepEqual(resolveSite(settings, 'chrome.google.com').fixes, [{ selector: 'span.title', action: 'lighter' }]);
  assert.deepEqual(resolveSite(settings, 'other.example').fixes, []);
});

test('settings: an empty fixes list leaves no entry behind', () => {
  const { settings } = validateSettings({ ...defaultSettings(), sites: { 'a.example': { rule: 'default', fixes: [] } } });
  assert.deepEqual(settings.sites, {});
});

test('store: setSite with a fix, then without it, round-trips', async () => {
  const store = createSettingsStore(createMemoryArea());
  const { settings } = await store.load();
  await store.setSite('a.example', withFix(siteEntry(settings, 'a.example'), { selector: '#logo', action: 'flip', label: 'Icon or logo' }));
  let s = (await store.load()).settings;
  assert.deepEqual(s.sites['a.example'], { rule: 'default', fixes: [{ selector: '#logo', action: 'flip', label: 'Icon or logo' }] });
  await store.setSite('a.example', withoutFix(siteEntry(s, 'a.example'), '#logo'));
  s = (await store.load()).settings;
  assert.deepEqual(s.sites, {});
});

// ------------------------------------------------------------------ CSS

function colorIn(css, prop) {
  const m = new RegExp(`${prop}:(rgb\\([^)]*\\))`).exec(css);
  return m && parseColor(m[1]);
}

test('userFixCss: nothing to fix, no CSS', () => {
  assert.equal(userFixCss([], LOOK), '');
  assert.equal(userFixCss(undefined, LOOK), '');
});

test('userFixCss: one rule set per fix, each the right kind', () => {
  const css = userFixCss([
    { selector: '#a', action: 'lighter' },
    { selector: '#b', action: 'darker' },
    { selector: '#c', action: 'flip' },
    { selector: '#d', action: 'hide' },
  ], LOOK);
  assert.match(css, /^#a,#a \*:not\(img\)[^{]*\{color:rgb\([^)]*\)!important;-webkit-text-fill-color:/m);
  assert.match(css, /#a svg \[fill\]:not\(\[fill="none"\]\)[^{]*\{fill:rgb/);
  assert.match(css, /^#b\{background-color:rgb\([^)]*\)!important;background-image:none!important\}$/m);
  assert.match(css, /^#c\{filter:invert\(100%\) hue-rotate\(180deg\)!important\}$/m);
  assert.match(css, /^#d\{display:none!important\}$/m);
  assert.ok(!/url\(|@import/.test(css), 'loads nothing');
});

test('userFixCss: lighter is light text, darker is a dark background (dynamic engine)', () => {
  const css = userFixCss([{ selector: '#a', action: 'lighter' }, { selector: '#b', action: 'darker' }], LOOK);
  assert.ok(relativeLuminance(colorIn(css, 'color')) > 0.6, 'light text');
  assert.ok(relativeLuminance(colorIn(css, 'background-color')) < 0.05, 'dark background');
});

test('userFixCss: under the filter engine the colors come out right after the page inversion', () => {
  const css = userFixCss([{ selector: '#a', action: 'lighter' }, { selector: '#b', action: 'darker' }], LOOK, 'filter');
  assert.ok(relativeLuminance(colorIn(css, 'color')) < 0.05, 'dark before inversion = light on screen');
  assert.ok(relativeLuminance(colorIn(css, 'background-color')) > 0.9, 'light before inversion = dark on screen');
});

test('every fix action writes CSS', () => {
  for (const action of FIX_ACTIONS) assert.ok(userFixCss([{ selector: '#x', action }], LOOK), action);
});

// --------------------------------------------------------------- popup

test('ui-core: withFix replaces the fix for the same element; other edits keep the fixes', () => {
  let e = withFix({ rule: 'default' }, { selector: '#a', action: 'lighter' });
  e = withFix(e, { selector: '#b', action: 'hide' });
  e = withFix(e, { selector: '#a', action: 'flip' });
  assert.deepEqual(e.fixes, [{ selector: '#b', action: 'hide' }, { selector: '#a', action: 'flip' }]);
  assert.deepEqual(withRule(e, 'always').fixes, e.fixes);
  assert.deepEqual(withEngine(e, 'filter').fixes, e.fixes);
  assert.equal(withoutFix(withoutFix(e, '#a'), '#b'), null, 'nothing left to store');
});

test('ui-core: the popup lists this site’s fixes, the Sites list counts them', () => {
  const { settings } = validateSettings({
    ...defaultSettings(),
    sites: { 'a.example': { rule: 'default', fixes: [{ selector: '#a', action: 'lighter', label: '“Developer Dashboard”' }, { selector: '#b', action: 'flip' }] } },
  });
  const v = popupView({ settings, url: 'https://a.example/x', report: { on: true, host: 'a.example' } });
  assert.deepEqual(v.fixes, [
    { selector: '#a', title: '“Developer Dashboard”', action: 'Lighter text' },
    { selector: '#b', title: '#b', action: 'Flip colors' },
  ]);
  assert.deepEqual(siteRows(settings), [{ host: 'a.example', summary: 'Default, 2 fixes' }]);
});

test('report: the draft says how many fixes this site has, never what they name', () => {
  const settings = {
    ...defaultSettings(),
    sites: { 'a.example': { rule: 'never', fixes: [{ selector: '#private', action: 'hide', label: '“my account”' }] } },
  };
  const out = reportSettings(settings, 'a.example');
  assert.deepEqual(out.thisSite, { rule: 'never', fixes: 1 });
  assert.ok(!JSON.stringify(out).includes('private'));
  assert.ok(!JSON.stringify(out).includes('my account'));
});

// --------------------------------------------------------------- picker

test('isStableToken: hand-written names pass', () => {
  for (const t of ['header', 'site-title', 'nav__item', 'h1', 'col12', 'mt4', 'logo', 'DeveloperDashboard', 'main-content']) {
    assert.equal(isStableToken(t), true, t);
  }
});

test('isStableToken: hashes, counters, state and obfuscated names are skipped', () => {
  for (const t of [
    'css-1x2y3z', 'sc-bdVaJa', 'x7f3a9', 'ZFr60d', 'VfPpkd', 'LgbsSe', 'item-12345', 'active', 'is-open', 'hidden',
    'ember123', '9lives', 'a:b', '',
  ]) assert.equal(isStableToken(t), false, t);
});

test('describeElement: says what was picked, never reads form fields', () => {
  const fake = (localName, attrs = {}, text = '') => ({ localName, innerText: text, getAttribute: (a) => attrs[a] ?? null });
  assert.equal(describeElement(fake('span', {}, 'Chrome Web Store')), '“Chrome Web Store”');
  assert.equal(describeElement(fake('a', { 'aria-label': 'Home' }, 'ignored')), '“Home”');
  assert.equal(describeElement(fake('svg')), 'Icon or logo');
  assert.equal(describeElement(fake('input', {}, 'typed secret')), 'Text box');
  assert.equal(describeElement(fake('div', {}, 'x'.repeat(100))).length <= 42, true);
});
