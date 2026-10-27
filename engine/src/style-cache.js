// Sunglasses at Night: per-tab cache of a page's finished dark styles.
// Rewriting a page's sheets takes a moment after Safari starts the content
// script; until then the interim rule shows a flat dark page. On a reload or
// a back/forward visit in the same tab, the override CSS the engine produced
// last time is applied at once (as an adopted sheet, which cascades after
// every page sheet, as the override does), so the page appears in its final
// dark colors immediately. The engine's own sheet replaces it when ready.
//
// Stored in the page origin's sessionStorage: it lives only as long as the
// tab, holds nothing but CSS derived from the page's own sheets and our
// colors, and is capped. Any storage error (private mode, quota, a page that
// blocks it) just means no cache.

const PREFIX = 'sunglasses-at-night:css:';
const INDEX = 'sunglasses-at-night:css-index';
// The site shares this storage (about 5 MB per origin in WebKit), so we keep
// to at most about 0.6 million characters of it.
const MAX_ENTRIES = 3;
const MAX_CSS = 200_000; // characters per entry

// Same page = same origin storage + path + query (no hash); the look is part
// of the key, so changing it never shows stale colors.
export function cacheKey(url, lookKey) {
  let u;
  try { u = new URL(url); } catch { return null; }
  return `${PREFIX}${lookKey}|${u.pathname}${u.search}`;
}

export function readCached(storage, key) {
  if (!storage || !key) return null;
  try { return storage.getItem(key); } catch { return null; }
}

/** Store `css` under `key`, keeping at most MAX_ENTRIES per origin (oldest out). */
export function writeCached(storage, key, css) {
  if (!storage || !key || !css || css.length > MAX_CSS) return false;
  try {
    let index = [];
    try { index = JSON.parse(storage.getItem(INDEX) ?? '[]'); } catch { index = []; }
    if (!Array.isArray(index)) index = [];
    index = index.filter((k) => k !== key && typeof k === 'string' && k.startsWith(PREFIX));
    index.push(key);
    while (index.length > MAX_ENTRIES) storage.removeItem(index.shift());
    storage.setItem(key, css);
    storage.setItem(INDEX, JSON.stringify(index));
    return true;
  } catch {
    return false; // quota or blocked storage
  }
}

/**
 * Adopt `css` on `document` as a constructable sheet. Returns remove(), or
 * null when the browser can't (then the caller simply doesn't use the cache).
 */
export function adoptCss(document, win, css) {
  const Sheet = win?.CSSStyleSheet;
  if (typeof Sheet !== 'function' || !Array.isArray(document.adoptedStyleSheets)) return null;
  let sheet;
  try { sheet = new Sheet(); sheet.replaceSync(css); } catch { return null; }
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  return () => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
  };
}
