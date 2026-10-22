// Sunglasses at Night: toolbar popup (S05) entry, bundled to
// Extension/Resources/popup/popup.js. Mode and schedule hours, this site's
// rule, the already-dark override, the look, and under "More settings"
// everything the options page has (images, engine, the site list, Reset all),
// plus "Fix something on this page" (picker.js) and this site's own fixes,
// so iOS never needs the separate settings window. Saved as they change. On pages the
// extension can't run on (restricted), only the global controls show.
// No network.

import { createSettingsStore, LOOK_RANGES, isValidTime } from './settings.js';
import { popupView, siteEntry, withRule, withLook, withDetectDark, withEngine, withoutFix, presetLook, siteRows, scheduleHint } from './ui-core.js';
import { GET_TAB_STATE, RESET_ALL } from './messages.js';
import { buildReportUrl } from './report.js';

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
    renderFixes();
  }
  $('report').href = buildReportUrl({
    host: view.restricted ? null : view.host,
    version: api.runtime.getManifest?.().version,
    system: globalThis.navigator?.userAgent,
    settings,
  });
  $('schedule').hidden = settings.mode !== 'schedule';
  for (const k of ['start', 'end']) {
    if (document.activeElement !== $(k)) $(k).value = settings.schedule[k];
    $(k).removeAttribute('aria-invalid');
  }
  $('schedule-hint').textContent = scheduleHint(settings.schedule);
  $('images').value = settings.images;
  $('hide-bg').checked = settings.hideBackgroundImages;
  $('detect-dark').checked = settings.detectDark;
  $('engine').value = settings.engine;
  renderSites();
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

// ---- Your fixes: pick an element on the page (picker.js), list, remove
// The hint text stays put while the popup re-renders (no layout shift, T033);
// fixes saved while the page is light apply once it goes dark.
function renderFixes() {
  const list = $('fixes');
  const hadFocus = list.contains(document.activeElement);
  list.replaceChildren();
  for (const { selector, title, action } of view.fixes) {
    const li = $('fix-row').content.firstElementChild.cloneNode(true);
    li.querySelector('.what').textContent = title;
    li.querySelector('.summary').textContent = action;
    const btn = li.querySelector('.remove');
    btn.setAttribute('aria-label', `Remove fix: ${action}, ${title}`);
    btn.title = 'Remove this fix';
    btn.dataset.selector = selector;
    list.append(li);
  }
  list.hidden = view.fixes.length === 0;
  if (hadFocus) (list.querySelector('.remove') ?? $('pick')).focus?.();
}

$('pick').addEventListener('click', async () => {
  const tabId = tab?.id ?? focused?.id;
  try {
    await api.scripting.executeScript({ target: { tabId }, files: ['content/picker.js'] });
    // Out of the way, so the page is there to point at (on iPhone the popup
    // covers it).
    window.close();
  } catch {
    $('pick-hint').textContent = 'Sunglasses at Night can’t reach this page. Reload it and try again.';
  }
});

$('fixes').addEventListener('click', (e) => {
  const btn = e.target.closest?.('button.remove');
  if (btn?.dataset.selector) editSite((s) => withoutFix(s, btn.dataset.selector));
});

// ---- More settings (same controls and rules as the options page)
function renderSites() {
  const rows = siteRows(settings);
  const list = $('sites');
  const hadFocus = list.contains(document.activeElement);
  list.replaceChildren();
  for (const { host, summary } of rows) {
    const li = $('site-row').content.firstElementChild.cloneNode(true);
    li.querySelector('.host').textContent = host;
    li.querySelector('.summary').textContent = summary;
    const btn = li.querySelector('.remove');
    btn.setAttribute('aria-label', `Remove rule for ${host}`);
    btn.title = `Remove rule for ${host}`;
    btn.dataset.host = host;
    list.append(li);
  }
  $('sites-empty').hidden = rows.length > 0;
  if (hadFocus) (list.querySelector('.remove') ?? $('more-settings').querySelector('summary')).focus?.();
}

for (const k of ['start', 'end']) {
  $(k).addEventListener('change', (e) => {
    if (!isValidTime(e.target.value)) {
      e.target.setAttribute('aria-invalid', 'true');
      $('schedule-hint').textContent = 'Enter a time, like 20:00.';
      return;
    }
    commit(store.update({ schedule: { [k]: e.target.value } }));
  });
}
$('images').addEventListener('change', (e) => commit(store.update({ images: e.target.value })));
$('hide-bg').addEventListener('change', (e) => commit(store.update({ hideBackgroundImages: e.target.checked })));
$('detect-dark').addEventListener('change', (e) => commit(store.update({ detectDark: e.target.checked })));
$('engine').addEventListener('change', (e) => commit(store.update({ engine: e.target.value })));
$('sites').addEventListener('click', (e) => {
  const btn = e.target.closest?.('button.remove');
  if (btn?.dataset.host) commit(store.setSite(btn.dataset.host, null));
});

// Reset all: an inline confirmation (a modal dialog is cramped in a popover).
$('reset').addEventListener('click', () => {
  $('reset-confirm').hidden = false;
  $('reset').hidden = true;
  $('reset-cancel').focus();
});
$('reset-cancel').addEventListener('click', () => {
  $('reset-confirm').hidden = true;
  $('reset').hidden = false;
  $('reset').focus();
});
$('reset-go').addEventListener('click', async () => {
  let ok = false;
  try {
    ok = (await api.runtime.sendMessage({ type: RESET_ALL }))?.ok === true;
  } catch {
    ok = false;
  }
  ({ settings } = await store.load());
  $('reset-confirm').hidden = true;
  $('reset').hidden = false;
  render();
  $('reset-done').textContent = ok ? 'All settings were reset.' : 'Reset didn’t finish. Try again.';
  $('reset').focus();
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
  openAtTop();
}

// Safari may move focus into the popover when it opens (it restores focus to
// the last control used, e.g. the Engine menu at the bottom), and the scroll
// container then jumps to show it, hiding the status line under the header.
// A popup always opens at the top; keyboard users start from the first control.
function openAtTop() {
  const scroller = document.querySelector('.popup-scroll');
  const reset = () => {
    const a = document.activeElement;
    if (a && a !== document.body && !a.matches(':focus-visible')) a.blur();
    if (scroller) scroller.scrollTop = 0;
  };
  reset();
  requestAnimationFrame(reset);
  // The deferred report re-render (commit → 300 ms) must not move it either.
  const until = performance.now() + 800;
  const onFocus = () => { if (performance.now() < until) reset(); };
  document.addEventListener('focusin', onFocus, { once: true });
}

main().catch(() => {
  $('status').textContent = 'Sunglasses at Night couldn’t load its settings. Close this and try again.';
});
