// Sunglasses at Night: background script entry (bundled to
// Extension/Resources/background.js). T007: answers cross-origin stylesheet
// re-fetch requests from our content scripts. Settings broadcast, toolbar
// state and the keyboard shortcut come in T009.

import { createSheetMessageHandler } from './sheet-fetch.js';

const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener(
  createSheetMessageHandler({ fetch: globalThis.fetch.bind(globalThis), extensionId: api.runtime.id }),
);
