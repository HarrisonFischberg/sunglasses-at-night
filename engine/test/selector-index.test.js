import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredTokens, createSelectorIndex } from '../src/selector-index.js';

test('requiredTokens: classes, ids and tags at the top level of each compound', () => {
  assert.deepEqual(requiredTokens('.a'), [['.a']]);
  assert.deepEqual(requiredTokens('div.card > .Title #Main'), [['<div', '.card', '.title', '#main']]);
  assert.deepEqual(requiredTokens('a:hover, button.add::before'), [['<a'], ['<button', '.add']]);
  assert.deepEqual(requiredTokens('ul li + li ~ li'), [['<ul', '<li', '<li', '<li']]);
});

test('requiredTokens: nothing inside parentheses or attribute selectors is required', () => {
  assert.deepEqual(requiredTokens('.a:not(.b)'), [['.a']]);
  assert.deepEqual(requiredTokens(':is(.a, .b) .c'), [['.c']]);
  assert.deepEqual(requiredTokens('[data-x=".nope"] .c:nth-child(2n+1)'), [['.c']]);
  assert.deepEqual(requiredTokens('input[type="checkbox"]:checked'), [['<input']]);
  assert.deepEqual(requiredTokens(':root'), [[]]);
  assert.deepEqual(requiredTokens('*'), [[]]);
});

test('requiredTokens: selectors it cannot reason about are null', () => {
  for (const s of ['.a\\:b', '& .x', 'svg|a', '.a)', '(', '.']) assert.equal(requiredTokens(s), null, s);
  assert.equal(requiredTokens(42), null);
});

test('a selector is dead until every part needs only tokens the page has', () => {
  const revived = [];
  const index = createSelectorIndex(() => revived.push(1));
  assert.equal(index.isDead('.card .badge'), true);
  assert.equal(index.isDead(':root'), false, 'no required token: never dead');
  assert.equal(index.isDead('.x:not(.y)'), true);
  index.add('.card');
  assert.equal(index.isDead('.card .badge'), true, 'still missing .badge');
  assert.equal(revived.length, 0);
  index.add('.badge');
  assert.equal(revived.length, 1, 'revive reported once');
  assert.equal(index.isDead('.card .badge'), false);
  assert.equal(index.isDead('.x:not(.y)'), true, 'unrelated selector stays dead');
});

test('a selector list is dead only when every part is dead', () => {
  const index = createSelectorIndex();
  index.add('.here');
  assert.equal(index.isDead('.gone, .also-gone'), true);
  assert.equal(index.isDead('.gone, .here'), false);
  assert.equal(index.isDead('.gone, :root'), false);
});

test('addElement indexes tag, id and each class, lower-cased', () => {
  const index = createSelectorIndex();
  const el = { localName: 'DIV', getAttribute: (n) => ({ id: 'Main', class: ' Card  Hot ' })[n] ?? null };
  index.addElement(el);
  for (const t of ['<div', '#main', '.card', '.hot']) assert.ok(index.has(t), t);
  assert.equal(index.isDead('div#main.card.hot'), false);
  assert.equal(index.isDead('span.card'), true);
});

test('unparseable selectors are never dead', () => {
  const index = createSelectorIndex();
  assert.equal(index.isDead('& .x'), false);
  assert.equal(index.isDead('.a\\:b'), false);
});
