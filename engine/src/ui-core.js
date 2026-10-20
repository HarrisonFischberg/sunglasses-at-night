// Sunglasses at Night: view logic shared by the toolbar popup (S05) and the
// options page (S06). Pure functions: no
// DOM, no network, no extension API. popup.js / options.js do the wiring.

import { normalizeHostname, LOOK_RANGES } from './settings.js';
import { PRESETS } from './transform.js';
import { OFF_TEXT } from './messages.js';

export const MODE_LABELS = Object.freeze({
  system: 'Match system appearance',
  always: 'Always',
  schedule: 'On a schedule',
  off: 'Off',
});

export const RULE_LABELS = Object.freeze({
  default: 'Default',
  always: 'Always dark',
  never: 'Never dark',
});

export const LOOK_LABELS = Object.freeze({
  brightness: 'Brightness',
  contrast: 'Contrast',
  sepia: 'Sepia',
  grayscale: 'Grayscale',
});

export const PRESET_LABELS = Object.freeze({
  standard: 'Standard',
  soft: 'Soft',
  warm: 'Warm',
  mono: 'Mono',
});

export const IMAGE_LABELS = Object.freeze({
  leave: 'Leave as they are',
  dim: 'Dim',
  'no-invert': 'Never invert',
});

export const ENGINE_LABELS = Object.freeze({
  dynamic: 'Dynamic (rewrites page colors)',
  filter: 'Filter (for pages the dynamic engine breaks)',
});

/**
 * The hostname the extension can act on for a tab URL, or null for pages it
 * can't run on: browser and extension pages, about:, file:, data:, blank tabs.
 */
export function pageHost(url) {
  if (typeof url !== 'string' || url === '') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return normalizeHostname(parsed.hostname);
}

/**
 * The host the popup acts on. Safari hides `tab.url` without a per-site grant,
 * so fall back through the sources in order: the active tab's URL, the host the
 * page's own content script reported, the last-focused window's tab URL.
 * Returns null (restricted) only when every source is empty or unusable.
 */
export function resolveHost({ url, reportHost, focusedUrl }) {
  if (typeof url === 'string' && url !== '') return pageHost(url);
  if (typeof reportHost === 'string' && reportHost !== '') return normalizeHostname(reportHost);
  return pageHost(focusedUrl);
}

/** A site's stored entry, or the inherit-everything entry. */
export function siteEntry(settings, host) {
  return (host && settings.sites[host]) || { rule: 'default' };
}

// Entry edits. Each returns a new entry, or null when nothing is left to
// store (settings.setSite(host, null) deletes it).
function tidy(entry) {
  const out = { rule: entry.rule ?? 'default' };
  if (entry.look && Object.keys(entry.look).length) out.look = entry.look;
  if (entry.engine !== undefined) out.engine = entry.engine;
  if (entry.detectDark !== undefined) out.detectDark = entry.detectDark;
  return out.rule === 'default' && Object.keys(out).length === 1 ? null : out;
}

export function withRule(entry, rule) {
  return tidy({ ...entry, rule });
}

/** `look` null removes the per-site look; otherwise it replaces it. */
export function withLook(entry, look) {
  const { look: _old, ...rest } = entry;
  return tidy(look ? { ...rest, look: { ...look } } : rest);
}

/** `value` undefined goes back to the global already-dark setting. */
export function withDetectDark(entry, value) {
  const { detectDark: _old, ...rest } = entry;
  return tidy(value === undefined ? rest : { ...rest, detectDark: value });
}

/** `engine` 'default' (or undefined) goes back to the global engine. */
export function withEngine(entry, engine) {
  const { engine: _old, ...rest } = entry;
  return tidy(engine === undefined || engine === 'default' ? rest : { ...rest, engine });
}

/** Name of the preset `look` matches exactly, or 'custom'. */
export function matchPreset(look) {
  for (const [name, p] of Object.entries(PRESETS)) {
    if (Object.keys(LOOK_RANGES).every((k) => look[k] === p[k])) return name;
  }
  return 'custom';
}

export function presetLook(name) {
  return PRESETS[name] ? { ...PRESETS[name] } : null;
}

/**
 * Everything the popup renders, from settings, the active tab's URL and the
 * background's last report for that tab. `focusedUrl` is the last-focused
 * window's tab URL, the final fallback when neither of the others names a host.
 */
export function popupView({ settings, url, report, focusedUrl }) {
  const host = resolveHost({ url, reportHost: report?.host, focusedUrl });
  if (!host) {
    return {
      restricted: true,
      host: null,
      mode: settings.mode,
      customLook: false,
      look: { ...settings.look },
      preset: matchPreset(settings.look),
      status: 'Sunglasses at Night can’t change this page. Browser pages, blank tabs and local files are left as they are.',
    };
  }
  const entry = siteEntry(settings, host);
  const customLook = !!entry.look;
  const look = { ...settings.look, ...entry.look };
  return {
    restricted: false,
    host,
    mode: settings.mode,
    rule: entry.rule,
    customLook,
    look,
    preset: matchPreset(look),
    alreadyDark: report?.on === false && report.reason === 'already-dark',
    forcedDark: entry.detectDark === false,
    engine: entry.engine ?? 'default',
    status: statusText(report),
  };
}

function statusText(report) {
  if (!report) return 'Not running on this page yet. Reload the page, or allow Sunglasses at Night on this website in Safari.';
  if (report.on) return 'Dark mode is on for this page.';
  const why = OFF_TEXT[report.reason];
  return why ? `Dark mode is off: ${why}.` : 'Dark mode is off.';
}

/** Rows for the options page's Sites list, sorted by hostname. */
export function siteRows(settings) {
  return Object.keys(settings.sites).sort().map((host) => {
    const e = settings.sites[host];
    const details = [RULE_LABELS[e.rule]];
    if (e.look) details.push('custom look');
    if (e.engine) details.push(`${e.engine} engine`);
    if (e.detectDark === false) details.push('darken even if already dark');
    if (e.detectDark === true) details.push('skip if already dark');
    return { host, summary: details.join(', ') };
  });
}

/** Hint for the schedule fields, or '' when the schedule is fine. */
export function scheduleHint(schedule) {
  if (schedule.start === schedule.end) return 'Start and end are the same, so the schedule never turns dark mode on.';
  if (schedule.start > schedule.end) return `Runs overnight, from ${schedule.start} until ${schedule.end} the next morning.`;
  return '';
}
