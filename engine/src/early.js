// Sunglasses for Safari: document_start anti-flash (F7).
// At document_start, if activation says on, inject a small sheet that paints
// the root dark before the page's first paint. Once the page's own styles are
// in (DOMContentLoaded), measure the page with our sheet switched off and
// remove the sheet if the page is already dark (F6). The dynamic engine
// (T007) takes over from the sheet on pages that stay dark-moded.
//
// The DOM is injected (document, getComputedStyle) so node:test can drive it
// with a fake document. No storage, no network: settings come from the caller.

import { decide } from './activation.js';
import { resolveSite } from './settings.js';
import { formatRgb } from './color.js';
import { transformColor, ensureContrast, quantize } from './transform.js';
import { detectAlreadyDark, finalDecision } from './detect.js';

export const SHEET_ID = 'sunglasses-at-night-early';

// Set on <html> as soon as settings are known. The manifest-declared
// content/base.css paints a dark base (system dark only) until it appears,
// so the page never flashes white while the async settings read is pending.
export const OFF_ATTRIBUTE = 'data-sunglasses-off';

// Set on <html> in the task the dynamic engine's first complete override sheet
// is in place (or the filter engine starts). It lifts the interim rule below.
export const READY_ATTRIBUTE = 'data-sunglasses-ready';

const MEDIA = 'img,picture,video,canvas,svg,iframe,embed,object';
const WHITE = { r: 1, g: 1, b: 1, alpha: 1 };
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

/**
 * The anti-flash CSS for a look: the colors page white and page black map
 * to, with text contrast enforced. Only colors and color-scheme change;
 * nothing that affects layout, hit-testing or pointer events.
 */
export function antiFlashCss(look) {
  const bg = quantize(transformColor(WHITE, 'bg', look));
  const fg = ensureContrast(transformColor(BLACK, 'fg', look), bg);
  const b = formatRgb(bg), f = formatRgb(fg);
  return (
    `:root{color-scheme:dark!important;background-color:${b}!important;color:${f}!important}` +
    `body{background-color:${b}!important}`
  );
}

/**
 * The interim rule: while the page loads, before the engine has rewritten its
 * sheets, every element but media gets a transparent background (so the dark
 * root shows through), light text and a dim border. Dark to dark, never white,
 * and media is untouched. `gate` is the :root selector with its attribute guards.
 */
export function interimCss(look, gate = `:root:not([${READY_ATTRIBUTE}])`) {
  const bg = quantize(transformColor(WHITE, 'bg', look));
  const fg = ensureContrast(transformColor(BLACK, 'fg', look), bg);
  return (
    `${gate} body *:not(${MEDIA}){background-color:transparent!important;` +
    `color:${formatRgb(fg)}!important;border-color:rgb(70 70 70)!important}`
  );
}

/** The sheet startEarly injects: the anti-flash base plus the interim rule. */
export function earlySheetCss(look) {
  return antiFlashCss(look) + interimCss(look);
}

/**
 * Read the page's own colors with our sheet switched off, then restore it.
 * Turning a sheet off and on synchronously restyles without painting, so
 * the user never sees the page's light colors.
 */
export function readPageColors(document, getComputedStyle, style) {
  const prevMedia = style ? style.media : undefined;
  if (style) style.media = 'not all';
  try {
    const root = document.documentElement, body = document.body;
    const rs = root ? getComputedStyle(root) : null;
    const bs = body ? getComputedStyle(body) : null;
    const meta = document.querySelector?.('meta[name="color-scheme" i]');
    return {
      rootBg: rs?.backgroundColor,
      rootColor: rs?.color,
      colorScheme: rs?.colorScheme,
      bodyBg: bs?.backgroundColor,
      bodyColor: bs?.color,
      metaColorScheme: meta?.getAttribute?.('content') ?? undefined,
    };
  } finally {
    if (style) style.media = prevMedia;
  }
}

/**
 * Run the document_start step. Returns a controller:
 *   activation  activation.decide() result
 *   style       the injected <style> element, or null when inactive
 *   finish()    measure + decide; removes the sheet on already-dark pages.
 *               Returns finalDecision()'s { apply, reason } plus `detection`.
 */
export function startEarly({
  document, getComputedStyle, settings, hostname, systemDark = false, now = new Date(), timeZone,
}) {
  const activation = decide({ settings, hostname, systemDark, now, timeZone });
  const site = resolveSite(settings, hostname);
  // Settings are known: the manifest base sheet has done its job. When on,
  // the sheet below takes over in the same task; otherwise the page goes
  // back to its authored colors. Already-dark pages are measured with the
  // base off, too (see readPageColors).
  document.documentElement?.setAttribute?.(OFF_ATTRIBUTE, '');
  let style = null;
  if (activation.on) {
    style = document.createElement('style');
    style.id = SHEET_ID;
    // Marked as ours so the dynamic engine never reads it as a page sheet; it
    // stays until the engine is ready, because the interim rule is in it.
    style.setAttribute?.('data-sunglasses-at-night', 'early');
    style.textContent = earlySheetCss(site.look);
    (document.head ?? document.documentElement).appendChild(style);
  }

  let result = null;
  function finish() {
    if (result) return result;
    let detection = null;
    if (activation.on && site.detectDark) {
      detection = detectAlreadyDark({ ...readPageColors(document, getComputedStyle, style), systemDark });
    }
    result = { ...finalDecision({ activation, detectDark: site.detectDark, detection }), detection };
    if (!result.apply && style) {
      style.remove();
      style = null;
    }
    return result;
  }

  return {
    activation,
    get style() { return style; },
    finish,
  };
}

/**
 * Call `fn` once the document has a root element (now, if it has one).
 * Safari runs document_start scripts after <html> is inserted, but other
 * WebKit hosts (and Playwright's init scripts) can run before it exists.
 */
export function whenRoot(document, fn, MutationObserver = document.defaultView?.MutationObserver) {
  if (document.documentElement) return void fn();
  if (!MutationObserver) return void whenParsed(document, () => { if (document.documentElement) fn(); });
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    fn();
  });
  observer.observe(document, { childList: true });
}

/** Call `fn` once the DOM is parsed (now, if it already is). */
export function whenParsed(document, fn) {
  if (document.readyState !== 'loading') return void fn();
  document.addEventListener('DOMContentLoaded', () => fn(), { once: true });
}
