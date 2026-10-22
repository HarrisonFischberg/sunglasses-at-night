# Compliance checklist — 20 safeguards

Statuses: PASS / FAIL / BLOCKED / NEEDS REVIEW / NOT APPLICABLE.
PASS = engineering checks passed, not legal approval. NOT APPLICABLE needs a
documented reason from actual app behavior. Missing tools or credentials are
BLOCKED, never PASS. Pre-build (2026-10-18): FAIL here means "not implemented yet", the honest status before any code exists.

Item text: `~/.claude/skills/new-app/references/safeguards.md`.

| # | Safeguard | Status | Applicability / rationale | Remediation | Files / routes | Tests or checks | Evidence | Owner / open items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Privacy policy | NEEDS REVIEW | Applies: App Store requires a policy URL; app accesses page content on device | Draft from data-inventory (T018); link from app S04, popup, listing | app S04, docs/site/privacy.html | claims vs code review | — | B1,B2,B5,B6,B8 |
| 2 | Terms of service | NEEDS REVIEW | Applies lightly: free utility, no accounts. Apple standard EULA may suffice | Decide: Apple standard EULA vs custom terms (T018 drafts minimal terms for review) | docs/site/terms.html | — | — | B8, owner decision |
| 3 | Refund policy | NOT APPLICABLE | Free, no purchases, no IAP (owner 2026-10-18). Re-open if pricing changes | — | — | grep for StoreKit = none (T019) | — | — |
| 4 | Cookie policy | NEEDS REVIEW | No cookies/trackers; but extension uses local storage for settings → disclose as storage section in privacy policy rather than a separate cookie policy | Storage disclosure in privacy policy (T018) | privacy.html#storage | storage inventory vs code | — | — |
| 5 | Cookie consent banner | NOT APPLICABLE | No optional tracking technology exists; storage is strictly functional and on-device. Verified at Phase 5 by network audit (T019) | — | — | T019 no-network test | — | — |
| 6 | Form consents | NOT APPLICABLE | No forms collecting data. Report flow is a user-composed mailto draft, nothing pre-consented | — | popup | T011 | — | — |
| 7 | No unnecessary data | FAIL | Applies: host access to all sites is inherent | No network code; minimal manifest permissions (storage, activeTab/host, nativeMessaging); no location; hostname-only rules | manifest.json | T019 manifest + no-network test | — | — |
| 8 | Third-party SDK audit | FAIL | Applies: zero runtime deps planned; dev deps only | Inventory dev deps (Playwright if approved); `npm audit` | package.json | T019 | — | B12 |
| 9 | No dark patterns | FAIL | Applies: onboarding, reset, popup | No nags, no rating prompts, no fake urgency; reset confirm is neutral | S01,S04,S05 | T020 review | — | — |
| 10 | No hidden fees | NOT APPLICABLE | Free, no fees or purchases | — | — | — | — | — |
| 11 | No fake reviews | FAIL | Applies to listing/landing: no testimonials, ratings, or user counts | Never add; T020 sweep | listing, site | T020 | — | — |
| 12 | No unsupported claims | FAIL | Applies: claims like 'no data collected', 'meets WCAG contrast', 'no white flash' need evidence | Evidence rows in claims-evidence.md before use | listing, onboarding | T020 | — | — |
| 13 | Alt text | FAIL | Applies: icon-only buttons in popup, SF Symbols in app | accessible names; decorative images alt='' | popup, app | T015 VoiceOver pass | — | — |
| 14 | Color contrast (WCAG 2.2 AA) | FAIL | Applies: popup/app UI AND the engine's output on websites | Tokens checked (design-direction.md); engine enforces ≥4.5:1 on rewritten text; rendered checks | popup, engine | T012, T015 | replica/design-direction.md | B12 |
| 15 | Keyboard navigation | FAIL | Applies: popup/options HTML (Mac keyboard), app Full Keyboard Access | native controls, focus order, visible focus, Escape closes | popup, options, app | T015 | — | — |
| 16 | Business details | BLOCKED | Applies: App Store seller + policy 'who we are' | Show only owner-supplied details | S04, site | — | — | B1,B2 |
| 17 | Children's data | NEEDS REVIEW | Applies: owner wants youngest age allowed (4+); app collects no personal data, report flow is voluntary email | Keep zero collection; mailto only from popup, never in onboarding; legal review | S05 | T019 | — | B3,B4 |
| 18 | Email unsubscribe | NOT APPLICABLE | App sends no email; only the user can send a voluntary report | — | — | T019 no-network | — | — |
| 19 | Asset and code licenses | FAIL | Applies: app icon, SF Symbols (Apple license, Apple platforms only), any fonts (system only) | asset-licenses.md rows; original icon | Assets.xcassets | T017 | docs/asset-licenses.md | — |
| 20 | Data deletion request | FAIL | No accounts or server data; applies as on-device reset + explanation for report emails | Reset all (S04); privacy policy explains uninstall + emailing to delete a report | S04 | T014 test | — | B6 |
