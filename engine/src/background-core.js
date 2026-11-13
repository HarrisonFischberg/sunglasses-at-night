// Sunglasses at Night: background logic (T009). The WebExtension API is
// injected so node:test can drive it; background.js passes the real one.
//
//   Settings broadcast  every write to the settings key is pushed to every
//                       open tab as SETTINGS_CHANGED. Content scripts also
//                       listen to storage.onChanged themselves; the push covers
//                       Safari versions where that event is late or missing in
//                       content scripts, and the content side drops duplicates.
//   Toolbar state       each tab's top frame reports whether it darkened the
//                       page (TAB_STATE); the toolbar title and badge show it
//                       for that tab. Icons per state come with T017.
//   Keyboard shortcut   the manifest `commands` entry (Mac) toggles the master
//                       switch: mode 'off' ↔ the mode it replaced.
//   First paint         registers content/base-on.css at document_start while
//                       dark mode is on regardless of the system (first-paint.js).
//
// No network here: the only request is the sheet re-fetch in sheet-fetch.js.

import { createSettingsStore, extensionArea, migrate, STORAGE_KEY, MODES } from './settings.js';
import { createSheetMessageHandler } from './sheet-fetch.js';
import { SETTINGS_CHANGED, TAB_STATE, GET_TAB_STATE, RESET_ALL, OFF_TEXT, RESTORE_KEY } from './messages.js';
import { firstPaintPlan, msToNextChange, samePlan, FIRST_PAINT_ID, FIRST_PAINT_CSS } from './first-paint.js';

export const TOGGLE_COMMAND = 'toggle-dark-mode';
// Last App Group reset generation this extension has applied (T014).
export const RESET_GENERATION_KEY = 'nativeResetGeneration';
// Safari ignores the application id and routes to the containing app's handler.
export const NATIVE_APP_ID = 'app.rarecreatures.sunglassesatnight';

const NAME = 'Sunglasses at Night';

/**
 * The shortcut's effect. On (any mode but 'off') → 'off', remembering the
 * mode. Off → the remembered mode, or 'always' when there is none: the user
 * pressed the key to get a dark page.
 */
export function toggleMode(mode, restore) {
  if (mode !== 'off') return { mode: 'off', restore: mode };
  const back = MODES.includes(restore) && restore !== 'off' ? restore : 'always';
  return { mode: back, restore: null };
}

/**
 * Toolbar title and badge for a tab. `report` is the tab's last TAB_STATE
 * ({ on, reason }), or undefined when no content script has reported
 * (restricted page, page still loading, extension not allowed there).
 */
export function toolbarState(report) {
  if (!report) return { state: 'unavailable', title: `${NAME}: not running on this page`, badge: '' };
  if (report.on) return { state: 'on', title: `${NAME}: on`, badge: '' };
  const why = OFF_TEXT[report.reason];
  return { state: 'off', title: why ? `${NAME}: off, ${why}` : `${NAME}: off`, badge: 'off' };
}

const ignore = () => {};

/**
 * Wire the background script. Returns handles for tests:
 *   broadcast(settings) → Promise<number of tabs messaged>
 *   toggle()            → Promise<new settings>
 *   tabStates           Map tabId → last report
 */
