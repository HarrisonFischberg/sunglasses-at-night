import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlendOverlay, lightOrClear, OVERLAY_DECLS } from '../src/blend-fix.js';

const HTML = 'http://www.w3.org/1999/xhtml';
const el = (localName, namespaceURI = HTML) => ({ localName, namespaceURI });

test('lightOrClear: light (L >= 0.85) or near-transparent backgrounds only', () => {
  assert.equal(lightOrClear('rgb(247, 247, 247)'), true);
  assert.equal(lightOrClear('rgba(0, 0, 0, 0.03)'), true);
  assert.equal(lightOrClear('rgba(0, 0, 0, 0)'), true);
  assert.equal(lightOrClear('rgb(255, 255, 255)'), true);
  assert.equal(lightOrClear('rgb(58, 123, 213)'), false);
  assert.equal(lightOrClear('rgb(20, 20, 20)'), false);
  assert.equal(lightOrClear('rgba(0, 0, 0, 0.5)'), false);
});

test('isBlendOverlay: a light tint with a darkening blend mode', () => {
  for (const mode of ['multiply', 'darken', 'color-burn', 'luminosity']) {
    assert.equal(isBlendOverlay(el('div'), mode, 'rgb(247, 247, 247)', 'none'), true, mode);
  }
  assert.equal(isBlendOverlay(el('div'), 'multiply', 'rgba(0, 0, 0, 0.03)', 'none'), true);
});

test('isBlendOverlay: not media, not other modes, not dark tints, not picture layers', () => {
  assert.equal(isBlendOverlay(el('img'), 'multiply', 'rgba(0, 0, 0, 0)', 'none'), false);
  assert.equal(isBlendOverlay(el('video'), 'multiply', 'rgba(0, 0, 0, 0)', 'none'), false);
  assert.equal(isBlendOverlay(el('path', 'http://www.w3.org/2000/svg'), 'multiply', 'rgba(0, 0, 0, 0)', 'none'), false);
  assert.equal(isBlendOverlay(el('div'), 'normal', 'rgb(247, 247, 247)', 'none'), false);
  assert.equal(isBlendOverlay(el('div'), 'screen', 'rgb(247, 247, 247)', 'none'), false);
  assert.equal(isBlendOverlay(el('div'), 'multiply', 'rgb(30, 60, 200)', 'none'), false);
  assert.equal(isBlendOverlay(el('div'), 'multiply', 'rgb(247, 247, 247)', 'url("a.png")'), false);
  assert.equal(isBlendOverlay(el('div'), 'multiply', 'rgb(247, 247, 247)', 'linear-gradient(red, blue)'), false);
});

test('OVERLAY_DECLS: transparent background, normal blend', () => {
  assert.deepEqual(OVERLAY_DECLS, [['background-color', 'transparent'], ['mix-blend-mode', 'normal']]);
});
