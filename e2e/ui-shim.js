// A stand-in for the WebExtension API, injected before the real popup and
// options pages (Extension/Resources) load in WebKit. Shared by the T010
// (ui.test.js) and T030 (t030.test.js) suites.

import { defaultSettings } from '../engine/src/settings.js';

export function shim({ settings, tabUrl, report }) {
  return `(() => {
  const data = { settings: ${JSON.stringify(settings)} };
  const listeners = new Set();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  globalThis.__sent = [];
  globalThis.__data = data;
  globalThis.browser = {
    storage: {
      local: {
        get: async (k) => (k in data ? { [k]: clone(data[k]) } : {}),
        set: async (o) => {
          const changes = {};
          for (const [k, v] of Object.entries(o)) { changes[k] = { oldValue: clone(data[k]), newValue: clone(v) }; data[k] = clone(v); }
          for (const l of listeners) l(changes, 'local');
        },
        remove: async (k) => { delete data[k]; },
      },
      onChanged: { addListener: (f) => listeners.add(f), removeListener: (f) => listeners.delete(f) },
    },
    tabs: { query: async () => [${tabUrl === null ? '{ id: 5 }' : `{ id: 5, url: ${JSON.stringify(tabUrl)} }`}] },
    runtime: {
      id: 'e2e',
      openOptionsPage: async () => { globalThis.__openedOptions = true; },
      sendMessage: async (msg) => {
        __sent.push(msg);
        if (msg.type.endsWith('get-tab-state')) return ${JSON.stringify(report ?? null)};
        if (msg.type.endsWith('reset-all')) {
          await globalThis.browser.storage.local.set({ settings: ${JSON.stringify(defaultSettings())} });
          return { ok: true };
        }
      },
    },
  };
})();`;
}
