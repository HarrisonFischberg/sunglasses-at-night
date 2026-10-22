import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseList, parseFixes, matchUrl, urlInList, fixesFor, fixCss } from '../src/site-fixes.js';
import { DARK_SITES } from '../src/generated/dark-sites.js';
import { siteFixes } from '../src/generated/site-fixes-data.js';
const SITE_FIXES = siteFixes();

test('matchUrl: host, www, subdomain wildcard, TLD wildcard, path prefix, regex', () => {
  assert.ok(matchUrl('https://example.com/a', 'example.com'));
  assert.ok(matchUrl('https://www.example.com/', 'example.com'));
  assert.ok(!matchUrl('https://mail.example.com/', 'example.com'), 'other subdomains need *.');
  assert.ok(matchUrl('https://mail.example.com/', '*.example.com'));
  assert.ok(!matchUrl('https://example.com/', '*.example.com'));
  assert.ok(matchUrl('https://www.google.de/search', 'google.*'));
  assert.ok(matchUrl('https://site.io/docs/x', 'site.io/docs'));
  assert.ok(!matchUrl('https://site.io/blog', 'site.io/docs'));
  assert.ok(matchUrl('https://a.b/c', '/^https:\\/\\/a\\.b/'));
  assert.ok(!matchUrl('not a url', 'example.com'));
});

test('parseFixes: blocks, commands, unknown commands dropped, comments in lists', () => {
  const text = [
    '*', '', 'INVERT', '.logo', '', 'CSS', 'a { color: ${#000} !important; }',
    '================================',
    'example.com', '*.example.org', '', 'IGNORE INLINE STYLE', '.chart', '# note', '',
    'IGNORE IMAGE ANALYSIS', '.hero',
  ].join('\n');
  assert.deepEqual(parseFixes(text), [
    { url: ['*'], invert: ['.logo'], css: 'a { color: ${#000} !important; }' },
    { url: ['example.com', '*.example.org'], ignoreInlineStyle: ['.chart'] },
  ]);
  assert.deepEqual(parseList('a.com\n\n# x\n b.com '), ['a.com', 'b.com']);
});

test('fixesFor: the common block plus every matching site block, null when no site matches', () => {
  const fixes = [
    { url: ['*'], invert: ['.g'], css: 'g{}' },
    { url: ['a.com'], css: 'a{}' },
    { url: ['*.a.com', 'a.com'], invert: ['.a'] },
    { url: ['b.com'], css: 'b{}' },
  ];
  assert.deepEqual(fixesFor('https://www.a.com/', fixes), { invert: ['.g', '.a'], css: 'g{}\na{}', ignoreInlineStyle: [] });
  assert.equal(fixesFor('https://c.com/', fixes), null);
});

test('fixCss: neutral variables, inversion rule, ${color} darkened by role', () => {
  const css = fixCss({ invert: ['.x', '.y'], css: '.a{background:${#ffffff};color:${black}}.b{color:${nope}}', ignoreInlineStyle: [] });
  assert.match(css, /--darkreader-neutral-background:rgb\(/);
  assert.match(css, /\.x,\.y\{filter:invert\(100%\)/);
  const [, bg, fg] = /\.a\{background:(rgb\([^)]*\));color:(rgb\([^)]*\))\}/.exec(css);
  assert.notEqual(bg, 'rgb(255 255 255)', 'light template turned dark');
  assert.notEqual(fg, 'rgb(0 0 0)', 'dark template turned light');
  assert.match(css, /\.b\{color:nope\}/, 'unparseable template kept verbatim');
  assert.equal(fixCss(null), '');
});

test('generated lists: parsed from third_party, real entries match', () => {
  assert.ok(DARK_SITES.length > 1000);
  assert.ok(urlInList('https://www.newgrounds.com/', DARK_SITES) || urlInList('https://x.newgrounds.com/', DARK_SITES));
  assert.ok(SITE_FIXES.length > 2000);
  assert.equal(SITE_FIXES[0].url[0], '*');
  assert.ok(fixesFor('https://www.youtube.com/', SITE_FIXES), 'a well-known site has fixes');
});
