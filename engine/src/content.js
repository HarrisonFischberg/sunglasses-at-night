// Sunglasses at Night: content script entry (bundled to
// Extension/Resources/content/engine.js, run at document_start in every frame).
// Loads settings, paints the anti-flash sheet, and once the DOM is parsed
// either backs off (already-dark page, site rule, mode) or hands over to the
// dynamic engine. Settings changes restart the decision. No network: the only
// request is the cross-origin sheet re-fetch, which the background script does.

import { createSettingsStore, resolveSite } from './settings.js';
import { startEarly, whenParsed } from './early.js';
import { startDynamic } from './dynamic.js';
import { FETCH_SHEET } from './messages.js';

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
    if (!result.apply) return;
    const site = resolveSite(settings, hostname);
    if (site.engine !== 'dynamic') return; // filter engine: T008
    // Same task, so no paint in between: drop the anti-flash sheet first so
    // the engine never reads it as a page sheet.
    ctl.style?.remove();
    engine = startDynamic({ document, window, look: site.look, fetchSheet });
  });
  return () => {
    cancelled = true;
    engine?.stop();
    ctl.style?.remove();
  };
}

async function main() {
  if (!api?.storage?.local || !document.documentElement) return;
  const store = createSettingsStore(localArea());
  const { settings } = await store.load();
  let teardown = run(settings);
  store.subscribe((next) => {
    teardown();
    teardown = run(next);
  });
}

main().catch(() => {});
