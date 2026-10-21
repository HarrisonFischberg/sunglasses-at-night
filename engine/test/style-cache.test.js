import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, readCached, writeCached, adoptCss } from '../src/style-cache.js';

function memoryStorage({ quota = Infinity, throws = false } = {}) {
  const m = new Map();
  const size = () => [...m.values()].reduce((n, v) => n + v.length, 0);
  return {
    m,
    getItem: (k) => { if (throws) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (throws) throw new Error('blocked'); if (size() + String(v).length > quota) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('cacheKey: path and query, not hash; look in the key; bad URLs give null', () => {
  assert.equal(cacheKey('https://a.com/x?y=1#z', 'L'), cacheKey('https://a.com/x?y=1', 'L'));
  assert.notEqual(cacheKey('https://a.com/x', 'L'), cacheKey('https://a.com/x', 'M'));
  assert.notEqual(cacheKey('https://a.com/x', 'L'), cacheKey('https://a.com/x?q', 'L'));
  assert.equal(cacheKey('nope', 'L'), null);
});

test('writeCached / readCached: round trip, keeps the newest 6 entries', () => {
  const s = memoryStorage();
  for (let i = 0; i < 8; i++) assert.ok(writeCached(s, cacheKey(`https://a.com/${i}`, 'L'), `css${i}`));
  assert.equal(readCached(s, cacheKey('https://a.com/7', 'L')), 'css7');
  assert.equal(readCached(s, cacheKey('https://a.com/0', 'L')), null, 'oldest dropped');
  assert.equal(readCached(s, cacheKey('https://a.com/1', 'L')), null);
  assert.equal(readCached(s, cacheKey('https://a.com/2', 'L')), 'css2');
});

test('writeCached: oversized CSS, quota errors and blocked storage are harmless', () => {
  const k = cacheKey('https://a.com/', 'L');
  assert.equal(writeCached(memoryStorage(), k, 'x'.repeat(1_500_001)), false);
  assert.equal(writeCached(memoryStorage({ quota: 10 }), k, 'x'.repeat(100)), false);
  assert.equal(writeCached(memoryStorage({ throws: true }), k, 'a{}'), false);
  assert.equal(readCached(memoryStorage({ throws: true }), k), null);
  assert.equal(readCached(null, k), null);
});

test('adoptCss: adds one sheet and removes exactly it; null without constructable sheets', () => {
  class Sheet { replaceSync(t) { this.text = t; } }
  const page = new Sheet();
  const document = { adoptedStyleSheets: [page] };
  const remove = adoptCss(document, { CSSStyleSheet: Sheet }, 'a{color:red}');
  assert.equal(document.adoptedStyleSheets.length, 2);
  assert.equal(document.adoptedStyleSheets[1].text, 'a{color:red}');
  remove();
  assert.deepEqual(document.adoptedStyleSheets, [page]);
  assert.equal(adoptCss({ adoptedStyleSheets: [] }, {}, 'a{}'), null);
});
