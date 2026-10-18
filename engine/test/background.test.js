import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createBackground, toggleMode, toolbarState, TOGGLE_COMMAND, RESTORE_KEY,
} from '../src/background-core.js';
import { createMemoryArea, createSettingsStore, defaultSettings, STORAGE_KEY } from '../src/settings.js';
import { SETTINGS_CHANGED, TAB_STATE, FETCH_SHEET } from '../src/messages.js';

const event = () => {
  const ls = new Set();
  return { addListener: (f) => ls.add(f), removeListener: (f) => ls.delete(f), fire: (...a) => [...ls].map((f) => f(...a)), ls };
};

// A stand-in for the WebExtension API. Each open tab delivers
// tabs.sendMessage to its own listener, asynchronously like the real thing.
function fakeApi({ tabs = 3, initial = {} } = {}) {
  const local = createMemoryArea(initial);
  // browser.storage.onChanged: fed by the local area, and fireable for other areas.
  const onChanged = event();
  local.onChanged.addListener((changes, area) => onChanged.fire(changes, area));
  const received = new Map();
  const tabList = Array.from({ length: tabs }, (_, i) => ({ id: i + 1 }));
  const titles = new Map(), badges = new Map();
  const api = {
    runtime: { id: 'ext', onMessage: event() },
    storage: { local, onChanged },
    tabs: {
      query: async () => tabList.map((t) => ({ ...t })),
      sendMessage: (tabId, msg) => new Promise((resolve, reject) => setTimeout(() => {
        if (tabId === 99) return reject(new Error('no receiver'));
        const log = received.get(tabId) ?? [];
        log.push({ msg, at: performance.now() });
        received.set(tabId, log);
        resolve();
      }, 0)),
      onRemoved: event(),
      onUpdated: event(),
    },
    action: {
      setTitle: async ({ tabId, title }) => { titles.set(tabId, title); },
      setBadgeText: async ({ tabId, text }) => { badges.set(tabId, text); },
    },
    commands: { onCommand: event() },
  };
  return { api, local, received, tabList, titles, badges };
}

const noFetch = async () => { throw new Error('no network in tests'); };
const settle = () => new Promise((r) => setTimeout(r, 5));
const waitFor = async (cond, ms = 1000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 1));
  }
};

// ------------------------------------------------------------- toggleMode

test('toggleMode: any on mode turns off and remembers it', () => {
  for (const mode of ['system', 'always', 'schedule']) {
    assert.deepEqual(toggleMode(mode, undefined), { mode: 'off', restore: mode });
  }
});

test('toggleMode: off restores the remembered mode', () => {
  assert.deepEqual(toggleMode('off', 'schedule'), { mode: 'schedule', restore: null });
  assert.deepEqual(toggleMode('off', 'system'), { mode: 'system', restore: null });
});

test('toggleMode: off with nothing (or junk) remembered goes to always', () => {
  for (const r of [undefined, null, 'off', 'bogus', 7]) {
    assert.deepEqual(toggleMode('off', r), { mode: 'always', restore: null });
  }
});

// ------------------------------------------------------------ toolbarState

test('toolbarState: on, off with reason, unknown reason, and unavailable', () => {
  assert.deepEqual(toolbarState({ on: true, reason: 'mode-always' }),
    { state: 'on', title: 'Sunglasses at Night: on', badge: '' });
  assert.deepEqual(toolbarState({ on: false, reason: 'already-dark' }),
    { state: 'off', title: 'Sunglasses at Night: off, page is already dark', badge: 'off' });
  assert.equal(toolbarState({ on: false, reason: 'site-never' }).title, 'Sunglasses at Night: off, never dark on this site');
  assert.equal(toolbarState({ on: false, reason: '<script>' }).title, 'Sunglasses at Night: off');
  assert.equal(toolbarState(undefined).state, 'unavailable');
  assert.equal(toolbarState(undefined).badge, '');
});

// --------------------------------------------------------------- broadcast

test('broadcast: a settings write reaches every open tab in < 200 ms', async () => {
  const { api, local, received, tabList } = fakeApi({ tabs: 50 });
  createBackground({ api, fetch: noFetch });
  const store = createSettingsStore(local);
  const t0 = performance.now();
  await store.update({ mode: 'always' });
  await waitFor(() => tabList.every((t) => received.get(t.id)?.length));
  const worst = Math.max(...tabList.map((t) => received.get(t.id)[0].at - t0));
  assert.ok(worst < 200, `slowest tab got the change after ${worst.toFixed(2)} ms`);
  for (const t of tabList) {
    const { msg } = received.get(t.id)[0];
    assert.equal(msg.type, SETTINGS_CHANGED);
    assert.equal(msg.settings.mode, 'always');
  }
});

test('broadcast: sends validated settings, not the raw stored value', async () => {
  const { api, local, received } = fakeApi({ tabs: 1 });
  createBackground({ api, fetch: noFetch });
  await local.set({ [STORAGE_KEY]: { version: 1, mode: 'sideways', look: { brightness: 999 } } });
  await waitFor(() => received.get(1)?.length);
  const { settings } = received.get(1)[0].msg;
  assert.equal(settings.mode, 'system');
  assert.equal(settings.look.brightness, 150);
});

test('broadcast: ignores other keys and other storage areas', async () => {
  const { api, local, received } = fakeApi({ tabs: 1 });
  createBackground({ api, fetch: noFetch });
  await local.set({ unrelated: 1 });
  api.storage.onChanged.fire({ [STORAGE_KEY]: { newValue: defaultSettings() } }, 'sync');
  await settle();
  assert.equal(received.get(1), undefined);
});

