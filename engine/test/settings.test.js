import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  STORAGE_KEY,
  LOOK_RANGES,
  MAX_SITES,
  defaultSettings,
  validateSettings,
  migrate,
  normalizeHostname,
  isValidTime,
  timeToMinutes,
  resolveSite,
  createSettingsStore,
  createMemoryArea,
} from '../src/settings.js';

const valid = (input) => validateSettings(input).settings;

// ---------------------------------------------------------------- defaults

test('defaults are complete, versioned and valid', () => {
  const d = defaultSettings();
  assert.equal(d.version, SCHEMA_VERSION);
  assert.equal(d.mode, 'system');
  assert.deepEqual(d.look, { brightness: 100, contrast: 100, sepia: 0, grayscale: 0 });
  assert.deepEqual(d.sites, {});
  const { settings, errors } = validateSettings(d);
  assert.deepEqual(settings, d);
  assert.deepEqual(errors, []);
});

test('defaultSettings returns a fresh object each call', () => {
  const a = defaultSettings();
  a.look.brightness = 60;
  a.sites['x.com'] = { rule: 'never' };
  assert.equal(defaultSettings().look.brightness, 100);
  assert.deepEqual(defaultSettings().sites, {});
});

// -------------------------------------------------------------- validation

test('non-object input falls back to defaults', () => {
  for (const bad of [null, 42, 'dark', [], true]) {
    const { settings, errors } = validateSettings(bad);
    assert.deepEqual(settings, defaultSettings(), JSON.stringify(bad));
    assert.equal(errors.length, 1);
  }
  assert.deepEqual(validateSettings(undefined).errors, []);
});

test('invalid enums are rejected to defaults', () => {
  const { settings, errors } = validateSettings({ mode: 'sometimes', images: 'blur', engine: 'css', detectDark: 'yes' });
  assert.equal(settings.mode, 'system');
  assert.equal(settings.images, 'leave');
  assert.equal(settings.engine, 'dynamic');
  assert.equal(settings.detectDark, true);
  assert.equal(errors.length, 4);
});

test('valid enums are kept', () => {
  const s = valid({ mode: 'schedule', images: 'no-invert', engine: 'filter', hideBackgroundImages: true, detectDark: false });
  assert.equal(s.mode, 'schedule');
  assert.equal(s.images, 'no-invert');
  assert.equal(s.engine, 'filter');
  assert.equal(s.hideBackgroundImages, true);
  assert.equal(s.detectDark, false);
});

test('look sliders are clamped to range and rounded', () => {
  const { settings, errors } = validateSettings({ look: { brightness: 400, contrast: -5, sepia: 33.6, grayscale: 100 } });
  assert.deepEqual(settings.look, { brightness: 150, contrast: 50, sepia: 34, grayscale: 100 });
  assert.equal(errors.filter((e) => e.includes('clamped')).length, 3);
});

test('look sliders with non-numbers are rejected to defaults', () => {
  const { settings, errors } = validateSettings({ look: { brightness: '120', contrast: NaN, sepia: Infinity, grayscale: null } });
  assert.deepEqual(settings.look, defaultSettings().look);
  assert.equal(errors.filter((e) => e.includes('rejected')).length, 4);
});

test('slider range bounds are inclusive', () => {
  for (const [k, r] of Object.entries(LOOK_RANGES)) {
    assert.equal(valid({ look: { [k]: r.min } }).look[k], r.min);
    assert.equal(valid({ look: { [k]: r.max } }).look[k], r.max);
  }
});

test('schedule times accept HH:MM only', () => {
  assert.deepEqual(valid({ schedule: { start: '22:30', end: '06:15' } }).schedule, { start: '22:30', end: '06:15' });
  const { settings, errors } = validateSettings({ schedule: { start: '24:00', end: '7:00' } });
  assert.deepEqual(settings.schedule, defaultSettings().schedule);
  assert.equal(errors.length, 2);
  for (const bad of ['', '12:60', '1200', 1200, '12:00:00', ' 12:00', null]) assert.equal(isValidTime(bad), false, String(bad));
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('23:59'), 1439);
  assert.equal(timeToMinutes('nope'), null);
});

test('equal schedule start and end is stored as given (T004 decides meaning)', () => {
  assert.deepEqual(valid({ schedule: { start: '08:00', end: '08:00' } }).schedule, { start: '08:00', end: '08:00' });
});

test('unknown top-level keys are dropped and reported', () => {
  const { settings, errors } = validateSettings({ mode: 'always', tracking: true, __proto__x: 1 });
  assert.equal(own(settings, 'tracking'), false);
  assert.equal(own(settings, '__proto__x'), false);
  assert.equal(errors.length, 2);
});

