// Sunglasses at Night: content script entry (bundled to
// Extension/Resources/content/engine.js, run at document_start in every frame).
// Loads settings, paints the anti-flash sheet, and once the DOM is parsed
// either backs off (already-dark page, site rule, mode) or hands over to the
// site's engine (dynamic, or the filter fallback). Settings changes, engine
// switches included, restart the decision without a reload. No network: the only
// request is the cross-origin sheet re-fetch, which the background script does.

import { createSettingsStore, extensionArea, resolveSite, migrate } from './settings.js';
import { startEarly, whenParsed, whenRoot, interimCss, antiFlashCss, READY_ATTRIBUTE } from './early.js';
import { startDynamic } from './dynamic.js';
import { startFilter } from './filter.js';
import { FETCH_SHEET, SETTINGS_CHANGED, TAB_STATE } from './messages.js';
import { fixesFor, fixCss, userFixCss } from './site-fixes.js';
import { keepOriginalCss } from './keep-original.js';
import { siteFixesFor } from './generated/site-fixes-data.js';
import { cspBlocked, cspBlocksStyles, startAdoptedMirror } from './adopted.js';
import { cacheKey, readCached, writeCached, adoptCss } from './style-cache.js';
import { minutesToNextChange } from './first-paint.js';

// Bumped when the engine's output changes, so old cached CSS is never reused.
const CACHE_VERSION = 1;

const api = globalThis.browser ?? globalThis.chrome;


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
  // Reload / back-forward in this tab: last visit's finished override CSS
  // paints the final dark look at once (style-cache.js), instead of the flat
  // interim rule, until the engine's own sheet is ready.
  const early = resolveSite(settings, hostname);
  const isTop = globalThis.top === globalThis;
  const storage = isTop ? (() => { try { return globalThis.sessionStorage; } catch { return null; } })() : null;
  const key = storage && ctl.style && early.engine !== 'filter'
    ? cacheKey(location.href, `${CACHE_VERSION}:${JSON.stringify(early.look ?? null)}`) : null;
  const cachedCss = readCached(storage, key);
  let dropCached = cachedCss ? adoptCss(document, window, cachedCss) : null;
  if (dropCached) ctl.style.textContent = antiFlashCss(early.look);
  // The interim rule (in ctl.style, and in base.css for system dark) lifts when
  // the engine is ready: its override sheet then covers every page sheet.
  const ready = () => {
    document.documentElement.setAttribute(READY_ATTRIBUTE, '');
    ctl.style?.remove();
    rearmed?.remove();
    dropCached?.();
    dropCached = null;
    refreshKeep();
    saveCache();
  };
  const saveCache = () => {
    const css = key && !cancelled ? engine?.cssSnapshot?.() : '';
    if (css) writeCached(storage, key, css);
  };
  if (key) globalThis.addEventListener?.('pagehide', saveCache);
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
  let engine = null, cancelled = false, fixStyle = null, mirror = null;
  // Fix sheet = built-in + your own fixes (siteCss), then the parts you set
  // to "Remove dark mode" (keepCss, re-read whenever the engine settles).
  let siteCss = '', keepCss = '', keepSelectors = [];
  function pushSiteCss() {
    const css = [siteCss, keepCss].filter(Boolean).join('\n');
    if (engine?.setSiteCss) { engine.setSiteCss(css); return; }
    if (!css) { fixStyle?.remove(); fixStyle = null; return; }
    if (!fixStyle) {
      fixStyle = document.createElement('style');
      fixStyle.setAttribute('data-sunglasses-at-night', 'site-fix');
      document.documentElement.appendChild(fixStyle);
    }
    fixStyle.textContent = css;
  }
  function refreshKeep() {
    if (!keepSelectors.length || !engine || cancelled) return;
    try {
      keepCss = keepOriginalCss({ document, getComputedStyle: (el) => getComputedStyle(el), selectors: keepSelectors });
    } catch { keepCss = ''; }
    pushSiteCss();
  }
  // The early sheet was refused already (CSP from the response header).
  if (cspBlocked(ctl.style)) mirror = startAdoptedMirror(document, window);
  whenParsed(document, () => {
    stopPrefetch();
    if (cancelled) return;
    // Already-dark detection reads the page's own colors: without our sheets.
    mirror?.pause();
    const cached = dropCached ? cachedCss : null;
    dropCached?.();
    let result = ctl.finish();
    mirror?.resume();
    dropCached = cached && result.apply ? adoptCss(document, window, cached) : null;
    // A Content-Security-Policy without 'unsafe-inline' for styles (gov.uk,
    // mozilla.org, pypi.org) blocks every <style> we add: the sheet never
    // exists. Mirror ours into constructable sheets, which CSP allows; where
    // even that's impossible, say so instead of reporting "on" over a white
    // page (QA 2026-10-19).
    if (result.apply && (cspBlocked(ctl.style) || cspBlocksStyles(document))) {
      mirror ??= startAdoptedMirror(document, window);
      if (!mirror) {
        ctl.style?.remove();
        result = { ...result, apply: false, reason: 'csp-blocked' };
      }
    }
    reportState(result);
    if (!result.apply) { mirror?.stop(); mirror = null; return; }
    const site = resolveSite(settings, hostname);
    const media = { images: settings.images, hideBackgroundImages: settings.hideBackgroundImages };
    if (site.engine === 'filter') {
      engine = startFilter({ document, look: site.look, ...media });
      ready();
    } else {
      engine = startDynamic({ document, window, look: site.look, fetchSheet, onReady: ready, onBusy: busy(site.look), ...media });
      // Ready can come inside startDynamic, before `engine` was set.
      if (document.documentElement.hasAttribute(READY_ATTRIBUTE)) saveCache();
    }
    // Per-site fixes (third_party/darkreader) are bundled here, so they apply
    // in the same task without waking the background script; the engine keeps
    // them after its override sheet so they win. Your own fixes (picked with
    // "Fix something on this page") come last, so they win over both.
    let css = '';
    try { css = fixCss(fixesFor(location.href, siteFixesFor(location.href)), site.look); } catch { /* no fix */ }
    try {
      const own = userFixCss(site.fixes, site.look, site.engine);
      if (own) css += (css ? '\n' : '') + own;
    } catch { /* no fix */ }
    siteCss = css;
    if (site.engine !== 'filter') keepSelectors = site.fixes.filter((f) => f.action === 'original').map((f) => f.selector);
    if (siteCss) pushSiteCss();
    if (document.documentElement.hasAttribute(READY_ATTRIBUTE)) refreshKeep();
  });
  return () => {
    cancelled = true;
    stopPrefetch();
    engine?.stop();
    ctl.style?.remove();
    rearmed?.remove();
    fixStyle?.remove();
    for (const el of document.querySelectorAll('[data-sunglasses-keep]')) el.removeAttribute('data-sunglasses-keep');
    mirror?.stop();
    dropCached?.();
    if (key) globalThis.removeEventListener?.('pagehide', saveCache);
  };
}

