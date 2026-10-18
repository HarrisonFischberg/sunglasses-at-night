// Sunglasses at Night: runtime message types shared by the content and
// background scripts. Kept separate so the content bundle never includes
// background-only code.

export const FETCH_SHEET = 'sunglasses-at-night/fetch-sheet';
// background → every tab: { type, settings } after a settings write.
export const SETTINGS_CHANGED = 'sunglasses-at-night/settings-changed';
// top frame → background: { type, on, reason } once the page decision is made.
export const TAB_STATE = 'sunglasses-at-night/tab-state';
