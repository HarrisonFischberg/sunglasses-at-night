// T013 perf entry, bundled and injected at document start by
// engine/scripts/perf.js. Starts the dynamic engine the way content.js does
// (once the DOM is parsed, mode "always", default look) and passes a monitor
// that records every main-thread task the engine runs, so the harness can
// sum engine time instead of guessing it from page-wide timings. The cross-
// origin sheet re-fetch goes to the real background handler in Node, as in
// the e2e harness.

import { startDynamic } from '../../engine/src/dynamic.js';
import { whenParsed, whenRoot } from '../../engine/src/early.js';
import { defaultSettings } from '../../engine/src/settings.js';
import { FETCH_SHEET } from '../../engine/src/messages.js';

const perf = (globalThis.__sanPerf ??= { tasks: [], frames: [] });

async function fetchSheet(url) {
  const res = await globalThis.__sanBackground({ type: FETCH_SHEET, url });
  return res?.ok ? res.text : null;
}

if (location.protocol !== 'about:') {
  whenRoot(document, () => whenParsed(document, () => {
    const settings = defaultSettings();
    perf.engine = startDynamic({
      document, window, look: settings.look, fetchSheet,
      images: settings.images, hideBackgroundImages: settings.hideBackgroundImages,
      monitor: (name, start, ms) => perf.tasks.push({ name, start, ms }),
    });
  }));
}
