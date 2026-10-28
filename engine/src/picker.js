// Sunglasses at Night: "Fix something on this page" (bundled to
// Extension/Resources/content/picker.js). The popup injects it into the
// page's top frame on demand. You hover (Mac) or tap (iPhone, iPad) the part
// that looks wrong, it gets an outline, and a small menu offers the one-tap
// fixes (fix-rules.js). The fix is saved to this site's settings, and
// content.js applies it now and on every later visit. Undo removes it.
//
// Everything it draws lives in a closed shadow root on one host element,
// marked as ours so neither engine ever restyles it. Its styles go in a
// constructable sheet, which a page's Content-Security-Policy allows. No
// network.

import { createSettingsStore, extensionArea, normalizeHostname } from './settings.js';
import { FIX_ACTIONS, FIX_LABELS } from './fix-rules.js';
import { siteEntry, withFix } from './ui-core.js';
import { buildSelector, describeElement, pickTarget, isSealed, outerOf, deepElementFromPoint, hardToRead } from './picker-core.js';

const ACTIVE_KEY = '__sunglassesAtNightPicker';
const MOVE_SLOP = 10; // px a touch may move and still count as a tap
const TOAST_MS = 6000;
const SETTLE_MS = 3000; // longest wait for a saved fix to show before checking it

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.box, .bar, .menu, .toast {
  position: fixed; z-index: 2147483647;
  font: 15px/1.35 ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
  color: #e7f2f3; -webkit-text-size-adjust: 100%;
}
.box {
  pointer-events: none; border: 2px solid #5fd7c9; border-radius: 6px;
  background: rgb(95 215 201 / 0.16); box-shadow: 0 0 0 9999px rgb(2 6 8 / 0.28);
  transition: top 80ms, left 80ms, width 80ms, height 80ms;
}
.box[hidden], .menu[hidden], .bar[hidden], .toast[hidden], .grid[hidden] { display: none; }
.bar, .menu, .toast {
  background: #111b21; border: 1px solid #2b3f49; border-radius: 14px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
}
.bar {
  bottom: 16px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 24px);
  display: flex; align-items: center; gap: 12px; padding: 6px 6px 6px 16px;
}
.bar.high { top: 12px; bottom: auto; }
.menu { width: min(320px, calc(100vw - 24px)); padding: 14px; }
.menu h2 { margin: 0; font-size: 16px; font-weight: 800; }
.what { margin: 2px 0 12px; color: #9fb6bc; overflow-wrap: anywhere; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.grid button:last-child:nth-child(odd) { grid-column: 1 / -1; }
.row { display: flex; gap: 8px; margin-top: 8px; }
.row button { flex: 1; }
button {
  font: inherit; color: inherit; min-height: 44px; padding: 0 14px; cursor: pointer;
  background: #18262e; border: 1px solid #2b3f49; border-radius: 10px;
}
button:hover { border-color: #6d8b95; }
button:focus-visible { outline: 2px solid #e7f2f3; outline-offset: 2px; }
button.fix { background: #5fd7c9; color: #04201d; border-color: #5fd7c9; font-weight: 600; }
button.quiet { background: transparent; }
.toast {
  left: 50%; bottom: 16px; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 24px);
  display: flex; align-items: center; gap: 12px; padding: 6px 6px 6px 16px;
}
@media (prefers-reduced-motion: reduce) { .box { transition: none; } }
`;

function el(doc, tag, props = {}, children = []) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

/**
 * Start picking in `doc`. Returns { stop() }. `store` is a settings store
 * (settings.js); `touch` true words the hints for tapping.
 */
export function startPicker({ document: doc, window: win, store, hostname, touch = false }) {
  const host = normalizeHostname(hostname);
  const shell = el(doc, 'div', { 'data-sunglasses-at-night': 'picker' });
  const root = shell.attachShadow({ mode: 'closed' });
  try {
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch {
    root.append(el(doc, 'style', { text: CSS }));
  }

  const verb = touch ? 'Tap' : 'Click';
  const box = el(doc, 'div', { class: 'box', hidden: '' });
  const cancelBar = el(doc, 'button', { type: 'button', class: 'quiet', text: 'Cancel' });
  const bar = el(doc, 'div', { class: 'bar', role: 'status' }, [
    el(doc, 'span', { text: `${verb} the part that looks wrong` }), cancelBar,
  ]);
  const what = el(doc, 'p', { class: 'what' });
  const fixButtons = FIX_ACTIONS.map((action) =>
    el(doc, 'button', { type: 'button', class: 'fix', 'data-action': action, text: FIX_LABELS[action] }));
  const bigger = el(doc, 'button', { type: 'button', text: 'Bigger area' });
  const smaller = el(doc, 'button', { type: 'button', text: 'Smaller', hidden: '' });
  const cancelMenu = el(doc, 'button', { type: 'button', class: 'quiet', text: 'Cancel' });
  const menu = el(doc, 'div', { class: 'menu', role: 'dialog', 'aria-label': 'Fix this part', hidden: '' }, [
    el(doc, 'h2', { text: 'Fix this part' }), what,
    el(doc, 'div', { class: 'grid' }, fixButtons),
    el(doc, 'div', { class: 'row' }, [bigger, smaller, cancelMenu]),
  ]);
  const toastText = el(doc, 'span');
  const undo = el(doc, 'button', { type: 'button', text: 'Undo' });
  const toast = el(doc, 'div', { class: 'toast', role: 'status', hidden: '' }, [toastText, undo]);
  root.append(box, bar, menu, toast);
  doc.documentElement.appendChild(shell);

  let hovered = null; // under the pointer while choosing
  let picked = null; // chosen, menu open
  let trail = []; // picked elements below the current one, for Smaller
  let down = null; // where the current press started
  let stopped = false;
  let toastTimer = 0;

  const ours = (e) => e.composedPath?.().includes(shell);

  function outline(target) {
    if (!target || !target.isConnected) { box.hidden = true; return; }
    const r = target.getBoundingClientRect();
    Object.assign(box.style, { top: `${r.top - 2}px`, left: `${r.left - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
    box.hidden = false;
  }

  // Next to the outline, below if there's room, otherwise above, kept on screen.
  function placeMenu() {
    const r = picked.getBoundingClientRect();
    const vw = win.innerWidth, vh = win.innerHeight;
    menu.hidden = false;
    const m = menu.getBoundingClientRect();
    let top = r.bottom + 8;
    if (top + m.height > vh - 8) top = r.top - m.height - 8;
    top = Math.min(Math.max(8, top), Math.max(8, vh - m.height - 8));
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - m.width - 8));
    Object.assign(menu.style, { top: `${top}px`, left: `${left}px` });
  }

  function choose(target, { keepTrail = false } = {}) {
    if (!keepTrail) trail = [];
    picked = target;
    hovered = null;
    // A part inside a web component can't be addressed on its own: say so,
    // and leave widening to the whole component to Bigger area.
    const sealed = isSealed(target, doc);
    what.textContent = sealed
      ? 'This part is inside a self-contained component, so it can’t be fixed on its own. Bigger area picks the whole component.'
      : describeElement(target);
    // Not offered at all: disabled buttons looked pressable (owner, 2026-10-28).
    for (const b of fixButtons) b.disabled = sealed;
    fixButtons[0].parentElement.hidden = sealed;
    smaller.hidden = trail.length === 0;
    const parent = outerOf(target);
    bigger.disabled = !parent || parent === doc.body || parent === doc.documentElement;
    bar.hidden = true;
    outline(target);
    placeMenu();
    (sealed ? bigger : fixButtons[0]).focus({ preventScroll: true });
  }

  function unchoose() {
    picked = null;
    trail = [];
    menu.hidden = true;
    bar.hidden = false;
    box.hidden = true;
  }

  async function apply(action) {
    const target = picked;
    if (!target) return;
    if (!target.isConnected) {
      what.textContent = 'That part changed on the page. Pick it again.';
      return;
    }
    if (isSealed(target, doc)) return;
    const selector = buildSelector(target, doc);
    if (!selector || !host) {
      what.textContent = 'Sunglasses at Night can’t find a lasting address for this part. Try Bigger area.';
      return;
    }
    const { settings } = await store.load();
    const before = settings.sites[host] ?? null;
    const fix = { selector, action, label: describeElement(target) };
    await store.setSite(host, withFix(siteEntry(settings, host), fix));
    menu.hidden = true;
    box.hidden = true;
    removeInputListeners();
    toastText.textContent = `${FIX_LABELS[action]}: saved for ${host}.`;
    toast.hidden = false;
    checkReadable(target, action);
    undo.onclick = async () => {
      undo.disabled = true;
      await store.setSite(host, before);
      stop();
    };
    undo.focus({ preventScroll: true });
    toastTimer = win.setTimeout(stop, TOAST_MS);
  }

  // Once the saved fix shows (content.js restarts on the settings change),
  // text in the part it left unreadable is reported in the toast, next to Undo.
  async function checkReadable(target, action) {
    if (action === 'hide') return;
    const look = () => { const cs = win.getComputedStyle(target); return `${cs.backgroundColor}|${cs.color}|${cs.filter}`; };
    const start = look();
    for (let t = 0; t < SETTLE_MS && look() === start && !stopped; t += 100) await new Promise((r) => win.setTimeout(r, 100));
    await new Promise((r) => win.setTimeout(r, 300));
    if (stopped || !target.isConnected) return;
    const bad = hardToRead(target, (e) => win.getComputedStyle(e));
    if (bad.length) toastText.textContent += ` Some text in it is hard to read now (${bad.length} ${bad.length === 1 ? 'place' : 'places'}).`;
  }

  // ---- input: pointer events, so one path covers mouse, pen and touch.
  function onMove(e) {
    if (picked || e.pointerType === 'touch') return;
    // The hint bar steps aside when the pointer reaches it, so it never
    // covers the part you want (headers at the top, footers at the bottom).
    if (e.composedPath?.().includes(bar)) { bar.classList.toggle('high'); return; }
    if (ours(e)) return;
    const target = pickTarget(e.composedPath?.()[0] ?? e.target);
    if (target !== hovered) { hovered = target; outline(target); }
  }
  function onDown(e) {
    if (ours(e)) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    // Keeps the press from focusing or starting a drag on the page. Touch
    // keeps its default so the page can still scroll.
    if (e.pointerType !== 'touch') e.preventDefault();
    e.stopPropagation();
  }
  function onUp(e) {
    if (ours(e)) return;
    e.stopPropagation();
    const start = down;
    down = null;
    if (!start || start.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_SLOP) return; // a scroll, not a tap
    const hit = deepElementFromPoint(doc, e.clientX, e.clientY);
    const target = pickTarget(hit === shell ? e.target : hit);
    if (target && target !== doc.documentElement) choose(target);
  }
  function onCancel() { down = null; }
  // The page never sees the press: no link opens, no button fires.
  function swallow(e) {
    if (ours(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }
  // Arrow keys move around the two-column grid of fixes (the last one spans
  // both columns): Safari's Tab skips buttons unless "Press Tab to highlight
  // each item" is on.
  const STEP = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 };
  function onKey(e) {
    const at = fixButtons.indexOf(root.activeElement);
    if (picked && at >= 0 && e.key in STEP) {
      const last = fixButtons.length - 1;
      let to = at + STEP[e.key];
      if (e.key === 'ArrowDown' && to > last && at < last) to = last;
      if (e.key === 'ArrowUp' && at === last && last % 2 === 0) to = last - 2;
      const next = fixButtons[to];
      e.preventDefault();
      e.stopPropagation();
      next?.focus({ preventScroll: true });
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (picked) unchoose();
    else stop();
  }
  function onViewport() {
    if (picked) { outline(picked); placeMenu(); } else if (hovered) outline(hovered);
  }

  const opts = { capture: true, passive: false };
  const listeners = [
    ['pointermove', onMove], ['pointerdown', onDown], ['pointerup', onUp], ['pointercancel', onCancel],
    ['click', swallow], ['mousedown', swallow], ['mouseup', swallow], ['auxclick', swallow],
    ['dblclick', swallow], ['contextmenu', swallow], ['keydown', onKey],
  ];
  for (const [type, fn] of listeners) win.addEventListener(type, fn, opts);
  win.addEventListener('scroll', onViewport, { capture: true, passive: true });
  win.addEventListener('resize', onViewport, { passive: true });
  function removeInputListeners() {
    for (const [type, fn] of listeners) win.removeEventListener(type, fn, opts);
    win.removeEventListener('scroll', onViewport, { capture: true, passive: true });
    win.removeEventListener('resize', onViewport, { passive: true });
  }

  for (const b of fixButtons) b.addEventListener('click', () => apply(b.dataset.action));
  bigger.addEventListener('click', () => {
    const parent = outerOf(picked);
    if (!parent || parent === doc.body) return;
    trail.push(picked);
    choose(parent, { keepTrail: true });
  });
  smaller.addEventListener('click', () => {
    const child = trail.pop();
    if (child) choose(child, { keepTrail: true });
  });
  cancelMenu.addEventListener('click', unchoose);
  cancelBar.addEventListener('click', () => stop());

  function stop() {
    if (stopped) return;
    stopped = true;
    win.clearTimeout(toastTimer);
    removeInputListeners();
    shell.remove();
    if (win[ACTIVE_KEY]?.stop === stop) delete win[ACTIVE_KEY];
  }

  // What the picker shows, for tests and diagnostics (its root is closed).
  const rect = (n) => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
  function state() {
    const shown = [bar, menu, toast].filter((n) => !n.hidden);
    const buttons = {};
    for (const b of root.querySelectorAll('button')) if (!b.disabled && b.getClientRects().length) buttons[b.textContent] = rect(b);
    return {
      message: shown.map((n) => (n === menu ? what : n === toast ? toastText : n).textContent).join(' '),
      outline: box.hidden ? null : rect(box), toast: toast.hidden ? null : rect(toast), buttons,
    };
  }

  return { stop, state };
}

// ---- entry: injected by the popup (scripting.executeScript, top frame).
const api = globalThis.browser ?? globalThis.chrome;

function main() {
  if (!api?.storage?.local || globalThis.top !== globalThis) return;
  // Injected twice (the popup button pressed again): the first one stays.
  if (globalThis[ACTIVE_KEY]) return;
  const store = createSettingsStore(extensionArea(api));
  const touch = globalThis.matchMedia?.('(hover: none)').matches ?? false;
  globalThis[ACTIVE_KEY] = startPicker({ document, window, store, hostname: location.hostname, touch });
}

main();