export function createBackground({ api, fetch }) {
  const store = createSettingsStore(extensionArea(api));
  const action = api.action ?? api.browserAction;
  const tabStates = new Map();

  async function broadcast(settings) {
    const tabs = await api.tabs.query({});
    const message = { type: SETTINGS_CHANGED, settings };
    await Promise.all(tabs.map((t) =>
      t.id === undefined ? null : Promise.resolve(api.tabs.sendMessage(t.id, message)).catch(ignore)));
    return tabs.length;
  }

  function paint(tabId) {
    if (!action) return;
    const { state, title, badge } = toolbarState(tabStates.get(tabId));
    const kind = state === 'on' ? 'toolbar-dark' : 'toolbar-dark-off';
    const path = Object.fromEntries([16, 19, 32, 38, 48, 96].map((n) => [n, `images/${kind}-${n}.png`]));
    Promise.resolve(action.setIcon?.({ tabId, path })).catch(ignore);
    Promise.resolve(action.setTitle?.({ tabId, title })).catch(ignore);
    Promise.resolve(action.setBadgeText?.({ tabId, text: badge })).catch(ignore);
  }

  async function toggle() {
    const { settings } = await store.load();
    const got = await api.storage.local.get(RESTORE_KEY);
    const next = toggleMode(settings.mode, got?.[RESTORE_KEY]);
    if (next.restore) await api.storage.local.set({ [RESTORE_KEY]: next.restore });
    else await api.storage.local.remove(RESTORE_KEY);
    return (await store.update({ mode: next.mode })).settings;
  }

  // ---- native bridge (T014): mirror settings into the App Group, apply the
  // app's Reset all. Without native messaging (tests, other browsers) these no-op.
  async function sendNative(message) {
    if (typeof api.runtime.sendNativeMessage !== 'function') return null;
    try {
      return await api.runtime.sendNativeMessage(NATIVE_APP_ID, message);
    } catch {
      return null;
    }
  }

  async function seenGeneration() {
    const got = await api.storage.local.get(RESET_GENERATION_KEY);
    const n = got?.[RESET_GENERATION_KEY];
    return Number.isInteger(n) && n >= 0 ? n : 0;
  }

  // Clear this extension's store. The generation is written first, so the
  // settings write that follows syncs defaults with it and isn't reset again.
  async function clearLocal(generation) {
    await api.storage.local.set({ [RESET_GENERATION_KEY]: generation });
    await api.storage.local.remove(RESTORE_KEY);
    return store.reset();
  }

  // Push settings to the App Group mirror. Returns the native reply, or null.
  async function syncNative() {
    const { settings } = await store.load();
    const reply = await sendNative({ type: 'sync', settings, resetGeneration: await seenGeneration() });
    if (reply?.reset === true && Number.isInteger(reply.resetGeneration)) await clearLocal(reply.resetGeneration);
    return reply;
  }

  // Reset all from the extension UI: both stores.
  async function resetAll() {
    const reply = await sendNative({ type: 'reset' });
    const generation = Number.isInteger(reply?.resetGeneration) ? reply.resetGeneration : await seenGeneration();
    return clearLocal(generation);
  }

  // ---- first paint (QA 2026-10-19): keep the registered dark base in step
  // with the settings. Re-planned on every settings change, on every
  // navigation (cheap; a schedule may have crossed its boundary while this
  // background was asleep) and at the next schedule boundary while awake.
  let registered; // undefined until the first sync reads what Safari has
  let planTimer = null;
  async function syncFirstPaint(settings) {
    const scripting = api.scripting;
    if (!scripting?.registerContentScripts) return null;
    if (!settings) settings = (await store.load()).settings;
    const plan = firstPaintPlan(settings, new Date());
    if (registered === undefined) {
      const got = await Promise.resolve(scripting.getRegisteredContentScripts?.({ ids: [FIRST_PAINT_ID] })).catch(() => []);
      registered = got?.[0] ? { matches: got[0].matches, excludeMatches: got[0].excludeMatches ?? [] } : null;
    }
    clearTimeout(planTimer);
    const next = msToNextChange(settings, new Date());
    if (next !== null) planTimer = setTimeout(() => syncFirstPaint().catch(ignore), next + 1000);
    if (samePlan(plan, registered)) return plan;
    if (registered) await Promise.resolve(scripting.unregisterContentScripts({ ids: [FIRST_PAINT_ID] })).catch(ignore);
    registered = null;
    if (plan) {
      await scripting.registerContentScripts([{
        id: FIRST_PAINT_ID, css: [FIRST_PAINT_CSS], matches: plan.matches,
        ...(plan.excludeMatches.length ? { excludeMatches: plan.excludeMatches } : {}),
        runAt: 'document_start', allFrames: true, persistAcrossSessions: true,
      }]);
      registered = plan;
    }
    return plan;
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes || !Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;
    const next = migrate(changes[STORAGE_KEY].newValue).settings;
    broadcast(next).catch(ignore);
    syncNative().catch(ignore);
    syncFirstPaint(next).catch(ignore);
  });

  const sheetHandler = createSheetMessageHandler({ fetch, extensionId: api.runtime.id });
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const fromUs = api.runtime.id === undefined || sender?.id === api.runtime.id;
    // Popup and options page: extension pages, so no sender.tab.
    if (message?.type === GET_TAB_STATE || message?.type === RESET_ALL) {
      if (!fromUs || sender?.tab) return false;
      if (message.type === GET_TAB_STATE) {
        sendResponse(tabStates.get(message.tabId) ?? null);
        return false;
      }
      resetAll().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true;
    }
    if (message?.type === TAB_STATE) {
      const tabId = sender?.tab?.id;
      if (!fromUs || tabId === undefined || (sender.frameId ?? 0) !== 0) return false;
      const state = { on: message.on === true, reason: String(message.reason ?? '') };
      if (typeof message.host === 'string' && message.host !== '') state.host = message.host.slice(0, 253);
      tabStates.set(tabId, state);
      paint(tabId);
      return false;
    }
    return sheetHandler(message, sender, sendResponse);
  });

  api.tabs.onRemoved?.addListener((tabId) => tabStates.delete(tabId));
  api.tabs.onUpdated?.addListener((tabId, info) => {
    if (info?.status !== 'loading') return;
    // A navigation: the old page's state no longer applies.
    tabStates.delete(tabId);
    paint(tabId);
    if (registered !== undefined) syncFirstPaint().catch(ignore);
  });

  api.commands?.onCommand.addListener((command) => {
    if (command === TOGGLE_COMMAND) toggle().catch(ignore);
  });

  // Each background start picks up a Reset all done in the app meanwhile.
  const ready = Promise.all([syncNative().catch(ignore), syncFirstPaint().catch(ignore)]);

  return { broadcast, toggle, tabStates, store, syncNative, resetAll, syncFirstPaint, ready };
}
