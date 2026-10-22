// Sunglasses at Night: your own fixes. A fix is one element on one site
// that you picked with "Fix something on this page" (picker.js) and the
// one-tap repair you chose for it. Stored per site in settings
// (`sites[host].fixes`), applied by content.js after the built-in site
// fixes (site-fixes.js userFixCss). This file is validation only: no DOM,
// no imports, so the settings model can use it everywhere.

// What each fix does to the picked element. The CSS is in site-fixes.js.
export const FIX_ACTIONS = Object.freeze(['lighter', 'darker', 'flip', 'hide', 'original']);

export const FIX_LABELS = Object.freeze({
  lighter: 'Lighter text',
  darker: 'Darker background',
  flip: 'Flip colors',
  hide: 'Hide',
  original: 'Remove dark mode',
});

export const MAX_FIXES_PER_SITE = 50;
export const MAX_SELECTOR_LENGTH = 400;
export const MAX_FIX_LABEL_LENGTH = 60;

/**
 * Is `selector` safe to put in front of a `{…}` block? It is stored, then
 * written into a style sheet, so anything that could close the rule or start
 * another one (braces, `;`, `<`, comments, at-rules, escapes) or load
 * something (`url(`) is refused. Only ` > ` combinators, no lists (`,`): a
 * fix names one element. The browser still has the last word: a selector it
 * can't parse only drops its own rule.
 */
export function isSafeSelector(selector) {
  if (typeof selector !== 'string') return false;
  const s = selector.trim();
  if (!s || s.length > MAX_SELECTOR_LENGTH) return false;
  if (/[{};,<>@\\]|\/\*|\*\/|url\(|[\u0000-\u001f\u007f]/i.test(s.replace(/\s>\s/g, ' '))) return false;
  return true;
}

/** Shorten a label to one line of at most MAX_FIX_LABEL_LENGTH characters. */
export function tidyLabel(text) {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim();
  return one.length > MAX_FIX_LABEL_LENGTH ? `${one.slice(0, MAX_FIX_LABEL_LENGTH - 1).trimEnd()}…` : one;
}

/**
 * Validate a stored list of fixes. Returns a clean array (possibly empty);
 * problems go to `errors` as "path: reason". The last fix for a selector
 * wins, so picking the same element again replaces its fix.
 */
export function normalizeFixes(v, path, errors) {
  if (!Array.isArray(v)) {
    errors.push(`${path}: rejected non-array`);
    return [];
  }
  const bySelector = new Map();
  v.forEach((fix, i) => {
    const at = `${path}[${i}]`;
    if (fix === null || typeof fix !== 'object' || Array.isArray(fix)) {
      errors.push(`${at}: rejected non-object`);
      return;
    }
    if (!isSafeSelector(fix.selector)) {
      errors.push(`${at}.selector: rejected ${JSON.stringify(fix.selector)}`);
      return;
    }
    if (!FIX_ACTIONS.includes(fix.action)) {
      errors.push(`${at}.action: rejected ${JSON.stringify(fix.action)}`);
      return;
    }
    const selector = fix.selector.trim();
    const out = { selector, action: fix.action };
    const label = tidyLabel(fix.label);
    if (label) out.label = label;
    bySelector.delete(selector);
    bySelector.set(selector, out);
  });
  let fixes = [...bySelector.values()];
  if (fixes.length > MAX_FIXES_PER_SITE) {
    errors.push(`${path}: over ${MAX_FIXES_PER_SITE} fixes, the oldest dropped`);
    fixes = fixes.slice(-MAX_FIXES_PER_SITE);
  }
  return fixes;
}
