# Data inventory

Planned design (pre-build). Re-verify against code at Phase 5. Principle: no
network code. The extension never sends page content, URLs or settings anywhere.

| Data collected | Purpose | Collection point | Recipient / storage | Retention | Deletion mechanism |
| --- | --- | --- | --- | --- | --- |
| Settings (mode, schedule times, look sliders, image mode, hide background images, already-dark detection, engine choice; schema in `engine/src/settings.js`) | apply user's chosen look | popup, options page, container app | `browser.storage.local` on device + App Group `UserDefaults` on device | until changed / reset / uninstall | "Reset all settings" (S04); uninstall removes both |
| Per-site rules: hostname + rule + optional look override | remember per-site choice | popup | same as above | until rule deleted / reset / uninstall | delete in Sites (S03), Reset all, uninstall |
| Settings mirror + reset generation (T014): the validated settings object (incl. per-site hostnames) as JSON, its last-updated time, and an integer counter bumped by Reset all | let the container app read settings and carry out Reset all for `browser.storage` it can't reach | background script → `browser.runtime.sendNativeMessage` → `SafariWebExtensionHandler` → `Shared/SettingsBridge.swift` | App Group `UserDefaults` (`group.app.rarecreatures.sunglassesatnight`) on device only; native messaging is an in-process Safari ↔ app-extension channel, no network. Mirror capped at 1 MB | until next settings write / Reset all / uninstall | Reset all from the app (clears mirror, extension clears its store on next sync) or from the extension (clears both); uninstall removes the App Group |
| Page content + current URL (in memory only) | compute dark styles; hostname lookup for rule | content script, popup (active tab) | in page memory only; never stored except hostname when user creates a rule; never transmitted | page lifetime | n/a (not persisted) |
| Cross-origin stylesheet re-fetch (T007): the URL of a stylesheet the page itself already loaded | the CSSOM can't read cross-origin sheets; the text is needed to rewrite their colors | content script → background script (`engine/src/sheet-fetch.js`) → GET to that same URL | the sheet's own server (the same one the page loaded it from; no third party). Sent: the URL only. `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'force-cache'` (usually answered from the HTTP cache). Only http(s), no URL credentials, text/css only, ≤ 4 MB | sheet text in background memory (LRU, 64 sheets) and in the tab's memory; never stored on disk by us | until the background script unloads / tab closes | not persisted |
| Diagnostic report (hostname, app version, OS version, active settings) | user reports a broken site | popup "Report a problem" → `mailto:` draft | user's own Mail app → hello@rarecreatures.app **only if the user presses Send** | owner's mailbox; retention policy UNKNOWN (launch blocker) | owner deletes email on request; contact in privacy policy |

## Not collected (design constraints, verified at Phase 5)

No analytics, crash reporting SDK, advertising, account, IDFA, location,
cookies, remote config, or iCloud sync in v1. Safari Web Extension host access
to all websites is required to restyle pages. It's disclosed plainly in
onboarding and in the privacy policy, and access is used only on-device.

## Vendors / processors

None in the app. Apple (App Store distribution, Safari) is the platform. The
owner's email provider for hello@rarecreatures.app is UNKNOWN; it only
receives voluntary user emails.
