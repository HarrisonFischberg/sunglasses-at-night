// Sunglasses at Night: activation decision.
// Global mode × per-site rule × system color scheme × schedule → on/off.
// Pure: the caller passes the clock, the time zone and the system scheme,
// so the same code runs in background.js, early.js and node:test.
//
// Precedence, highest first:
//   1. mode 'off'           → off. Off is the master switch (and what the Mac
//                              shortcut toggles), so no site rule overrides it.
//   2. site rule 'never'    → off.
//   3. site rule 'always'   → on, whatever the system scheme or schedule says.
//   4. mode 'always'        → on.
//   5. mode 'system'        → on iff the system scheme is dark.
//   6. mode 'schedule'      → on iff the local wall-clock time is in the window.
//
// Schedule window: start inclusive, end exclusive, in local wall-clock
// minutes. start > end crosses midnight. start === end is an empty window
// (never on); "all day" is mode 'always'. Wall-clock comparison means DST
// needs no special case: on a spring-forward day a skipped start (02:30)
// takes effect at the first minute after it (03:00); on a fall-back day a
// repeated hour is evaluated by its wall-clock reading both times.

import { resolveSite, timeToMinutes } from './settings.js';

const MINUTES_PER_DAY = 24 * 60;

// Local wall-clock minutes since midnight for `date`. With `timeZone`
// (an IANA name) the result doesn't depend on the host's zone; without it
// the runtime's local zone is used.
export function localMinutes(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (timeZone === undefined) return date.getHours() * 60 + date.getMinutes();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return (get('hour') % 24) * 60 + get('minute');
}

// Whether minute-of-day `m` falls in [start, end).
export function inWindow(m, startMin, endMin) {
  if (startMin === endMin) return false;
  if (startMin < endMin) return m >= startMin && m < endMin;
  return m >= startMin || m < endMin;
}

export function isInSchedule(schedule, now, timeZone) {
  const start = timeToMinutes(schedule?.start);
  const end = timeToMinutes(schedule?.end);
  const m = localMinutes(now, timeZone);
  if (start === null || end === null || m === null) return false;
  return inWindow(m % MINUTES_PER_DAY, start, end);
}

// `settings` must already be validated (see settings.js). `systemDark` is
// the result of matchMedia('(prefers-color-scheme: dark)'); anything other
// than `true` counts as light. Returns { on, reason } so the popup can say
// why a page is or isn't dark.
export function decide({ settings, hostname, systemDark = false, now = new Date(), timeZone } = {}) {
  if (settings.mode === 'off') return { on: false, reason: 'mode-off' };
  const { rule } = resolveSite(settings, hostname);
  if (rule === 'never') return { on: false, reason: 'site-never' };
  if (rule === 'always') return { on: true, reason: 'site-always' };
  switch (settings.mode) {
    case 'always':
      return { on: true, reason: 'mode-always' };
    case 'system':
      return systemDark === true
        ? { on: true, reason: 'system-dark' }
        : { on: false, reason: 'system-light' };
    case 'schedule':
      return isInSchedule(settings.schedule, now, timeZone)
        ? { on: true, reason: 'schedule-in' }
        : { on: false, reason: 'schedule-out' };
    default:
      return { on: false, reason: 'mode-unknown' };
  }
}

export function isActive(args) {
  return decide(args).on;
}
