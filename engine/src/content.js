// Sunglasses at Night: content script entry (bundled to
// Extension/Resources/content/engine.js, run at document_start in every frame).
// Loads settings, paints the anti-flash sheet, and once the DOM is parsed
// either backs off (already-dark page, site rule, mode) or hands over to the
// site's engine (dynamic, or the filter fallback). Settings changes, engine
// switches included, restart the decision without a reload. No network: the only
// request is the cross-origin sheet re-fetch, which the background script does.

import { createSettingsStore, resolveSite, migrate } from './settings.js';
import { startEarly, whenParsed, whenRoot } from './early.js';
import { startDynamic } from './dynamic.js';
import { startFilter } from './filter.js';
import { FETCH_SHEET, SETTINGS_CHANGED, TAB_STATE } from './messages.js';

const api = globalThis.browser ?? globalThis.chrome;

// browser.storage.local, with onChanged taken from storage.onChanged (the
// per-area event isn't available in every Safari version).
function localArea() {
  const local = api.storage.local;
  return {
    get: (k) => local.get(k),
    set: (o) => local.set(o),
    remove: (k) => local.remove(k),
    onChanged: {
      listeners: new Map(),
      addListener(fn) {
        const h = (changes, area) => { if (area === 'local') fn(changes, area); };
        this.listeners.set(fn, h);
        api.storage.onChanged.addListener(h);
      },
      removeListener(fn) {
        const h = this.listeners.get(fn);
        if (h) api.storage.onChanged.removeListener(h);
        this.listeners.delete(fn);
      },
    },
  };
}

async function fetchSheet(url) {
  const res = await api.runtime.sendMessage({ type: FETCH_SHEET, url });
  return res?.ok ? res.text : null;
}

// The top frame tells the background script what it decided, for the
// toolbar. Subframes stay quiet: the toolbar describes the page.
function reportState(result) {
  if (globalThis.top !== globalThis) return;
  Promise.resolve(api.runtime?.sendMessage?.({ type: TAB_STATE, on: result.apply, reason: result.reason, host: location.hostname }))
    .catch(() => {});
}

function run(settings) {
  const hostname = location.hostname;
  const systemDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const ctl = startEarly({
    document, getComputedStyle: (el) => getComputedStyle(el), settings, hostname, systemDark,
  });
  let engine = null, cancelled = false;
  whenParsed(document, () => {
    if (cancelled) return;
    const result = ctl.finish();
    reportState(result);
    if (!result.apply) return;
    const site = resolveSite(settings, hostname);
    const media = { images: settings.images, hideBackgroundImages: settings.hideBackgroundImages };
    // Same task, so no paint in between: drop the anti-flash sheet first so
    // the engine never reads it as a page sheet.
    ctl.style?.remove();
    engine = site.engine === 'filter'
      ? startFilter({ document, look: site.look, ...media })
      : startDynamic({ document, window, look: site.look, fetchSheet, ...media });
  });
  return () => {
    cancelled = true;
    engine?.stop();
    ctl.style?.remove();
  };
}

async function main() {
  if (!api?.storage?.local) return;
  const store = createSettingsStore(localArea());
  const { settings } = await store.load();
  await new Promise((resolve) => whenRoot(document, resolve));
  let current = JSON.stringify(settings);
  let teardown = run(settings);
  // Settings arrive twice per write (storage.onChanged here, and the
  // background's SETTINGS_CHANGED push); restart only on a real change.
  const apply = (next) => {
    const key = JSON.stringify(next);
    if (key === current) return;
    current = key;
    teardown();
    teardown = run(next);
  };
  store.subscribe(apply);
  api.runtime?.onMessage?.addListener((message, sender) => {
    if (message?.type !== SETTINGS_CHANGED) return false;
    if (api.runtime.id !== undefined && sender?.id !== undefined && sender.id !== api.runtime.id) return false;
    apply(migrate(message.settings).settings);
    return false;
  });
}

main().catch(() => {});
