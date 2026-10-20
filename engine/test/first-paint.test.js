// First-paint registration plan (QA 2026-10-19: white first frame when dark
// mode is on regardless of a light system appearance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { firstPaintPlan, minutesToNextChange, hostPatterns, FIRST_PAINT_CSS, FIRST_PAINT_ID } from '../src/first-paint.js';
import { defaultSettings } from '../src/settings.js';
import { createBackground } from '../src/background-core.js';

const s = (over) => ({ ...defaultSettings(), ...over });
const at = (h, m) => new Date(2026, 9, 19, h, m);

test('firstPaintPlan: always → every site except "never" sites; off → nothing', () => {
  assert.deepEqual(firstPaintPlan(s({ mode: 'always' })), { matches: ['<all_urls>'], excludeMatches: [] });
  const p = firstPaintPlan(s({ mode: 'always', sites: { 'example.com': { rule: 'never' } } }));
  assert.deepEqual(p.excludeMatches, hostPatterns('example.com'));
  assert.equal(firstPaintPlan(s({ mode: 'off', sites: { 'a.com': { rule: 'always' } } })), null);
});

test('firstPaintPlan: system mode registers nothing (base.css covers dark systems) unless a site is "always dark"', () => {
  assert.equal(firstPaintPlan(s({ mode: 'system' })), null);
  assert.deepEqual(firstPaintPlan(s({ mode: 'system', sites: { 'a.com': { rule: 'always' } } })), { matches: hostPatterns('a.com'), excludeMatches: [] });
});

test('firstPaintPlan: schedule follows the window, crossing midnight', () => {
  const sch = s({ mode: 'schedule', schedule: { start: '20:00', end: '07:00' } });
  assert.deepEqual(firstPaintPlan(sch, at(23, 0)).matches, ['<all_urls>']);
  assert.equal(firstPaintPlan(sch, at(12, 0)), null);
  assert.equal(minutesToNextChange(sch, at(19, 30)), 30);
  assert.equal(minutesToNextChange(sch, at(6, 0)), 60);
  assert.equal(minutesToNextChange(s({ mode: 'always' }), at(6, 0)), null);
});

test('base-on.css is base.css without the media gate, still gated on data-sunglasses-off', () => {
  const css = readFileSync(fileURLToPath(new URL(`../../Extension/Resources/${FIRST_PAINT_CSS}`, import.meta.url)), 'utf8');
  assert.ok(!/@media/.test(css));
  assert.ok(/:root:not\(\[data-sunglasses-off\]\)\{color-scheme:dark!important;background-color:rgb\(20 20 20\)/.test(css));
  assert.ok(!/pointer-events|position|z-index|display|filter/.test(css));
});

function fakeApi(initial) {
  const data = { ...initial }; const listeners = { storage: [], message: [], updated: [] };
  const regs = new Map(); const calls = [];
  return {
    calls, regs,
    runtime: { id: 'ext', onMessage: { addListener: (f) => listeners.message.push(f) } },
    storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: data[k] } : { ...data }), set: async (o) => { Object.assign(data, o); for (const f of listeners.storage) f(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { newValue: v }])), 'local'); }, remove: async (k) => { delete data[k]; } },
      onChanged: { addListener: (f) => listeners.storage.push(f) } },
    tabs: { query: async () => [], sendMessage: async () => {}, onRemoved: { addListener() {} }, onUpdated: { addListener: (f) => listeners.updated.push(f) } },
    scripting: {
      getRegisteredContentScripts: async ({ ids }) => ids.filter((i) => regs.has(i)).map((i) => regs.get(i)),
      registerContentScripts: async (list) => { for (const r of list) { calls.push(['register', r]); regs.set(r.id, r); } },
      unregisterContentScripts: async ({ ids }) => { for (const i of ids) { calls.push(['unregister', i]); regs.delete(i); } },
    },
  };
}

test('background registers base-on.css for "always" and removes it when turned off', async () => {
  const api = fakeApi({ settings: s({ mode: 'always' }) });
  const bg = createBackground({ api, fetch: async () => ({}) });
  await bg.ready;
  const r = api.regs.get(FIRST_PAINT_ID);
  assert.ok(r, 'registered');
  assert.deepEqual(r.css, [FIRST_PAINT_CSS]);
  assert.equal(r.runAt, 'document_start');
  assert.equal(r.allFrames, true);
  await bg.store.update({ mode: 'off' });
  await bg.syncFirstPaint();
  assert.equal(api.regs.has(FIRST_PAINT_ID), false);
  await bg.store.update({ mode: 'system' });
  await bg.syncFirstPaint();
  assert.equal(api.regs.has(FIRST_PAINT_ID), false);
});

test('background without scripting (older Safari) keeps working', async () => {
  const api = fakeApi({ settings: s({ mode: 'always' }) });
  delete api.scripting;
  const bg = createBackground({ api, fetch: async () => ({}) });
  await bg.ready;
  assert.equal(await bg.syncFirstPaint(), null);
});