async function main() {
  if (!api?.storage?.local) return;
  const store = createSettingsStore(extensionArea(api));
  const { settings } = await store.load();
  await new Promise((resolve) => whenRoot(document, resolve));
  let latest = settings;
  let current = JSON.stringify(settings);
  let teardown = () => {};
  let scheduleTimer = null;
  // Re-decide with the latest settings. Also at the next schedule boundary,
  // so an open page follows the schedule without a reload.
  const restart = () => {
    teardown();
    teardown = run(latest);
    clearTimeout(scheduleTimer);
    const next = minutesToNextChange(latest, new Date());
    if (next !== null) scheduleTimer = setTimeout(restart, next * 60000 + 1000);
  };
  restart();
  // Settings arrive twice per write (storage.onChanged here, and the
  // background's SETTINGS_CHANGED push); restart only on a real change.
  const apply = (next) => {
    const key = JSON.stringify(next);
    if (key === current) return;
    current = key;
    latest = next;
    restart();
  };
  // The system appearance changed (macOS Auto at sunset): open pages follow it.
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', restart);
  store.subscribe(apply);
  api.runtime?.onMessage?.addListener((message, sender) => {
    if (message?.type !== SETTINGS_CHANGED) return false;
    if (api.runtime.id !== undefined && sender?.id !== undefined && sender.id !== api.runtime.id) return false;
    apply(migrate(message.settings).settings);
    return false;
  });
}

main().catch(() => {});
