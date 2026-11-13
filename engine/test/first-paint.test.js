// First-paint registration plan (QA 2026-10-19: white first frame when dark
// mode is on regardless of a light system appearance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { firstPaintPlan, msToNextChange, hostPatterns, FIRST_PAINT_CSS, FIRST_PAINT_ID } from '../src/first-paint.js';
import { defaultSettings } from '../src/settings.js';
import { createBackground } from '../src/background-core.js';

const s = (over) => ({ ...defaultSettings(), ...over });
const at = (h, m) => new Date(2026, 9, 19, h, m);

test('hostPatterns: the exact host only, like resolveSite', () => {
  assert.deepEqual(hostPatterns('example.com'), ['*://example.com/*']);
  assert.deepEqual(hostPatterns('[::1]'), ['*://[::1]/*']);
});

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
  assert.equal(msToNextChange(sch, at(19, 30)), 30 * 60000);
  assert.equal(msToNextChange(sch, at(6, 0)), 60 * 60000);
  assert.equal(msToNextChange(s({ mode: 'always' }), at(6, 0)), null);
});

test('msToNextChange counts real time on a spring-forward night (B4)', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'America/Denver'; // clocks jump 02:00 → 03:00 on 2026-03-08
  try {
    const sch = s({ mode: 'schedule', schedule: { start: '20:00', end: '07:00' } });
    // 01:00 → 07:00 local is 5 real hours, not 6.
    assert.equal(msToNextChange(sch, new Date(2026, 2, 8, 1, 0)), 5 * 3600000);
    // The evening before, nothing odd: 20:00 is 4 hours away.
    assert.equal(msToNextChange(sch, new Date(2026, 2, 7, 16, 0)), 4 * 3600000);
    // From 12:00 on the spring-forward day the next change (20:00) is 8 hours.
    assert.equal(msToNextChange(sch, new Date(2026, 2, 8, 12, 0)), 8 * 3600000);
  } finally {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  }
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
