// The per-host index in generated/site-fixes-data.js must pick the same fixes
// as matching against the full list, for a URL built from every pattern.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixesFor } from '../src/site-fixes.js';
import { siteFixesFor } from '../src/generated/site-fixes-data.js';

const src = readFileSync(new URL('../src/generated/site-fixes-data.js', import.meta.url), 'utf8');
const text = JSON.parse(/const TEXT = (".*");/.exec(src)[1]);
const ends = JSON.parse(/const END = (\[.*\]);/.exec(src)[1]);
const all = ends.map((e, n) => JSON.parse(text.slice(ends[n - 1] ?? 0, e)));

function urlsFor(pattern) {
  if (pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/')) return [];
  const rest = pattern.replace(/^\^/, '').replace(/\$$/, '').replace(/^[a-z]+:\/\//i, '');
  const [host, ...path] = rest.split('/');
  const h = host.replace(/\*/g, 'x');
  const p = '/' + path.map((s) => s.replace(/\*/g, 'x')).join('/');
  return [`https://${h}${p}`, `https://www.${h}${p}`, `https://sub.${h}${p}`, `http://${h}${p}`];
}

test('indexed lookup equals full-list lookup', () => {
  const urls = new Set(['https://example.org/', 'https://www.google.com/search']);
  for (const f of all) for (const p of f.url) for (const u of urlsFor(p)) urls.add(u);
  let hits = 0;
  for (const u of urls) {
    let want; try { want = fixesFor(u, all); } catch { continue; }
    if (want) hits++;
    assert.deepEqual(fixesFor(u, siteFixesFor(u)), want, u);
  }
  assert.ok(urls.size > 2000 && hits > 1000);
});