test('prototype pollution keys do not leak', () => {
  const evil = JSON.parse('{"__proto__": {"polluted": true}, "look": {"__proto__": {"polluted": true}}, "sites": {"__proto__": {"rule": "always"}}}');
  const s = valid(evil);
  assert.equal({}.polluted, undefined);
  assert.equal(s.polluted, undefined);
  assert.equal(s.look.polluted, undefined);
  assert.deepEqual(Object.keys(s.sites), []);
});

// --------------------------------------------------------------- hostnames

test('hostnames are normalized', () => {
  assert.equal(normalizeHostname('Example.COM'), 'example.com');
  assert.equal(normalizeHostname(' example.com. '), 'example.com');
  assert.equal(normalizeHostname('xn--bcher-kva.example'), 'xn--bcher-kva.example');
  assert.equal(normalizeHostname('localhost'), 'localhost');
  assert.equal(normalizeHostname('192.168.0.1'), '192.168.0.1');
  assert.equal(normalizeHostname('[::1]'), '[::1]');
});

test('invalid hostnames are rejected', () => {
  for (const bad of ['', 'https://example.com', 'example.com/path', 'exa mple.com', '-bad.com', 'bad-.com', 'a..b', 'a'.repeat(64) + '.com', `${'a.'.repeat(127)}aa`, 42, null, '__proto__']) {
    assert.equal(normalizeHostname(bad), null, JSON.stringify(bad));
  }
});

// ------------------------------------------------------------------- sites

test('site entries are validated, normalized and pruned', () => {
  const { settings, errors } = validateSettings({
    sites: {
      'News.Example.com': { rule: 'never' },
      'shop.example': { rule: 'always', look: { brightness: 10, sepia: 20 }, engine: 'filter', detectDark: false },
      'plain.example': { rule: 'default' },
      'bad rule.example': { rule: 'always' },
      'weird.example': { rule: 'maybe', engine: 'webgl' },
      'string.example': 'dark',
    },
  });
  assert.deepEqual(settings.sites, {
    'news.example.com': { rule: 'never' },
    'shop.example': { rule: 'always', look: { brightness: 50, sepia: 20 }, engine: 'filter', detectDark: false },
  });
  assert.ok(errors.some((e) => e.includes('bad rule.example')));
  assert.ok(errors.some((e) => e.includes('weird.example].rule')));
  assert.ok(errors.some((e) => e.includes('weird.example].engine')));
  assert.ok(errors.some((e) => e.includes('string.example')));
});

test('site entry with only a look override is kept', () => {
  assert.deepEqual(valid({ sites: { 'a.example': { look: { contrast: 120 } } } }).sites, {
    'a.example': { rule: 'default', look: { contrast: 120 } },
  });
});

test('site count is capped at MAX_SITES', () => {
  const sites = {};
  for (let i = 0; i < MAX_SITES + 5; i++) sites[`s${i}.example`] = { rule: 'never' };
  const { settings, errors } = validateSettings({ sites });
  assert.equal(Object.keys(settings.sites).length, MAX_SITES);
  assert.equal(errors.length, 5);
});

test('resolveSite merges per-site overrides over globals', () => {
  const s = valid({
    look: { brightness: 90 },
    engine: 'dynamic',
    sites: { 'a.example': { rule: 'always', look: { sepia: 40 }, engine: 'filter' } },
  });
  assert.deepEqual(resolveSite(s, 'A.example'), {
    rule: 'always',
    look: { brightness: 90, contrast: 100, sepia: 40, grayscale: 0 },
    engine: 'filter',
    detectDark: true,
    fixes: [],
  });
  assert.deepEqual(resolveSite(s, 'other.example'), { rule: 'default', look: s.look, engine: 'dynamic', detectDark: true, fixes: [] });
  assert.equal(resolveSite(s, 'not a host').rule, 'default');
});

// --------------------------------------------------------------- migration

test('missing stored value migrates to defaults without a write', () => {
  const r = migrate(undefined);
  assert.deepEqual(r.settings, defaultSettings());
  assert.equal(r.migrated, false);
});

test('v0 layout migrates to v1', () => {
  const v0 = {
    enabled: true,
    brightness: 110,
    contrast: 95,
    sepia: 10,
    images: 'dim',
    sites: { 'Dark.Example': 'dark', 'light.example': 'light', 'odd.example': 'purple' },
  };
  const { settings, migrated, fromVersion, errors } = migrate(v0);
  assert.equal(fromVersion, 0);
  assert.equal(migrated, true);
  assert.equal(settings.version, 1);
  assert.equal(settings.mode, 'system');
  assert.deepEqual(settings.look, { brightness: 110, contrast: 95, sepia: 10, grayscale: 0 });
  assert.equal(settings.images, 'dim');
  assert.deepEqual(settings.sites, { 'dark.example': { rule: 'always' }, 'light.example': { rule: 'never' } });
  assert.ok(errors.some((e) => e.includes('odd.example')));
});

