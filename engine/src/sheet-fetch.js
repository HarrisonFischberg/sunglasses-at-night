// Sunglasses for Safari: cross-origin stylesheet re-fetch (background side, T007).
// A content script can't read the rules of a stylesheet served from another
// origin, so it asks the background script for the sheet's text. The request
// goes only to the URL the page itself already loaded the sheet from: no
// third party, no page data, no cookies (credentials: 'omit'), no referrer,
// and the HTTP cache is preferred so it usually never reaches the network.
// See docs/data-inventory.md. `fetch` is injected for tests.

import { FETCH_SHEET } from './messages.js';
export const MAX_SHEET_BYTES = 4 * 1024 * 1024;
const CACHE_LIMIT = 64;

/** Why `url` may not be fetched, or null when it may. */
export function rejectSheetUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'invalid URL';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return `scheme ${u.protocol} not allowed`;
  if (u.username || u.password) return 'credentials in URL not allowed';
  return null;
}

/** Only our own content scripts may ask: a tab sender from this extension. */
export function isTrustedSender(sender, extensionId) {
  return Boolean(sender && sender.tab && (extensionId === undefined || sender.id === extensionId));
}

/**
 * Create the fetcher. Returns `fetchSheetText(url) → Promise<{ ok, text } |
 * { ok: false, error }>`. Results are cached in memory (LRU, 64 sheets).
 */
export function createSheetFetcher({ fetch }) {
  const cache = new Map();

  async function load(url) {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'force-cache',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!type.startsWith('text/css')) return { ok: false, error: `content-type ${type || 'missing'} is not text/css` };
    const declared = Number(res.headers.get('content-length'));
    if (declared > MAX_SHEET_BYTES) return { ok: false, error: 'sheet too large' };
    const text = await res.text();
    if (text.length > MAX_SHEET_BYTES) return { ok: false, error: 'sheet too large' };
    return { ok: true, text };
  }

  return async function fetchSheetText(url) {
    const reason = rejectSheetUrl(url);
    if (reason) return { ok: false, error: reason };
    const key = new URL(url).href;
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const p = load(key).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
    cache.set(key, p);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    const result = await p;
    if (!result.ok) cache.delete(key);
    return result;
  };
}

/**
 * runtime.onMessage listener. Answers FETCH_SHEET messages from our content
 * scripts; ignores everything else (returns false).
 */
export function createSheetMessageHandler({ fetch, extensionId }) {
  const fetchSheetText = createSheetFetcher({ fetch });
  return (message, sender, sendResponse) => {
    if (message?.type !== FETCH_SHEET) return false;
    if (!isTrustedSender(sender, extensionId)) {
      sendResponse({ ok: false, error: 'untrusted sender' });
      return false;
    }
    fetchSheetText(message.url).then(sendResponse);
    return true; // async response
  };
}