test('broadcast: a tab without a content script does not stop the others', async () => {
  const { api, received, tabList } = fakeApi({ tabs: 2 });
  tabList.splice(1, 0, { id: 99 });
  const bg = createBackground({ api, fetch: noFetch });
  assert.equal(await bg.broadcast(defaultSettings()), 3);
  assert.equal(received.get(1).length, 1);
  assert.equal(received.get(2).length, 1);
});

// ----------------------------------------------------------- toolbar state

const send = (api, msg, sender) => api.runtime.onMessage.fire(msg, sender, () => {});

test('toolbar: top-frame report sets that tab\'s title and badge', async () => {
  const { api, titles, badges } = fakeApi();
  createBackground({ api, fetch: noFetch });
  send(api, { type: TAB_STATE, on: false, reason: 'already-dark' }, { id: 'ext', tab: { id: 2 }, frameId: 0 });
  send(api, { type: TAB_STATE, on: true, reason: 'mode-always' }, { id: 'ext', tab: { id: 3 }, frameId: 0 });
  await settle();
  assert.equal(titles.get(2), 'Sunglasses at Night: off, page is already dark');
  assert.equal(badges.get(2), 'off');
  assert.equal(titles.get(3), 'Sunglasses at Night: on');
  assert.equal(badges.get(3), '');
});

test('toolbar: subframe and foreign-sender reports are ignored', async () => {
  const { api, titles } = fakeApi();
  const bg = createBackground({ api, fetch: noFetch });
  send(api, { type: TAB_STATE, on: true }, { id: 'ext', tab: { id: 1 }, frameId: 4 });
  send(api, { type: TAB_STATE, on: true }, { id: 'other', tab: { id: 1 }, frameId: 0 });
  send(api, { type: TAB_STATE, on: true }, { id: 'ext', frameId: 0 });
  await settle();
  assert.equal(bg.tabStates.size, 0);
  assert.equal(titles.size, 0);
});

test('toolbar: navigation resets the tab to unavailable; closing forgets it', async () => {
  const { api, titles } = fakeApi();
  const bg = createBackground({ api, fetch: noFetch });
  send(api, { type: TAB_STATE, on: true, reason: 'mode-always' }, { id: 'ext', tab: { id: 1 }, frameId: 0 });
  api.tabs.onUpdated.fire(1, { status: 'complete' });
  assert.equal(bg.tabStates.has(1), true);
  api.tabs.onUpdated.fire(1, { status: 'loading', url: 'https://example.com/' });
  await settle();
  assert.equal(bg.tabStates.has(1), false);
  assert.equal(titles.get(1), 'Sunglasses at Night: not running on this page');
  send(api, { type: TAB_STATE, on: true }, { id: 'ext', tab: { id: 5 }, frameId: 0 });
  api.tabs.onRemoved.fire(5);
  assert.equal(bg.tabStates.has(5), false);
});

test('messages: sheet requests still go to the sheet handler; unknown types are ignored', async () => {
  const { api } = fakeApi();
  createBackground({ api, fetch: noFetch });
  const [unknown] = send(api, { type: 'unrelated' }, { id: 'ext', tab: { id: 1 } });
  assert.equal(unknown, false);
  let reply;
  const [async] = api.runtime.onMessage.fire({ type: FETCH_SHEET, url: 'https://example.com/a.css' },
    { id: 'ext', tab: { id: 1 } }, (r) => { reply = r; });
  assert.equal(async, true);
  await waitFor(() => reply);
  assert.equal(reply.ok, false);
  assert.match(reply.error, /no network/);
});

// ---------------------------------------------------------------- shortcut

test('shortcut: toggles off and back to the previous mode, and tabs hear each change', async () => {
  const { api, local, received } = fakeApi({ tabs: 1, initial: { [STORAGE_KEY]: { ...defaultSettings(), mode: 'schedule' } } });
  createBackground({ api, fetch: noFetch });
  api.commands.onCommand.fire(TOGGLE_COMMAND);
  await waitFor(() => received.get(1)?.length === 1);
  assert.equal(local._raw()[STORAGE_KEY].mode, 'off');
  assert.equal(local._raw()[RESTORE_KEY], 'schedule');
  assert.equal(received.get(1)[0].msg.settings.mode, 'off');

  api.commands.onCommand.fire(TOGGLE_COMMAND);
  await waitFor(() => received.get(1)?.length === 2);
  assert.equal(local._raw()[STORAGE_KEY].mode, 'schedule');
  assert.equal(RESTORE_KEY in local._raw(), false);
  assert.equal(received.get(1)[1].msg.settings.mode, 'schedule');
});

test('shortcut: from off with nothing remembered turns dark mode on (always)', async () => {
  const { api, local } = fakeApi({ initial: { [STORAGE_KEY]: { ...defaultSettings(), mode: 'off' } } });
  const bg = createBackground({ api, fetch: noFetch });
  const next = await bg.toggle();
  assert.equal(next.mode, 'always');
  assert.equal(local._raw()[STORAGE_KEY].mode, 'always');
});

test('shortcut: keeps every other setting', async () => {
  const before = { ...defaultSettings(), look: { brightness: 80, contrast: 120, sepia: 10, grayscale: 0 }, sites: { 'example.com': { rule: 'never' } } };
  const { api, local } = fakeApi({ initial: { [STORAGE_KEY]: before } });
  const bg = createBackground({ api, fetch: noFetch });
  await bg.toggle();
  await bg.toggle();
  assert.deepEqual(local._raw()[STORAGE_KEY], before);
});

test('shortcut: other command names do nothing', async () => {
  const { api, local } = fakeApi();
  createBackground({ api, fetch: noFetch });
  api.commands.onCommand.fire('something-else');
  await settle();
  assert.equal(local._raw()[STORAGE_KEY], undefined);
});