test('v0 enabled:false migrates to mode off; v0 invalid values are clamped', () => {
  const { settings } = migrate({ enabled: false, brightness: 999 });
  assert.equal(settings.mode, 'off');
  assert.equal(settings.look.brightness, 150);
});

test('empty v0 object migrates to defaults', () => {
  const r = migrate({});
  assert.deepEqual(r.settings, defaultSettings());
  assert.equal(r.fromVersion, 0);
  assert.equal(r.migrated, true);
});

test('valid v1 is not marked migrated', () => {
  const r = migrate({ ...defaultSettings(), mode: 'always' });
  assert.equal(r.migrated, false);
  assert.equal(r.fromVersion, 1);
  assert.deepEqual(r.errors, []);
});

test('future or garbage versions reset to defaults', () => {
  for (const version of [2, 99, -1, 1.5, '1', null]) {
    const r = migrate({ version, mode: 'always' });
    assert.deepEqual(r.settings, defaultSettings(), String(version));
    assert.equal(r.migrated, true);
    assert.equal(r.errors.length, 1);
  }
});

test('migration is idempotent', () => {
  const once = migrate({ enabled: true, contrast: 130, sites: { 'x.example': 'light' } }).settings;
  const twice = migrate(once);
  assert.deepEqual(twice.settings, once);
  assert.equal(twice.migrated, false);
});

// ------------------------------------------------------------ round trips

test('validate round-trip: valid settings survive JSON + validation unchanged', () => {
  const s = valid({
    mode: 'schedule',
    schedule: { start: '19:45', end: '06:30' },
    look: { brightness: 80, contrast: 140, sepia: 25, grayscale: 5 },
    images: 'dim',
    hideBackgroundImages: true,
    detectDark: false,
    engine: 'filter',
    sites: { 'a.example': { rule: 'never' }, 'b.example': { rule: 'always', look: { grayscale: 100 }, detectDark: true } },
  });
  const back = validateSettings(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.settings, s);
  assert.deepEqual(back.errors, []);
});

test('validate round-trip: random inputs normalize to a fixed point', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const junk = [undefined, null, 'x', -1e9, 1e9, NaN, true, {}, [], 'always', 'filter', 'dim', 50, 150, '12:00', '25:00'];
  for (let i = 0; i < 500; i++) {
    const input = {
      mode: pick([...junk, 'system', 'off', 'schedule']),
      schedule: pick([undefined, null, { start: pick(junk), end: pick(['01:00', ...junk]) }]),
      look: { brightness: pick(junk), contrast: rnd() * 300 - 50, sepia: pick(junk), grayscale: rnd() * 200 },
      images: pick(junk),
      hideBackgroundImages: pick(junk),
      detectDark: pick(junk),
      engine: pick(junk),
      sites: { [pick(['a.example', 'B.example', 'bad host', '', 'c.example.'])]: { rule: pick([...junk, 'never']), look: { sepia: pick(junk) } } },
    };
    const once = valid(input);
    const twice = validateSettings(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(twice.settings, once, `iteration ${i}`);
    assert.deepEqual(twice.errors, [], `iteration ${i}`);
    for (const [k, r] of Object.entries(LOOK_RANGES)) {
      assert.ok(Number.isInteger(once.look[k]) && once.look[k] >= r.min && once.look[k] <= r.max);
    }
  }
});

// ---------------------------------------------------------- storage wrapper

test('store: load on empty storage returns defaults and writes nothing', async () => {
  const area = createMemoryArea();
  const store = createSettingsStore(area);
  const { settings, errors } = await store.load();
  assert.deepEqual(settings, defaultSettings());
  assert.deepEqual(errors, []);
  assert.deepEqual(area._raw(), {});
});

test('store: overlapping writes both land, even after one fails (P2)', async () => {
  const store = createSettingsStore(createMemoryArea());
  const results = await Promise.all([
    store.update({ mode: 'always' }),
    store.setSite('example.com', { rule: 'never' }),
    store.update({ look: { sepia: 20 } }),
  ]);
  const { settings } = await store.load();
  assert.equal(settings.mode, 'always');
  assert.equal(settings.sites['example.com'].rule, 'never');
  assert.equal(settings.look.sepia, 20);
  assert.equal(results[2].settings.mode, 'always');
  // A failing write must not wedge the queue.
  const failing = createSettingsStore({ ...createMemoryArea(), set: async () => { throw new Error('quota'); } });
  await assert.rejects(failing.update({ mode: 'off' }), /quota/);
  await assert.rejects(failing.update({ mode: 'off' }), /quota/);
});

