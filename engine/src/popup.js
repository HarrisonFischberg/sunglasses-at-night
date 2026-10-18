// Sunglasses for Safari: toolbar popup (S05) entry, bundled to
// Extension/Resources/popup/popup.js. Mode, this site's rule, the
// already-dark override and the look, saved as they change. On pages the
// extension can't run on (restricted), only the global controls show.
// No network.

import { createSettingsStore, LOOK_RANGES } from './settings.js';
import { popupView, siteEntry, withRule, withLook, withDetectDark, withEngine, presetLook } from './ui-core.js';
import { GET_TAB_STATE } from './messages.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

const store = createSettingsStore({
  get: (k) => api.storage.local.get(k),
  set: (o) => api.storage.local.set(o),
  remove: (k) => api.storage.local.remove(k),
});

let settings = null;
let tab = null;
let report = null;
let view = null;

let focused = null;
// The mode the switch returns to when turned back on within this popup session.
let lastMode = 'system';

async function fetchReport() {
  const id = tab?.id ?? focused?.id;
  if (id === undefined) return null;
  try {
    return (await api.runtime.sendMessage({ type: GET_TAB_STATE, tabId: id })) ?? null;
  } catch {
    return null;
  }
}

function render() {
  view = popupView({ settings, url: tab?.url, report, focusedUrl: focused?.url });
  $('status').textContent = view.status;
  if (view.mode !== 'off') lastMode = view.mode;
  $('power').checked = view.mode !== 'off';
  document.body.dataset.on = String(report?.on === true);
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === view.mode;
  $('site').hidden = view.restricted;
  $('custom-look-row').hidden = view.restricted;
  if (!view.restricted) {
    $('host').textContent = view.host;
    for (const r of document.querySelectorAll('input[name="rule"]')) r.checked = r.value === view.rule;
    $('already-dark').hidden = !view.alreadyDark;
    $('force-dark').checked = view.forcedDark;
    $('site-engine').value = view.engine;
    $('custom-look').checked = view.customLook;
  }
  for (const r of document.querySelectorAll('input[name="preset"]')) r.checked = r.value === view.preset;
  for (const k of Object.keys(LOOK_RANGES)) {
    $(k).value = String(view.look[k]);
    $(`${k}-value`).textContent = `${view.look[k]}%`;
  }
}

// Every write goes through the store (validated), then re-renders from the
// result. The page's own report changes a moment later; ask again.
async function commit(write) {
  const { settings: next } = await write;
  settings = next;
  render();
  setTimeout(async () => { report = await fetchReport(); render(); }, 300);
}

const editSite = (fn) => commit(store.setSite(view.host, fn(siteEntry(settings, view.host))));

function saveLook(look) {
  if (view.customLook) return editSite((e) => withLook(e, look));
  return commit(store.update({ look }));
}

$('power').addEventListener('change', (e) => commit(store.update({ mode: e.target.checked ? lastMode : 'off' })));

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', (e) => { if (e.target.checked) commit(store.update({ mode: e.target.value })); });
}

for (const radio of document.querySelectorAll('input[name="rule"]')) {
  radio.addEventListener('change', (e) => { if (e.target.checked) editSite((s) => withRule(s, e.target.value)); });
}

$('force-dark').addEventListener('change', (e) => editSite((s) => withDetectDark(s, e.target.checked ? false : undefined)));

$('site-engine').addEventListener('change', (e) => editSite((s) => withEngine(s, e.target.value)));

$('custom-look').addEventListener('change', (e) =>
  editSite((s) => withLook(s, e.target.checked ? { ...settings.look } : null)));

for (const radio of document.querySelectorAll('input[name="preset"]')) {
  radio.addEventListener('change', (e) => {
    const look = presetLook(e.target.value);
    if (e.target.checked && look) saveLook(look);
  });
}

for (const k of Object.keys(LOOK_RANGES)) {
  $(k).addEventListener('input', (e) => { $(`${k}-value`).textContent = `${e.target.value}%`; });
  $(k).addEventListener('change', (e) => saveLook({ ...view.look, [k]: Number(e.target.value) }));
}

$('more').addEventListener('click', () => {
  Promise.resolve(api.runtime.openOptionsPage()).catch(() => {});
  globalThis.close?.();
});

async function main() {
  [tab] = await api.tabs.query({ active: true, currentWindow: true });
  ({ settings } = await store.load());
  report = await fetchReport();
  // Safari can hide tab.url, or return no tab, for the popup's own window.
  if (!tab?.url && !report?.host) {
    [focused] = await api.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined) report = await fetchReport();
  }
  render();
}

main().catch(() => {
  $('status').textContent = 'Sunglasses for Safari couldn’t load its settings. Close this and try again.';
});
