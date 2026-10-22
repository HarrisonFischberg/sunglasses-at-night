// T013 fixtures have the shape prd.md asks for, and the perf entry and the
// fixture page scripts compile. The timings themselves need WebKit
// (`npm run perf`, e2e/perf.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { route, sheet, GRID, NODES } from '../../e2e/perf/fixtures.js';
import { bundle } from '../scripts/bundle.js';

const URLS = { SITE: 'http://127.0.0.1:1', CDN: 'http://127.0.0.1:2' };
const get = (path) => {
  const [pathname, query = ''] = path.split('?');
  return route(pathname, new URLSearchParams(query), URLS);
};
const count = (s, re) => (s.match(re) ?? []).length;
const scripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test('perf fixture: 5,000-element page with its sheets and a mutation batch', () => {
  const html = get('/perf/nodes.html').body;
  assert.equal(NODES.sections * NODES.perSection, 5000);
  assert.equal(count(html, /<section/g), NODES.sections);
  // Every element tag inside <main>: 20 per section.
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.equal(count(main, /<(?!\/)[a-z][a-z0-9]*/g) - 1, 5000);
  for (const src of scripts(html)) assert.doesNotThrow(() => new Function(src));
  assert.match(html, /__batch/);
});

test('perf fixture: product grid has 60 cards, srcset images, badges, carousels, 15+ sheets, ~5,000 rules', () => {
  const html = get('/perf/grid.html').body;
  assert.equal(count(html, /class="card"/g), 60);
  assert.equal(count(html, /data-srcset="/g), 60);
  assert.ok(count(html, /class="sponsored"/g) >= 10);
  assert.ok(count(html, /class="badge/g) >= 10);
  assert.ok(count(html, /class="star/g) >= 300);
  assert.ok(count(html, /class="price"/g) === 60);
  assert.equal(count(html, /class="carousel"/g), GRID.carousels);
  assert.ok(count(html, /class="inner"/g) >= GRID.carousels * GRID.slides, 'carousels are nested');
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  assert.equal(links.length + 1, 17, '16 linked sheets + 1 inline');
  assert.equal(links.filter((l) => l.startsWith(URLS.CDN)).length, GRID.cdnSheets);
  let rules = 0, colors = 0;
  for (const l of links) {
    const css = get(new URL(l, URLS.SITE).pathname).body;
    rules += css.split('\n').length;
    colors += count(css, /#[0-9a-f]{6}\b/g);
  }
  assert.ok(rules >= 4900 && rules <= 5100, `${rules} rules`);
  assert.ok(colors > 5000, `${colors} color values`);
  for (const src of scripts(html)) assert.doesNotThrow(() => new Function(src));
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /__storm/);
});

test('perf fixture: deterministic sheets and art', () => {
  assert.equal(sheet(7, 50), sheet(7, 50));
  assert.notEqual(sheet(7, 50), sheet(8, 50));
  assert.match(get('/perf/art.svg?i=3&w=400').body, /^<svg [^>]*width="400"/);
  assert.equal(get('/perf/nope.css'), null);
});

test('perf entry bundles to a classic script that compiles', () => {
  const src = bundle(fileURLToPath(new URL('../../e2e/perf/entry.js', import.meta.url)));
  assert.doesNotThrow(() => new Function(src));
  assert.match(src, /monitor/);
});
