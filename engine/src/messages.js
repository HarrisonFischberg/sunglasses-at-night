// Sunglasses at Night: runtime message types shared by the content and
// background scripts. Kept separate so the content bundle never includes
// background-only code.

export const FETCH_SHEET = 'sunglasses-at-night/fetch-sheet';
// background → every tab: { type, settings } after a settings write.
export const SETTINGS_CHANGED = 'sunglasses-at-night/settings-changed';
// top frame → background: { type, on, reason, host } once the page decision is made.
export const TAB_STATE = 'sunglasses-at-night/tab-state';
// popup → background: { type, tabId } → the tab's last TAB_STATE report, or null.
export const GET_TAB_STATE = 'sunglasses-at-night/get-tab-state';
// options page → background: { type } → Reset all (extension store + App Group).
export const RESET_ALL = 'sunglasses-at-night/reset-all';

// Why a page was left light, keyed by the decision's `reason`.
export const OFF_TEXT = Object.freeze({
  'mode-off': 'turned off',
  'site-never': 'never dark on this site',
  'system-light': 'system appearance is light',
  'schedule-out': 'outside the schedule',
  'already-dark': 'page is already dark',
});
