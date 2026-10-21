// Sunglasses at Night: third-party site lists (already-dark sites and
// per-site fixes) and the URL patterns they are keyed by.
//
// The lists, the config parser and the URL pattern matcher are adapted from
// Dark Reader (MIT, Copyright (c) Dark Reader Ltd.), src/generators/utils/
// parse.ts and src/utils/url.ts at commit fda0590. See third_party/darkreader/.
//
// Config format: blocks separated by a line of `=`; each block is a list of
// URL patterns, then commands (an upper-case line) each followed by its value:
//   INVERT               selectors drawn inverted (filter)
//   CSS                  extra CSS; `${color}` is a color to darken by role
//   IGNORE INLINE STYLE  selectors whose inline styles are left alone
// Unknown commands are kept out. The `*` block applies to every site.

import { parseColor, formatRgb, relativeLuminance } from './color.js';
import { transformColor, quantize } from './transform.js';

const COMMANDS = {
  'INVERT': 'invert',
  'CSS': 'css',
  'IGNORE INLINE STYLE': 'ignoreInlineStyle',
};
const COMMAND_RE = /^[A-Z]+(\s[A-Z]+){0,2}$/;
const DELIMITER_RE = /^\s*={2,}\s*$/m;

// One entry per non-empty line, comments (`#`) and blank lines dropped.
export function parseList(text) {
  return String(text ?? '').replace(/\r/g, '').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/** Parse a fixes config into [{ url: [...], invert?, css?, ignoreInlineStyle? }]. */
export function parseFixes(text) {
  const fixes = [];
  for (const block of String(text ?? '').replace(/\r/g, '').split(DELIMITER_RE)) {
    const lines = block.split('\n');
    const at = [];
    lines.forEach((l, i) => { if (COMMAND_RE.test(l)) at.push(i); });
    if (!at.length) continue;
    const fix = { url: parseList(lines.slice(0, at[0]).join('\n')) };
    at.forEach((start, i) => {
      const prop = COMMANDS[lines[start].trim()];
      if (!prop) return;
      const value = lines.slice(start + 1, i === at.length - 1 ? lines.length : at[i + 1]).join('\n');
      fix[prop] = prop === 'css' ? value.trim() : parseList(value);
    });
    if (fix.url.length) fixes.push(fix);
  }
  return fixes;
}

function prepareUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const pathParts = u.pathname.split('/').slice(1);
  if (!pathParts.at(-1)) pathParts.pop();
  return { hostParts: u.hostname.split('.').reverse(), pathParts, port: u.port, protocol: u.protocol };
}

const patternCache = new Map();
function preparePattern(pattern) {
  let p = patternCache.get(pattern);
  if (p !== undefined) return p;
  let rest = pattern;
  const exactStart = rest.startsWith('^'), exactEnd = rest.endsWith('$');
  if (exactStart) rest = rest.slice(1);
  if (exactEnd) rest = rest.slice(0, -1);
  let protocol = '';
  const pi = rest.indexOf('://');
  if (pi > 0) { protocol = rest.slice(0, pi + 1); rest = rest.slice(pi + 3); }
  const slash = rest.indexOf('/');
  const host = slash < 0 ? rest : rest.slice(0, slash);
  let hostName = host, port = '*';
  const colon = host.lastIndexOf(':');
  if (colon >= 0 && !host.startsWith('[')) { hostName = host.slice(0, colon); port = host.slice(colon + 1); }
  const pathParts = slash < 0 ? [] : rest.slice(slash + 1).split('/');
  if (pathParts.length && !pathParts.at(-1)) pathParts.pop();
  p = { hostParts: hostName.split('.').reverse(), pathParts, port, protocol, exactStart, exactEnd };
  patternCache.set(pattern, p);
  return p;
}

/**
 * Does `url` match `pattern`? `example.com` matches the site and its www
 * host; `*.example.com` any subdomain; `google.*` any top-level domain;
 * `host/path` a path prefix (`*` per segment); `^`/`$` anchor the host /
 * path length; `/regex/` is a regular expression on the whole URL.
 */
export function matchUrl(url, pattern) {
  if (pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/')) {
    try { return new RegExp(pattern.slice(1, -1)).test(url); } catch { return false; }
  }
  const u = prepareUrl(url), p = preparePattern(pattern);
  if (!u || !p) return false;
  if (p.hostParts.length > u.hostParts.length) return false;
  if (p.exactStart && p.hostParts.length !== u.hostParts.length) return false;
  if (p.exactEnd && p.pathParts.length !== u.pathParts.length) return false;
  if (p.port !== '*' && p.port !== u.port) return false;
  if (p.protocol && p.protocol !== u.protocol) return false;
  for (let i = 0; i < p.hostParts.length; i++) {
    if (p.hostParts[i] !== '*' && p.hostParts[i] !== u.hostParts[i]) return false;
  }
  if (p.hostParts.length >= 2 && p.hostParts.at(-1) !== '*' && (
    p.hostParts.length < u.hostParts.length - 1 ||
    (p.hostParts.length === u.hostParts.length - 1 && u.hostParts.at(-1) !== 'www'))) return false;
  if (p.pathParts.length > u.pathParts.length) return false;
  for (let i = 0; i < p.pathParts.length; i++) {
    if (p.pathParts[i] !== '*' && p.pathParts[i] !== u.pathParts[i]) return false;
  }
  return true;
}

export function urlInList(url, patterns) {
  for (const p of patterns ?? []) if (matchUrl(url, p)) return true;
  return false;
}

/**
 * The fixes for `url`, merged: the `*` block first, then every site block
 * that matches, in file order. Returns null when nothing site-specific
 * matches (the `*` block alone is not worth a sheet).
 */
export function fixesFor(url, fixes) {
  const matched = fixes.filter((f) => f.url[0] !== '*' && f.url.some((p) => matchUrl(url, p)));
  if (!matched.length) return null;
  const common = fixes.find((f) => f.url[0] === '*');
  const merged = { invert: [], css: '', ignoreInlineStyle: [] };
  for (const f of common ? [common, ...matched] : matched) {
    if (f.invert) merged.invert.push(...f.invert);
    if (f.css) merged.css += (merged.css ? '\n' : '') + f.css;
    if (f.ignoreInlineStyle) merged.ignoreInlineStyle.push(...f.ignoreInlineStyle);
  }
  return merged;
}

/**
 * CSS for a merged fix under `look`. Fix CSS reads four variables
 * (--darkreader-neutral-background/-text, --darkreader-selection-*), so
 * they're defined on the root; `${color}` becomes the color darkened as a
 * background when light, as text when dark.
 */
export function fixCss(fix, look) {
  if (!fix) return '';
  const bg = formatRgb(quantize(transformColor('#ffffff', 'bg', look)));
  const fg = formatRgb(quantize(transformColor('#000000', 'fg', look)));
  let css = `:root{--darkreader-neutral-background:${bg};--darkreader-neutral-text:${fg};` +
    '--darkreader-selection-background:initial;--darkreader-selection-text:initial}';
  if (fix.invert?.length) {
    css += `${fix.invert.join(',')}{filter:invert(100%) hue-rotate(180deg) contrast(90%)!important}`;
  }
  if (fix.css) {
    css += fix.css.replace(/\$\{(.+?)\}/g, (all, value) => {
      const c = parseColor(value.trim());
      if (!c) return value;
      const role = relativeLuminance(c) > 0.18 ? 'bg' : 'fg';
      return formatRgb(quantize(transformColor(c, role, look)));
    });
  }
  return css;
}
