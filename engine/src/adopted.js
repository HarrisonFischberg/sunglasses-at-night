// Sunglasses at Night: constructable-sheet mirror for strict-CSP pages.
// A Content-Security-Policy without 'unsafe-inline' for styles (gov.uk,
// mozilla.org, pypi.org) leaves every <style> we add without a sheet, so the
// page stayed white (QA 2026-10-19, B7). CSP doesn't govern constructable
// stylesheets, so on those pages each of our <style> elements is mirrored into
// a CSSStyleSheet adopted by the document, in document order. Adopted sheets
// cascade after every document sheet, which is where our override belongs.
//
// Our elements stay the source of truth: the engines keep writing textContent
// as usual and the mirror follows (coalesced to one sync per microtask).
// Open shadow roots aren't mirrored.

const OURS = 'style[data-sunglasses-at-night]';

/** True when `style` (connected) was refused by the page's CSP. */
export function cspBlocked(style) {
  return !!style && style.isConnected !== false && !style.sheet;
}

/**
 * Would the page refuse a <style> we add now? A CSP in a <meta> tag only
 * applies once parsed, after document_start, so this probes after parsing.
 */
export function cspBlocksStyles(document) {
  const parent = document.head ?? document.documentElement;
  if (!parent) return false;
  const probe = document.createElement('style');
  probe.setAttribute('data-sunglasses-at-night', 'probe');
  parent.appendChild(probe);
  const blocked = !probe.sheet;
  probe.remove();
  return blocked;
}

/**
 * Mirror our blocked <style> elements into document.adoptedStyleSheets.
 * Returns { stop(), pause(), resume() }, or null when the browser has no
 * constructable stylesheets. pause() takes our sheets out synchronously (to
 * measure the page's own colors, early.js readPageColors), resume() puts
 * them back; stop() removes them for good.
 */
export function startAdoptedMirror(document, win = document.defaultView) {
  const Sheet = win?.CSSStyleSheet;
  if (typeof Sheet !== 'function' || !Array.isArray(document.adoptedStyleSheets)) return null;
  let probe;
  try { probe = new Sheet(); probe.replaceSync(''); } catch { return null; }

  const mirrors = new Map(); // <style> → { sheet, text }
  const ours = new Set();
  let queued = false, stopped = false, paused = false;

  function sync() {
    queued = false;
    if (stopped || paused) return;
    const order = [];
    for (const el of document.querySelectorAll(OURS)) {
      if (el.sheet) continue; // CSP let this one through
      let m = mirrors.get(el);
      if (!m) { m = { sheet: new Sheet(), text: null }; mirrors.set(el, m); ours.add(m.sheet); }
      if (m.text !== el.textContent) {
        m.text = el.textContent;
        try { m.sheet.replaceSync(m.text); } catch { /* invalid text: keep the last good rules */ }
      }
      order.push(m.sheet);
    }
    for (const [el, m] of mirrors) {
      if (!el.isConnected) { mirrors.delete(el); ours.delete(m.sheet); }
    }
    const page = document.adoptedStyleSheets.filter((s) => !ours.has(s));
    const next = [...page, ...order];
    const cur = document.adoptedStyleSheets;
    if (cur.length !== next.length || cur.some((s, i) => s !== next[i])) document.adoptedStyleSheets = next;
  }
  const schedule = () => {
    if (queued || stopped) return;
    queued = true;
    queueMicrotask(sync);
  };

  // Our <style> elements come and go, move, and get new text: all childList
  // mutations, on the element itself or on its parent.
  const isOurs = (n) => n?.nodeType === 1 && n.localName === 'style' && n.hasAttribute('data-sunglasses-at-night');
  const observer = new win.MutationObserver((records) => {
    for (const r of records) {
      if (isOurs(r.target) || isOurs(r.target.parentNode) || [...r.addedNodes].some(isOurs) || [...r.removedNodes].some(isOurs)) { schedule(); return; }
    }
  });
  observer.observe(document, { childList: true, subtree: true, characterData: true });
  sync();

  const takeOut = () => {
    if (ours.size) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => !ours.has(s));
  };
  return {
    stop() {
      stopped = true;
      observer.disconnect();
      takeOut();
      mirrors.clear();
      ours.clear();
    },
    pause() { paused = true; takeOut(); },
    resume() { paused = false; sync(); },
  };
}
