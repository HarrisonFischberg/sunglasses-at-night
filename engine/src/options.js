// Sunglasses at Night: options page (S06) entry, bundled to
// Extension/Resources/options/options.js. The app's Settings and Sites
// screens (S02/S03) for people who stay in Safari: activation and schedule,
// look, images, engine, the per-site rule list, and Reset all. No network.

import { createSettingsStore, extensionArea, LOOK_RANGES, isValidTime } from './settings.js';
import { matchPreset, presetLook, siteRows, scheduleHint } from './ui-core.js';
import { RESET_ALL } from './messages.js';
import { buildReportBody, buildReportUrl, REPORT_ADDRESS } from './report.js';
import { createUndoToast } from './undo-toast.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

const store = createSettingsStore(extensionArea(api));
const toast = createUndoToast(document);

let settings = null;

function renderSites() {
  const rows = siteRows(settings);
  const list = $('sites');
  // Keep focus in the list when a row it was on goes away.
  const hadFocus = list.contains(document.activeElement);
  const was = document.activeElement?.dataset?.host;
  list.replaceChildren();
  const tpl = $('site-row');
  for (const { host, summary } of rows) {
    const li = tpl.content.firstElementChild.cloneNode(true);
    li.querySelector('.host').textContent = host;
    li.querySelector('.summary').textContent = summary;
    const btn = li.querySelector('.remove');
    btn.setAttribute('aria-label', `Remove rule for ${host}`);
    btn.title = `Remove rule for ${host}`;
    btn.dataset.host = host;
    list.append(li);
  }
  $('sites-empty').hidden = rows.length > 0;
  if (hadFocus) ([...list.querySelectorAll('.remove')].find((b) => b.dataset.host === was) ?? list.querySelector('.remove') ?? $('h-sites')).focus?.();
}

function render() {
  $('mode').value = settings.mode;
  $('schedule').hidden = settings.mode !== 'schedule';
  for (const k of ['start', 'end']) {
    if (document.activeElement !== $(k)) $(k).value = settings.schedule[k];
    $(k).removeAttribute('aria-invalid');
  }
  $('schedule-hint').textContent = scheduleHint(settings.schedule);
  $('preset').value = matchPreset(settings.look);
  for (const k of Object.keys(LOOK_RANGES)) {
    $(k).value = String(settings.look[k]);
    $(`${k}-value`).textContent = `${settings.look[k]}%`;
  }
  $('images').value = settings.images;
  $('hide-bg').checked = settings.hideBackgroundImages;
  $('detect-dark').checked = settings.detectDark;
  $('engine').value = settings.engine;
  renderSites();
}

async function commit(write) {
  toast.hide(); // an older Undo must not overwrite this change
  ({ settings } = await write);
  render();
}

$('mode').addEventListener('change', (e) => commit(store.update({ mode: e.target.value })));

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

$('preset').addEventListener('change', (e) => {
  const look = presetLook(e.target.value);
  if (look) commit(store.update({ look }));
});

for (const k of Object.keys(LOOK_RANGES)) {
  $(k).addEventListener('input', (e) => { $(`${k}-value`).textContent = `${e.target.value}%`; });
  $(k).addEventListener('change', (e) => commit(store.update({ look: { [k]: Number(e.target.value) } })));
}

$('images').addEventListener('change', (e) => commit(store.update({ images: e.target.value })));
$('hide-bg').addEventListener('change', (e) => commit(store.update({ hideBackgroundImages: e.target.checked })));
$('detect-dark').addEventListener('change', (e) => commit(store.update({ detectDark: e.target.checked })));
$('engine').addEventListener('change', (e) => commit(store.update({ engine: e.target.value })));

$('sites').addEventListener('click', (e) => {
  const btn = e.target.closest?.('button.remove');
  if (!btn?.dataset.host) return;
  const { host } = btn.dataset;
  const before = settings.sites[host];
  commit(store.setSite(host, null));
  toast.show(`Removed rule for ${host}`, async () => {
    await commit(store.setSite(host, before));
    [...$('sites').querySelectorAll('.remove')].find((b) => b.dataset.host === host)?.focus();
  });
});

// Reset all: native modal dialog (focus trapped, Escape cancels); focus
// returns to the Reset button afterwards.
const dialog = $('reset-dialog');
$('reset').addEventListener('click', () => {
  dialog.returnValue = '';
  dialog.showModal();
});
dialog.addEventListener('close', async () => {
  $('reset').focus();
  if (dialog.returnValue !== 'reset') return;
  $('reset').disabled = true; // pending: no second reset
  let ok = false;
  try {
    ok = (await api.runtime.sendMessage({ type: RESET_ALL }))?.ok === true;
  } catch {
    ok = false;
  }
  ({ settings } = await store.load());
  $('reset').disabled = false;
  toast.hide(); // nothing left to put back
  render();
  $('reset').focus();
  $('reset-done').textContent = ok ? 'All settings were reset.' : 'Reset didn’t finish. Try again.';
});

// Send Debug Logs: a draft in the user's own email app, the same report as the
// popup's "Report a problem" with their note first. The extension sends nothing.
$('problem').addEventListener('input', (e) => { $('send-logs').disabled = !e.target.value.trim(); });
$('send-logs').addEventListener('click', () => {
  const info = { version: api.runtime.getManifest().version, system: navigator.userAgent, settings, problem: $('problem').value };
  navigator.clipboard?.writeText(buildReportBody(info)).catch(() => {});
  const link = document.createElement('a');
  link.href = buildReportUrl(info);
  link.click();
  $('send-logs-status').textContent = `Your email app is opening with the report filled in: press Send there. It is also copied, so if no email app opens, paste it into an email to ${REPORT_ADDRESS}.`;
});

async function main() {
  ({ settings } = await store.load());
  render();
  // Changes from the popup, the shortcut or the app while this page is open.
  store.subscribe((next) => { settings = next; render(); });
}

main().catch(() => { $('load-error').hidden = false; });
