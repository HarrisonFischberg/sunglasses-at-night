import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SHEET_BYTES, rejectSheetUrl, isTrustedSender, createSheetFetcher, createSheetMessageHandler,
} from '../src/sheet-fetch.js';
import { FETCH_SHEET } from '../src/messages.js';

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses[url];
    if (!r) throw new Error('network down');
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: { get: (k) => ({ 'content-type': r.type ?? 'text/css', 'content-length': r.length ?? null })[k.toLowerCase()] ?? null },
      text: async () => r.body ?? '',
      url: r.url,
    };
  };
  fn.calls = calls;
  return fn;
}

test('rejectSheetUrl: only http(s) without credentials', () => {
  assert.equal(rejectSheetUrl('https://cdn.example/a.css'), null);
  assert.equal(rejectSheetUrl('http://127.0.0.1:8080/a.css', 'http://127.0.0.1:8081/'), null);
  assert.match(rejectSheetUrl('file:///etc/passwd'), /scheme/);
  assert.match(rejectSheetUrl('data:text/css,a{}'), /scheme/);
  assert.match(rejectSheetUrl('javascript:alert(1)'), /scheme/);
  assert.match(rejectSheetUrl('https://u:p@cdn.example/a.css'), /credentials/);
  assert.match(rejectSheetUrl('not a url'), /invalid/);
});

test('rejectSheetUrl: a public page may not reach the local network', () => {
  for (const sheet of ['http://127.0.0.1/a.css', 'http://localhost:3000/a.css', 'http://192.168.1.1/a.css',
    'http://10.0.0.2/a.css', 'http://172.20.0.1/a.css', 'http://router.local/a.css', 'http://[::1]/a.css']) {
    assert.match(rejectSheetUrl(sheet, 'https://evil.example/'), /local network/, sheet);
    assert.match(rejectSheetUrl(sheet), /local network/, sheet);
    assert.equal(rejectSheetUrl(sheet, 'http://192.168.1.5/'), null, sheet);
  }
  assert.equal(rejectSheetUrl('http://172.32.0.1/a.css', 'https://evil.example/'), null);
});

test('isTrustedSender: needs a tab and our extension id', () => {
  assert.equal(isTrustedSender({ tab: { id: 1 }, id: 'ext' }, 'ext'), true);
  assert.equal(isTrustedSender({ id: 'ext' }, 'ext'), false);
  assert.equal(isTrustedSender({ tab: { id: 1 }, id: 'other' }, 'ext'), false);
  assert.equal(isTrustedSender(undefined, 'ext'), false);
});

test('fetcher: omits credentials and referrer, prefers the cache, returns text', async () => {
  const fetch = fakeFetch({ 'https://cdn.example/a.css': { body: 'a{color:red}' } });
  const get = createSheetFetcher({ fetch });
  assert.deepEqual(await get('https://cdn.example/a.css'), { ok: true, text: 'a{color:red}' });
  const init = fetch.calls[0].init;
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.cache, 'force-cache');
  assert.equal(init.method, 'GET');
  assert.equal(init.body, undefined);
});

test('fetcher: caches successes, retries failures', async () => {
  const fetch = fakeFetch({ 'https://cdn.example/a.css': { body: 'a{}' } });
  const get = createSheetFetcher({ fetch });
  await get('https://cdn.example/a.css');
  await get('https://cdn.example/a.css');
  assert.equal(fetch.calls.length, 1);
  assert.equal((await get('https://cdn.example/missing.css')).ok, false);
  assert.equal((await get('https://cdn.example/missing.css')).ok, false);
  assert.equal(fetch.calls.length, 3);
});

test('fetcher: rejects non-CSS, HTTP errors and oversized sheets without throwing', async () => {
  const fetch = fakeFetch({
    'https://x.example/page.html': { type: 'text/html', body: '<p>' },
    'https://x.example/404.css': { status: 404 },
    'https://x.example/big.css': { length: String(MAX_SHEET_BYTES + 1) },
    'https://x.example/big2.css': { body: 'a'.repeat(MAX_SHEET_BYTES + 1) },
  });
  const get = createSheetFetcher({ fetch });
  assert.match((await get('https://x.example/page.html')).error, /not text\/css/);
  assert.match((await get('https://x.example/404.css')).error, /HTTP 404/);
  assert.match((await get('https://x.example/big.css')).error, /too large/);
  assert.match((await get('https://x.example/big2.css')).error, /too large/);
  assert.match((await get('https://x.example/down.css')).error, /network down/);
  assert.match((await get('ftp://x.example/a.css')).error, /scheme/);
  assert.equal(fetch.calls.some((c) => c.url.startsWith('ftp:')), false);
});

test('fetcher: a public sheet that redirects to the local network is refused for public pages', async () => {
  const fetch = fakeFetch({ 'https://cdn.example/r.css': { body: 'a{}', url: 'http://192.168.1.1/admin.css' } });
  const get = createSheetFetcher({ fetch });
  assert.match((await get('https://cdn.example/r.css', 'https://evil.example/')).error, /local network/);
  assert.equal((await get('https://cdn.example/r.css', 'http://192.168.1.5/')).ok, true);
  // The answer cached for the local page is still refused for a public one.
  assert.match((await get('https://cdn.example/r.css', 'https://evil.example/')).error, /local network/);
});

test('message handler: answers only FETCH_SHEET from our content scripts', async () => {
  const fetch = fakeFetch({ 'https://cdn.example/a.css': { body: 'a{}' } });
  const handler = createSheetMessageHandler({ fetch, extensionId: 'ext' });
  assert.equal(handler({ type: 'other' }, { tab: {}, id: 'ext' }, () => {}), false);
  let reply;
  assert.equal(handler({ type: FETCH_SHEET, url: 'https://cdn.example/a.css' }, { id: 'ext' }, (r) => (reply = r)), false);
  assert.deepEqual(reply, { ok: false, error: 'untrusted sender' });
  const done = new Promise((resolve) => {
    assert.equal(handler({ type: FETCH_SHEET, url: 'https://cdn.example/a.css' }, { tab: { id: 3 }, id: 'ext' }, resolve), true);
  });
  assert.deepEqual(await done, { ok: true, text: 'a{}' });
  assert.equal(fetch.calls.length, 1);
});
