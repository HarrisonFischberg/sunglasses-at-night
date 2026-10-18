import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveHost, popupView } from '../src/ui-core.js';
import { createBackground } from '../src/background-core.js';
import { createMemoryArea, defaultSettings } from '../src/settings.js';
import { GET_TAB_STATE, TAB_STATE } from '../src/messages.js';

const settings = defaultSettings();

// ------------------------------------------------------------- resolveHost

test('resolveHost: tab.url wins over the report and the focused tab', () => {
  assert.equal(resolveHost({ url: 'https://a.test/x', reportHost: 'b.test', focusedUrl: 'https://c.test/' }), 'a.test');
});

test('resolveHost: no tab.url uses the host the page reported', () => {
  assert.equal(resolveHost({ url: undefined, reportHost: 'B.test', focusedUrl: 'https://c.test/' }), 'b.test');
  assert.equal(resolveHost({ url: '', reportHost: 'b.test' }), 'b.test');
});

test('resolveHost: no tab.url and no report host uses the last-focused window tab', () => {
  assert.equal(resolveHost({ url: undefined, reportHost: undefined, focusedUrl: 'https://c.test/p' }), 'c.test');
  assert.equal(resolveHost({ url: undefined, reportHost: '', focusedUrl: 'https://c.test/p' }), 'c.test');
});

test('resolveHost: restricted only when every source is empty', () => {
  assert.equal(resolveHost({}), null);
  assert.equal(resolveHost({ url: undefined, reportHost: undefined, focusedUrl: undefined }), null);
  assert.equal(resolveHost({ focusedUrl: 'about:blank' }), null);
});

test('resolveHost: a restricted tab.url is not overridden by a stale report host', () => {
  assert.equal(resolveHost({ url: 'about:blank', reportHost: 'b.test' }), null);
});

// ---------------------------------------------------------------- popupView

test('popupView: all four sources reach the popup', () => {
  const byUrl = popupView({ settings, url: 'https://a.test/', report: { on: true, reason: 'x', host: 'b.test' } });
  const byReport = popupView({ settings, url: undefined, report: { on: true, reason: 'x', host: 'b.test' } });
  const byFocus = popupView({ settings, url: undefined, report: null, focusedUrl: 'https://c.test/' });
  const none = popupView({ settings, url: undefined, report: null });
  assert.deepEqual([byUrl.host, byReport.host, byFocus.host], ['a.test', 'b.test', 'c.test']);
  assert.deepEqual([byUrl.restricted, byReport.restricted, byFocus.restricted, none.restricted], [false, false, false, true]);
  assert.equal(byReport.status, 'Dark mode is on for this page.');
});

// ------------------------------------------------------- background storage

function fakeApi() {
  const ls = () => { const s = new Set(); return { addListener: (f) => s.add(f), removeListener: (f) => s.delete(f), fire: (...a) => [...s].map((f) => f(...a)) }; };
  const local = createMemoryArea({});
  const onChanged = ls();
  local.onChanged.addListener((c, a) => onChanged.fire(c, a));
  return {
    runtime: { id: 'ext', onMessage: ls() },
    storage: { local, onChanged },
    tabs: { query: async () => [], sendMessage: async () => {}, onRemoved: ls(), onUpdated: ls() },
    action: { setTitle: async () => {}, setBadgeText: async () => {} },
    commands: { onCommand: ls() },
  };
}

test('background: TAB_STATE stores the host per tab and GET_TAB_STATE returns it', () => {
  const api = fakeApi();
  const bg = createBackground({ api, fetch: async () => { throw new Error('no network'); } });
  api.runtime.onMessage.fire({ type: TAB_STATE, on: true, reason: 'mode-always', host: 'example.com' }, { id: 'ext', tab: { id: 7 }, frameId: 0 }, () => {});
  api.runtime.onMessage.fire({ type: TAB_STATE, on: false, reason: 'site-never' }, { id: 'ext', tab: { id: 8 }, frameId: 0 }, () => {});
  assert.deepEqual(bg.tabStates.get(7), { on: true, reason: 'mode-always', host: 'example.com' });
  assert.equal('host' in bg.tabStates.get(8), false);
  let reply;
  api.runtime.onMessage.fire({ type: GET_TAB_STATE, tabId: 7 }, { id: 'ext' }, (r) => { reply = r; });
  assert.equal(reply.host, 'example.com');
});

test('manifest: permissions are unchanged (storage, nativeMessaging; no tabs/activeTab)', () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../Extension/Resources/manifest.json', import.meta.url)), 'utf8'));
  assert.deepEqual(manifest.permissions, ['storage', 'nativeMessaging']);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
});
