import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, isActive, isInSchedule, inWindow, localMinutes } from '../src/activation.js';
import { MODES, SITE_RULES, defaultSettings, validateSettings } from '../src/settings.js';

const HOST = 'example.com';
const UTC = 'UTC';
const IN_WINDOW = new Date('2026-10-17T22:00:00Z'); // 22:00 UTC, inside 20:00–07:00
const OUT_WINDOW = new Date('2026-10-17T12:00:00Z'); // 12:00 UTC, outside

function settingsWith({ mode = 'system', rule = 'default', schedule } = {}) {
  const input = { ...defaultSettings(), mode };
  if (schedule) input.schedule = schedule;
  if (rule !== 'default') input.sites = { [HOST]: { rule } };
  const { settings, errors } = validateSettings(input);
  assert.deepEqual(errors, []);
  return settings;
}

const at = (iso) => new Date(iso);

// ------------------------------------------------------------ truth table

// Expected `on` for each (mode, rule), indexed by
// [systemDark=false & out of window, false & in, true & out, true & in].
const TABLE = {
  off: { default: [0, 0, 0, 0], always: [0, 0, 0, 0], never: [0, 0, 0, 0] },
  always: { default: [1, 1, 1, 1], always: [1, 1, 1, 1], never: [0, 0, 0, 0] },
  system: { default: [0, 0, 1, 1], always: [1, 1, 1, 1], never: [0, 0, 0, 0] },
  schedule: { default: [0, 1, 0, 1], always: [1, 1, 1, 1], never: [0, 0, 0, 0] },
};

test('truth table covers every mode × site rule', () => {
  assert.deepEqual(Object.keys(TABLE).sort(), [...MODES].sort());
  for (const mode of MODES) assert.deepEqual(Object.keys(TABLE[mode]).sort(), [...SITE_RULES].sort());
});

for (const mode of MODES) {
  for (const rule of SITE_RULES) {
    test(`truth table: mode=${mode} rule=${rule}`, () => {
      const settings = settingsWith({ mode, rule });
      const combos = [
        [false, OUT_WINDOW],
        [false, IN_WINDOW],
        [true, OUT_WINDOW],
        [true, IN_WINDOW],
      ];
      combos.forEach(([systemDark, now], i) => {
        const got = isActive({ settings, hostname: HOST, systemDark, now, timeZone: UTC });
        assert.equal(got, TABLE[mode][rule][i] === 1, `systemDark=${systemDark} now=${now.toISOString()}`);
      });
    });
  }
}

test('reasons name the deciding input', () => {
  const r = (opts, extra = {}) =>
    decide({ settings: settingsWith(opts), hostname: HOST, timeZone: UTC, now: OUT_WINDOW, ...extra }).reason;
  assert.equal(r({ mode: 'off', rule: 'always' }), 'mode-off');
  assert.equal(r({ mode: 'always', rule: 'never' }), 'site-never');
  assert.equal(r({ mode: 'schedule', rule: 'always' }), 'site-always');
  assert.equal(r({ mode: 'always' }), 'mode-always');
  assert.equal(r({ mode: 'system' }, { systemDark: true }), 'system-dark');
  assert.equal(r({ mode: 'system' }), 'system-light');
  assert.equal(r({ mode: 'schedule' }, { now: IN_WINDOW }), 'schedule-in');
  assert.equal(r({ mode: 'schedule' }), 'schedule-out');
});

test('per-site rule matches by normalized hostname and only that host', () => {
  const settings = settingsWith({ mode: 'always', rule: 'never' });
  assert.equal(isActive({ settings, hostname: 'EXAMPLE.com.', timeZone: UTC }), false);
  assert.equal(isActive({ settings, hostname: 'www.example.com', timeZone: UTC }), true);
  assert.equal(isActive({ settings, hostname: 'not a host', timeZone: UTC }), true);
  assert.equal(isActive({ settings, hostname: undefined, timeZone: UTC }), true);
});

test('system mode treats a non-boolean scheme as light', () => {
  const settings = settingsWith({ mode: 'system' });
  for (const systemDark of [undefined, null, 1, 'dark']) {
    assert.equal(isActive({ settings, hostname: HOST, systemDark }), false, String(systemDark));
  }
});

// ------------------------------------------------------ schedule: midnight

test('schedule crossing midnight: boundaries are start-inclusive, end-exclusive', () => {
  const s = { start: '20:00', end: '07:00' };
  const cases = [
    ['2026-10-17T19:59:00Z', false],
    ['2026-10-17T20:00:00Z', true],
    ['2026-10-17T23:59:00Z', true],
    ['2026-10-18T00:00:00Z', true],
    ['2026-10-18T06:59:00Z', true],
    ['2026-10-18T07:00:00Z', false],
    ['2026-10-18T12:00:00Z', false],
  ];
  for (const [iso, want] of cases) assert.equal(isInSchedule(s, at(iso), UTC), want, iso);
});

test('schedule within one day (start < end)', () => {
  const s = { start: '09:30', end: '17:00' };
  assert.equal(isInSchedule(s, at('2026-10-17T09:29:00Z'), UTC), false);
  assert.equal(isInSchedule(s, at('2026-10-17T09:30:00Z'), UTC), true);
  assert.equal(isInSchedule(s, at('2026-10-17T16:59:00Z'), UTC), true);
  assert.equal(isInSchedule(s, at('2026-10-17T17:00:00Z'), UTC), false);
  assert.equal(isInSchedule(s, at('2026-10-17T23:00:00Z'), UTC), false);
});

