// Sunglasses for Safari: background script entry (bundled to
// Extension/Resources/background.js). Wires the real WebExtension API into
// background-core.js: settings broadcast, toolbar state, the Mac keyboard
// shortcut, and the cross-origin stylesheet re-fetch (T007).

import { createBackground } from './background-core.js';

const api = globalThis.browser ?? globalThis.chrome;

createBackground({ api, fetch: globalThis.fetch.bind(globalThis) });
