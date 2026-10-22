# Data inventory

Planned design (pre-build). Re-verify against code at Phase 5. Principle: no
network code. The extension never sends page content, URLs or settings anywhere.

| Data collected | Purpose | Collection point | Recipient / storage | Retention | Deletion mechanism |
| --- | --- | --- | --- | --- | --- |
| Settings (mode, schedule times, look sliders, image mode, hide background images, already-dark detection, engine choice; schema in `engine/src/settings.js`) | apply user's chosen look | popup, options page, container app | `browser.storage.local` on device + App Group `UserDefaults` on device | until changed / reset / uninstall | "Reset all settings" (S04); uninstall removes both |
| Per-site rules: hostname + rule + optional look override | remember per-site choice | popup | same as above | until rule deleted / reset / uninstall | delete in Sites (S03), Reset all, uninstall |
| Your fixes ("Fix something on this page", 2026-10-22): per site, up to 50 entries of a CSS selector for the element you picked, the one-tap fix (lighter text, darker background, flip colors, hide, remove dark mode), and a short label (a few words of the element's own text or its name, e.g. “Developer Dashboard”; never form-field contents) | keep that element fixed on every later visit | popup button → picker (`engine/src/picker.js`, injected into the page's top frame with `scripting.executeScript` only when you press it) → `browser.storage.local` | same as the per-site rules (on device, in the App Group mirror); the "Report a problem" draft only says how many fixes the site has | until you remove the fix (popup "This site"), remove the site rule, Reset all, or uninstall | remove button per fix in the popup, the site's remove button in Sites, Reset all, uninstall |
| Page URL (in memory, per page load) | look up the per-site fix for the page (third_party/darkreader site lists) | content script, matched against the list bundled in it | nowhere: matched in memory in the page's content script, never stored, logged or sent | none (discarded after the match) | n/a |
| Rewritten page CSS (per-tab style cache): the dark override CSS generated from the page's own stylesheets, keyed by look + page path/query | paint the finished dark look at once on reload / back-forward in the same tab | content script (top frame) | the site's own `sessionStorage` on device (`sunglasses-at-night:css:*`), at most 6 entries / 1.5 M characters each; no user data, nothing leaves the device | until the tab closes (sessionStorage lifetime) | close the tab; also evicted oldest-first |
| Settings mirror + reset generation (T014): the validated settings object (incl. per-site hostnames) as JSON, its last-updated time, and an integer counter bumped by Reset all | let the container app read settings and carry out Reset all for `browser.storage` it can't reach | background script → `browser.runtime.sendNativeMessage` → `SafariWebExtensionHandler` → `Shared/SettingsBridge.swift` | App Group `UserDefaults` (`group.app.rarecreatures.sunglassesatnight`) on device only; native messaging is an in-process Safari ↔ app-extension channel, no network. Mirror capped at 1 MB | until next settings write / Reset all / uninstall | Reset all from the app (clears mirror, extension clears its store on next sync) or from the extension (clears both); uninstall removes the App Group |
| Page content + current URL (in memory only) | compute dark styles; hostname lookup for rule | content script, popup (active tab) | in page memory only; never stored except hostname when user creates a rule; never transmitted | page lifetime | n/a (not persisted) |
| Cross-origin stylesheet re-fetch (T007): the URL of a stylesheet the page itself already loaded | the CSSOM can't read cross-origin sheets; the text is needed to rewrite their colors | content script → background script (`engine/src/sheet-fetch.js`) → GET to that same URL | the sheet's own server (the same one the page loaded it from; no third party). Sent: the URL only. `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'force-cache'` (usually answered from the HTTP cache). Only http(s), no URL credentials, text/css only, ≤ 4 MB | sheet text in background memory (LRU, 64 sheets) and in the tab's memory; never stored on disk by us | until the background script unloads / tab closes | not persisted |
| First-paint registration (QA 2026-10-19, `engine/src/first-paint.js`): the extension's own dark CSS file plus match patterns built from the user's "never"/"always dark" hostnames | paint the page dark before its first frame when dark mode is on regardless of the system appearance | background script → `browser.scripting.registerContentScripts` (needs the `scripting` permission, approved by the owner 2026-10-20) | Safari's content-script registry on device; reads no page data, sends nothing | until settings change (re-registered) / uninstall | changes with settings; uninstall removes it |
| Diagnostic report (hostname, app version, OS version, active settings) | user reports a broken site | popup "Report a problem" → `mailto:` draft | user's own Mail app → support@rarecreatures.app **only if the user presses Send** | owner's mailbox; no automatic deletion, kept until the owner deletes it (owner, 2026-10-20) | owner deletes email on request; contact in privacy policy |

## Not collected (design constraints, verified at Phase 5)

No analytics, crash reporting SDK, advertising, account, IDFA, location,
cookies, remote config, or iCloud sync in v1. Safari Web Extension host access
to all websites is required to restyle pages. It's disclosed plainly in
onboarding and in the privacy policy, and access is used only on-device.

## Vendors / processors

None in the app. Apple (App Store distribution, Safari) is the platform. Uploads to App Store Connect
(`scripts/archive-testflight.sh`, 2026-10-22) send only the signed app build
from the owner's Mac to Apple; no user data. The app and extension ship a
privacy manifest (`App/PrivacyInfo.xcprivacy`): no tracking, nothing collected,
UserDefaults read for the App Group settings mirror only. The
owner's email provider for hello@ and support@rarecreatures.app is UNKNOWN; it only
receives voluntary user emails.
