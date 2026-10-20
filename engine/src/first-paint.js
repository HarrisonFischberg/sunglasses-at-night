// Sunglasses for Safari: dark first paint when dark mode doesn't depend on
// the system appearance (QA 2026-10-19, white first frame).
//
// The manifest's content/base.css paints the page dark before its first
// frame, but only under (prefers-color-scheme: dark): it can't know the
// settings. With "Always", a schedule that is on, or a site set to "Always
// dark" while the system is light, nothing dark is in place until the
// content script's async settings read lands, and Safari can paint the
// page's own white for a frame or two (seen on every fixture in the iOS
// Simulator, and on amazon.com in a new tab on the Mac).
//
// So the background registers the same anti-flash CSS, without the media
// gate, as a document_start content script (scripting.registerContentScripts)
// whenever the settings say "on regardless of the system": for every site
// (minus "never" sites) or only for the "Always dark" sites. Like base.css it
// is gated on :root:not([data-sunglasses-off]), so it steps aside the moment
// the content script has the real decision (off, never, already dark).
// Pure planning here; background-core.js applies the plan.

import { isInSchedule } from './activation.js';

export const FIRST_PAINT_ID = 'sunglasses-first-paint';
export const FIRST_PAINT_CSS = 'content/base-on.css';

// Match patterns for a normalized hostname and its subdomains (resolveSite
// treats a rule for example.com as covering www.example.com).
export function hostPatterns(host) {
  return [`*://${host}/*`, `*://*.${host}/*`];
}

/**
 * What to register for `settings` at time `now`: null (nothing), or
 * { matches, excludeMatches }. `timeZone` as in activation.js.
 */
export function firstPaintPlan(settings, now = new Date(), timeZone) {
  if (!settings || settings.mode === 'off') return null;
  const sites = Object.entries(settings.sites ?? {});
  const never = sites.filter(([, s]) => s.rule === 'never').map(([h]) => h);
  const always = sites.filter(([, s]) => s.rule === 'always').map(([h]) => h);
  const allOn = settings.mode === 'always' || (settings.mode === 'schedule' && isInSchedule(settings.schedule, now, timeZone));
  if (allOn) return { matches: ['<all_urls>'], excludeMatches: never.flatMap(hostPatterns) };
  if (always.length) return { matches: always.flatMap(hostPatterns), excludeMatches: [] };
  return null;
}

/** Minutes until the schedule next changes state (for re-planning), or null. */
export function minutesToNextChange(settings, now = new Date()) {
  if (settings?.mode !== 'schedule') return null;
  const [sh, sm] = String(settings.schedule?.start ?? '').split(':').map(Number);
  const [eh, em] = String(settings.schedule?.end ?? '').split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return null;
  const m = now.getHours() * 60 + now.getMinutes();
  const until = (t) => ((t - m + 1440) % 1440) || 1440;
  return Math.min(until(sh * 60 + sm), until(eh * 60 + em));
}

export function samePlan(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
