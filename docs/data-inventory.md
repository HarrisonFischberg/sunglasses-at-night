# Data inventory

Planned design (pre-build). Re-verify against code at Phase 5. Principle: no
network code. The extension never sends page content, URLs or settings anywhere.

| Data collected | Purpose | Collection point | Recipient / storage | Retention | Deletion mechanism |
| --- | --- | --- | --- | --- | --- |
| Settings (mode, schedule times, look sliders, image mode) | apply user's chosen look | popup, options page, container app | `browser.storage.local` on device + App Group `UserDefaults` on device | until changed / reset / uninstall | "Reset all settings" (S04); uninstall removes both |
| Per-site rules: hostname + rule + optional look override | remember per-site choice | popup | same as above | until rule deleted / reset / uninstall | delete in Sites (S03), Reset all, uninstall |
| Page content + current URL (in memory only) | compute dark styles; hostname lookup for rule | content script, popup (active tab) | in page memory only; never stored except hostname when user creates a rule; never transmitted | page lifetime | n/a (not persisted) |
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
