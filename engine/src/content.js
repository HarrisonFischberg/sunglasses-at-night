// Sunglasses at Night: content script entry (bundled to
// Extension/Resources/content/engine.js, run at document_start in every frame).
// Loads settings, paints the anti-flash sheet, and once the DOM is parsed
// either backs off (already-dark page, site rule, mode) or hands over to the
// site's engine (dynamic, or the filter fallback). Settings changes, engine
// switches included, restart the decision without a reload. No network: the only
// request is the cross-origin sheet re-fetch, which the background script does.

import { createSettingsStore, resolveSite, migrate } from './settings.js';
import { startEarly, whenParsed, whenRoot, interimCss, antiFlashCss, READY_ATTRIBUTE } from './early.js';
import { startDynamic } from './dynamic.js';
import { startFilter } from './filter.js';
import { FETCH_SHEET, SETTINGS_CHANGED, TAB_STATE, GET_SITE_FIX } from './messages.js';
import { fixCss } from './site-fixes.js';

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

// One request per sheet URL for the life of the page: the prefetch below and
// the engine's own re-fetch share it. A failure is forgotten so it can retry.
const sheetRequests = new Map();
function fetchSheet(url) {
  let request = sheetRequests.get(url);
  if (!request) {
    request = Promise.resolve(api.runtime.sendMessage({ type: FETCH_SHEET, url }))
      .then((res) => (res?.ok ? res.text : null))
      .catch(() => null);
    sheetRequests.set(url, request);
    request.then((text) => { if (text === null) sheetRequests.delete(url); });
  }
  return request;
}

// Cross-origin sheets can't be read from the page, so the engine asks the
// background for their text. Ask as each <link> arrives instead of after the
// whole document is parsed, so the answer is usually there when the engine starts.
function prefetchSheets(doc, MutationObserver) {
  const want = (node) => {
    if (node.nodeType !== 1) return;
    const links = node.localName === 'link' ? [node] : [...(node.querySelectorAll?.('link') ?? [])];
    for (const link of links) {
      if (!/\bstylesheet\b/i.test(link.rel) || !link.href) continue;
      try {
        if (new URL(link.href).origin !== location.origin) fetchSheet(link.href);
      } catch { /* not a URL */ }
    }
  };
  want(doc.documentElement);
  const observer = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) want(n);
  });
  observer.observe(doc, { childList: true, subtree: true });
  return () => observer.disconnect();
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
    document, getComputedStyle: (el) => getComputedStyle(el), settings, hostname, url: location.href, systemDark,
  });
  document.documentElement.removeAttribute(READY_ATTRIBUTE);
  // The interim rule (in ctl.style, and in base.css for system dark) lifts when
  // the engine is ready: its override sheet then covers every page sheet.
  const ready = () => {
    document.documentElement.setAttribute(READY_ATTRIBUTE, '');
    ctl.style?.remove();
    rearmed?.remove();
  };
  // The page added a sheet the override doesn't cover yet: bring the interim
  // rule back (flat dark, media untouched) until the engine says ready again.
  // The dark root/body base comes back with it: the early sheet is gone by
  // now, and a late sheet that paints html/body white (Shopify section
  // styles) would otherwise show a white page under the interim's light text
  // (QA 2026-10-19, quiettownhome.com in the iOS Simulator).
  // Marked as ours so the engine never reads it as a page sheet.
  let rearmed = null;
  const busy = (look) => () => {
    document.documentElement.removeAttribute(READY_ATTRIBUTE);
    if (!rearmed) {
      rearmed = document.createElement('style');
      rearmed.setAttribute('data-sunglasses-at-night', 'interim');
      rearmed.textContent = antiFlashCss(look) + interimCss(look);
    }
    if (!rearmed.isConnected) (document.head ?? document.documentElement).appendChild(rearmed);
  };
  const stopPrefetch = ctl.activation.on && window.MutationObserver ? prefetchSheets(document, window.MutationObserver) : () => {};
  let engine = null, cancelled = false, fixStyle = null;
  whenParsed(document, () => {
    stopPrefetch();
    if (cancelled) return;
    let result = ctl.finish();
    // A Content-Security-Policy without 'unsafe-inline' for styles (gov.uk,
    // mozilla.org, pypi.org) blocks every <style> we add: the sheet never
    // exists. Say so honestly instead of reporting "on" over a white page
    // (QA 2026-10-19). The real fix is constructable stylesheets.
    if (result.apply && ctl.style && !ctl.style.sheet) {
      ctl.style.remove();
      result = { ...result, apply: false, reason: 'csp-blocked' };
    }
    reportState(result);
    if (!result.apply) return;
    const site = resolveSite(settings, hostname);
    const media = { images: settings.images, hideBackgroundImages: settings.hideBackgroundImages };
    if (site.engine === 'filter') {
      engine = startFilter({ document, look: site.look, ...media });
      ready();
    } else {
      engine = startDynamic({ document, window, look: site.look, fetchSheet, onReady: ready, onBusy: busy(site.look), ...media });
    }
    // Per-site fixes (third_party/darkreader) come from the background,
    // which holds the list; they only add rules, so they land whenever the
    // answer arrives, after the override sheet so they win.
    Promise.resolve(api.runtime.sendMessage?.({ type: GET_SITE_FIX, url: location.href }))
      .then((fix) => {
        const css = fixCss(fix, site.look);
        if (cancelled || !css) return;
        if (engine?.setSiteCss) { engine.setSiteCss(css); return; }
        fixStyle = document.createElement('style');
        fixStyle.setAttribute('data-sunglasses-at-night', 'site-fix');
        fixStyle.textContent = css;
        document.documentElement.appendChild(fixStyle);
      })
      .catch(() => {});
  });
  return () => {
    cancelled = true;
    stopPrefetch();
    engine?.stop();
    ctl.style?.remove();
    rearmed?.remove();
    fixStyle?.remove();
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
