// Sunglasses at Night: cross-origin stylesheet re-fetch (background side, T007).
// A content script can't read the rules of a stylesheet served from another
// origin, so it asks the background script for the sheet's text. The request
// goes only to the URL the page itself already loaded the sheet from: no
// third party, no page data, no cookies (credentials: 'omit'), no referrer,
// and the HTTP cache is preferred so it usually never reaches the network.
// See docs/data-inventory.md. `fetch` is injected for tests.

import { FETCH_SHEET } from './messages.js';
export const MAX_SHEET_BYTES = 4 * 1024 * 1024;
const CACHE_LIMIT = 64;

const LOCAL_HOST_RE = /^(?:localhost|.+\.localhost|.+\.local|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[(?:::1?|f[cd][0-9a-f]*:.*|fe80:.*)\])$/i;

/** Loopback, private or link-local host: this device or the local network. */
export function isLocalUrl(url) {
  try { return LOCAL_HOST_RE.test(new URL(url).hostname); } catch { return false; }
}

/**
 * Why `url` may not be fetched, or null when it may. A page on the public web
 * may not have us read sheets on the local network (the rewritten rules land
 * in the page, where it could read them); `pageUrl` is the asking frame's URL.
 */
export function rejectSheetUrl(url, pageUrl) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'invalid URL';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return `scheme ${u.protocol} not allowed`;
  if (u.username || u.password) return 'credentials in URL not allowed';
  if (isLocalUrl(u.href) && !isLocalUrl(pageUrl)) return 'local network sheet from a public page';
  return null;
}

/** Only our own content scripts may ask: a tab sender from this extension. */
export function isTrustedSender(sender, extensionId) {
  return Boolean(sender && sender.tab && (extensionId === undefined || sender.id === extensionId));
}

/**
 * Create the fetcher. Returns `fetchSheetText(url, pageUrl) → Promise<{ ok, text } |
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
    // A public URL can redirect to the local network: note where it ended up.
    return isLocalUrl(res.url) ? { ok: true, text, local: true } : { ok: true, text };
  }

  return async function fetchSheetText(url, pageUrl) {
    const reason = rejectSheetUrl(url, pageUrl);
    if (reason) return { ok: false, error: reason };
    const key = new URL(url).href;
    let p = cache.get(key);
    if (p) {
      cache.delete(key);
      cache.set(key, p);
    } else {
      p = load(key).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
      cache.set(key, p);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    }
    const result = await p;
    if (!result.ok && cache.get(key) === p) cache.delete(key);
    // Checked for every asker: the cached answer may have come from a local page.
    if (result.local && !isLocalUrl(pageUrl)) return { ok: false, error: 'local network sheet from a public page' };
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
    fetchSheetText(message.url, sender.url ?? sender.tab.url).then(sendResponse);
    return true; // async response
  };
}