test('store: save → load round-trip', async () => {
  const area = createMemoryArea();
  const store = createSettingsStore(area);
  const wanted = valid({ mode: 'always', look: { sepia: 30 }, sites: { 'a.example': { rule: 'never' } } });
  await store.save(wanted);
  assert.deepEqual(area._raw()[STORAGE_KEY], wanted);
  const { settings } = await store.load();
  assert.deepEqual(settings, wanted);
});

test('store: save clamps and rejects before writing', async () => {
  const area = createMemoryArea();
  const store = createSettingsStore(area);
  const { settings, errors } = await store.save({ mode: 'party', look: { brightness: 1000 } });
  assert.equal(settings.mode, 'system');
  assert.equal(settings.look.brightness, 150);
  assert.equal(errors.length, 2);
  assert.deepEqual(area._raw()[STORAGE_KEY], settings);
});

test('store: load migrates v0 storage and writes v1 back', async () => {
  const area = createMemoryArea({ [STORAGE_KEY]: { enabled: false, grayscale: 50, sites: { 'a.example': 'dark' } } });
  const store = createSettingsStore(area);
  const { settings } = await store.load();
  assert.equal(settings.mode, 'off');
  assert.equal(settings.look.grayscale, 50);
  assert.deepEqual(area._raw()[STORAGE_KEY], settings);
  assert.equal(area._raw()[STORAGE_KEY].version, 1);
});

test('store: load repairs corrupted storage', async () => {
  const area = createMemoryArea({ [STORAGE_KEY]: 'garbage' });
  const { settings, errors } = await createSettingsStore(area).load();
  assert.deepEqual(settings, defaultSettings());
  assert.equal(errors.length, 1);
  assert.deepEqual(area._raw()[STORAGE_KEY], defaultSettings());
});

test('store: update merges look and schedule one level deep', async () => {
  const area = createMemoryArea();
  const store = createSettingsStore(area);
  await store.update({ look: { sepia: 20 } });
  await store.update({ look: { contrast: 120 }, schedule: { start: '21:00' } });
  const { settings } = await store.load();
  assert.deepEqual(settings.look, { brightness: 100, contrast: 120, sepia: 20, grayscale: 0 });
  assert.deepEqual(settings.schedule, { start: '21:00', end: '07:00' });
});

test('store: setSite adds, normalizes, and deletes', async () => {
  const area = createMemoryArea();
  const store = createSettingsStore(area);
  await store.setSite('News.Example', { rule: 'never' });
  assert.deepEqual((await store.load()).settings.sites, { 'news.example': { rule: 'never' } });
  await store.setSite('news.example', { rule: 'default' });
  assert.deepEqual((await store.load()).settings.sites, {});
  await store.setSite('a.example', { rule: 'always' });
  await store.setSite('a.example', null);
  assert.deepEqual((await store.load()).settings.sites, {});
  const r = await store.setSite('not a host', { rule: 'always' });
  assert.equal(r.errors.length, 1);
  assert.deepEqual((await store.load()).settings.sites, {});
});

test('store: reset restores defaults', async () => {
  const area = createMemoryArea();
  const store = createSettingsStore(area);
  await store.save({ mode: 'off', sites: { 'a.example': { rule: 'never' } } });
  await store.reset();
  assert.deepEqual((await store.load()).settings, defaultSettings());
});

test('store: subscribe delivers validated settings and unsubscribes', async () => {
  const area = createMemoryArea();
  const store = createSettingsStore(area);
  const seen = [];
  const off = store.subscribe((s) => seen.push(s));
  await store.save({ mode: 'always' });
  await area.set({ other: 1 });
  await area.set({ [STORAGE_KEY]: { version: 1, mode: 'bogus' } });
  off();
  await store.save({ mode: 'off' });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].mode, 'always');
  assert.equal(seen[1].mode, 'system');
});

test('store: subscribe is a no-op without onChanged', () => {
  const store = createSettingsStore({ get: async () => ({}), set: async () => {} });
  const off = store.subscribe(() => {});
  assert.equal(typeof off, 'function');
  off();
});

test('store: custom key', async () => {
  const area = createMemoryArea();
  await createSettingsStore(area, { key: 'alt' }).save({ mode: 'off' });
  assert.deepEqual(Object.keys(area._raw()), ['alt']);
});

function own(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}