test('schedule ending at 00:00 and starting at 00:00', () => {
  assert.equal(isInSchedule({ start: '22:00', end: '00:00' }, at('2026-10-17T23:59:00Z'), UTC), true);
  assert.equal(isInSchedule({ start: '22:00', end: '00:00' }, at('2026-10-18T00:00:00Z'), UTC), false);
  assert.equal(isInSchedule({ start: '00:00', end: '06:00' }, at('2026-10-18T00:00:00Z'), UTC), true);
  assert.equal(isInSchedule({ start: '00:00', end: '06:00' }, at('2026-10-17T23:59:00Z'), UTC), false);
});

// ------------------------------------------------------ schedule: start == end

test('equal start and end is an empty window at every minute of the day', () => {
  for (const t of ['00:00', '08:00', '23:59']) {
    const tMin = Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    for (let m = 0; m < 1440; m++) assert.equal(inWindow(m, tMin, tMin), false, `${t} at minute ${m}`);
  }
  const settings = settingsWith({ mode: 'schedule', schedule: { start: '08:00', end: '08:00' } });
  assert.equal(isActive({ settings, hostname: HOST, now: at('2026-10-17T08:00:00Z'), timeZone: UTC }), false);
  assert.equal(isActive({ settings, hostname: HOST, now: at('2026-10-17T20:00:00Z'), timeZone: UTC }), false);
});

test('equal start and end still lets a per-site "always" rule turn a page on', () => {
  const settings = settingsWith({ mode: 'schedule', rule: 'always', schedule: { start: '08:00', end: '08:00' } });
  assert.equal(isActive({ settings, hostname: HOST, now: at('2026-10-17T08:00:00Z'), timeZone: UTC }), true);
});

// ------------------------------------------------------------- schedule: DST

// America/New_York, 2026-03-08: 02:00 EST jumps to 03:00 EDT at 07:00Z.
test('DST spring forward: a skipped start time takes effect at the first minute after it', () => {
  const tz = 'America/New_York';
  const s = { start: '02:30', end: '06:00' };
  assert.equal(localMinutes(at('2026-03-08T06:59:00Z'), tz), 1 * 60 + 59);
  assert.equal(localMinutes(at('2026-03-08T07:00:00Z'), tz), 3 * 60);
  assert.equal(isInSchedule(s, at('2026-03-08T06:59:00Z'), tz), false); // 01:59 EST
  assert.equal(isInSchedule(s, at('2026-03-08T07:00:00Z'), tz), true); // 03:00 EDT
  assert.equal(isInSchedule(s, at('2026-03-08T09:59:00Z'), tz), true); // 05:59 EDT
  assert.equal(isInSchedule(s, at('2026-03-08T10:00:00Z'), tz), false); // 06:00 EDT
});

test('DST spring forward: overnight schedule ends at the same wall-clock time', () => {
  const tz = 'America/New_York';
  const s = { start: '20:00', end: '07:00' };
  assert.equal(isInSchedule(s, at('2026-03-08T01:00:00Z'), tz), true); // 20:00 EST on the 7th
  assert.equal(isInSchedule(s, at('2026-03-08T10:59:00Z'), tz), true); // 06:59 EDT
  assert.equal(isInSchedule(s, at('2026-03-08T11:00:00Z'), tz), false); // 07:00 EDT
});

// America/New_York, 2026-11-01: 02:00 EDT falls back to 01:00 EST at 06:00Z.
test('DST fall back: the repeated hour is evaluated by wall-clock both times', () => {
  const tz = 'America/New_York';
  const s = { start: '22:00', end: '01:30' };
  assert.equal(localMinutes(at('2026-11-01T05:15:00Z'), tz), 75); // 01:15 EDT
  assert.equal(localMinutes(at('2026-11-01T06:15:00Z'), tz), 75); // 01:15 EST
  assert.equal(isInSchedule(s, at('2026-11-01T05:15:00Z'), tz), true);
  assert.equal(isInSchedule(s, at('2026-11-01T05:30:00Z'), tz), false); // 01:30 EDT
  assert.equal(isInSchedule(s, at('2026-11-01T06:15:00Z'), tz), true); // 01:15 EST again
  assert.equal(isInSchedule(s, at('2026-11-01T06:30:00Z'), tz), false); // 01:30 EST
});

// Europe/London, 2026-03-29: 01:00 GMT jumps to 02:00 BST at 01:00Z.
test('DST spring forward in Europe/London', () => {
  const tz = 'Europe/London';
  const s = { start: '01:15', end: '02:30' };
  assert.equal(isInSchedule(s, at('2026-03-29T00:59:00Z'), tz), false); // 00:59 GMT
  assert.equal(isInSchedule(s, at('2026-03-29T01:00:00Z'), tz), true); // 02:00 BST
  assert.equal(isInSchedule(s, at('2026-03-29T01:30:00Z'), tz), false); // 02:30 BST
});

// --------------------------------------------------------- local minutes

test('localMinutes without a time zone uses the runtime local clock', () => {
  const d = at('2026-10-17T15:42:00Z');
  assert.equal(localMinutes(d), d.getHours() * 60 + d.getMinutes());
});

test('localMinutes reports midnight as 0, not 24:00', () => {
  assert.equal(localMinutes(at('2026-10-17T00:00:00Z'), UTC), 0);
  assert.equal(localMinutes(at('2026-10-17T23:59:00Z'), UTC), 1439);
});

test('invalid clock or schedule input is out of window, never a throw', () => {
  assert.equal(localMinutes(new Date('nope'), UTC), null);
  assert.equal(localMinutes('2026-10-17', UTC), null);
  assert.equal(isInSchedule({ start: '20:00', end: '07:00' }, new Date('nope'), UTC), false);
  assert.equal(isInSchedule({ start: '25:00', end: '07:00' }, IN_WINDOW, UTC), false);
  assert.equal(isInSchedule(undefined, IN_WINDOW, UTC), false);
});
