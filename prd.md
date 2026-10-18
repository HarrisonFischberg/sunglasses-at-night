# Sunglasses for Safari — PRD

Status: **APPROVED v1** by Harold, 2026-10-18 (plan, permissions, Playwright dev dependency, 10-iteration cap with stop after 2 without progress).

## Purpose

A free, privacy-first Safari Web Extension that darkens every website on iPhone,
iPad and Mac, keeps text readable, and never sends anything off the device.

## Intake (owner answers, 2026-10-18)

| Item | Value |
| --- | --- |
| Name | Sunglasses for Safari (renamed 2026-10-18 from "Sunglasses at Night", earlier working title "Dark Eyes"), slug `sunglasses-at-night` |
| Platforms | macOS 13+, iOS 16+, iPadOS 16+, one universal app. Owner answered "yes" to "macOS + iOS/iPadOS with extras" |
| References | Noir, Dark Reader, Midnight: Dark Mode for Safari. Scope applied: public pages only (see `docs/rea-findings.md`) |
| Repo | https://github.com/HarrisonFischberg/sunglasses-at-night (private) |
| Price | Free, no IAP |
| Markets | Global |
| Contact / privacy contact | hello@rarecreatures.app |
| Age | "youngest age allowed" → planned App Store 4+, not Kids Category (confirm: B3) |
| Stack | Safari Web Extension (Manifest V3, plain JS, zero runtime deps) + SwiftUI container app (Xcode 27 multiplatform) |
| Hosting | none for the app; privacy/support page needs a host (B5) |

## Product features

| ID | Feature | Matrix ref |
| --- | --- | --- |
| F1 | Universal app, free everywhere; onboarding that walks through enabling the extension in Safari Settings | R1 |
| F2 | Activation: System appearance (default) / Always / Schedule (fixed times, can cross midnight) / Off; Mac keyboard shortcut toggles | R2, R4 |
| F3 | Per-site rule from toolbar popup: Default / Always dark / Never dark; Sites list in app to review and delete | R3 |
| F4 | Look: brightness, contrast, sepia, grayscale; 4 original presets; **per-site overrides** of the look | R4, R5 |
| F5 | Images: leave / dim / don't invert; optional hide background images | R5 |
| F6 | Already-dark detection (skip), overridable per site | R6 |
| F7 | No white flash: `document_start` base sheet | R7 |
| F8 | Readability guarantee: rewritten text/background pairs meet ≥4.5:1 contrast (AA) on our fixtures | differentiation |
| F9 | "Report a problem": user-initiated `mailto:` draft with hostname + version, never automatic | R9 |
| F10 | Filter fallback engine per site for pages the dynamic engine breaks | R10 |
| F11 | About & Privacy: policy, acknowledgements, contact, Reset all settings | safeguards 1, 19, 20 |

Out of scope for v1 (recorded in `replica/README.md`): iCloud sync, Shortcuts / Control Center / Focus Filters / Widgets, visionOS, 20+ themes, location-based sunset schedule.

## REA and Replica findings

See `docs/rea-findings.md` (R1–R13), `replica/recon-map.md`, `replica/features.csv`, `replica/design-direction.md`.
Main takeaways: reference users complain about broken clickable elements, untinted links, slow Safari (Noir), missing per-site sliders and scheduling (Dark Reader), and paying per platform. Every reference claims "Data Not Collected".

## Architecture (original)

```
SunglassesAtNight.xcodeproj
  App (SwiftUI, iOS + macOS targets)         S01–S04, App Group UserDefaults mirror
  Extension (Safari Web Extension targets)    SafariWebExtensionHandler.swift (native messaging: settings mirror, reset)
    Resources/
      manifest.json  (MV3; permissions: storage, nativeMessaging; host: <all_urls>; commands)
      background.js  settings broadcast, toolbar state, command handler
      content/early.js  (document_start) anti-flash sheet + decision
      content/engine.js dynamic color rewrite (CSSOM + inline + MutationObserver), filter fallback
      popup/ options/   HTML UI using design tokens
engine/  (source of truth for pure logic, unit-tested with node:test, copied into Resources by a build phase)
  src/color.js  src/transform.js  src/activation.js  src/settings.js  src/detect.js
  test/*.test.js
```

Cross-origin stylesheets the CSSOM can't read are re-fetched by `background.js` from the same origin the page already loaded them from. That is a request to the site's own server, no third party. It's recorded in `docs/data-inventory.md` at T007.

## Atomic tasks

Order = dependency order. Each Ralph iteration takes exactly one task. 22 tasks at 10 iterations per approved run means **about 3 approved runs**. I'll report after each run.

| ID | Task | Depends on | Acceptance criteria | Verification command | Status |
| --- | --- | --- | --- | --- | --- |
| T000 | Smoke-test `/goal` in `claude -p` and the narrowed permissions; write `ralph/ralph.sh` final | approval | `/goal` sets and clears in a non-interactive run; result in `docs/tool-environment.md` | `ralph/ralph.sh --dry-run` | done (2026-10-18, supervised: /goal smoke test passed, runner + permissions written) |
| T001 | `engine/` skeleton + `color.js`: parse all CSS color syntaxes incl. `color-mix` fallback, sRGB↔OKLCH, WCAG contrast ratio | — | ≥40 unit cases incl. edge syntaxes; contrast matches WCAG reference values ±0.01 | `npm test` | done (2026-10-18, supervised: `npm test` 62/62 pass after fixing 2 engine bugs (OKLab inverse precision, half-byte rounding) and 1 wrong expected value; evidence: activity.md) |
| T002 | Xcode multiplatform Safari Web Extension project (iOS + macOS targets, App Group, bundle IDs `app.rarecreatures.sunglassesatnight.*` placeholder pending B1/B7), build phase copies `engine/src` | — | both schemes build with 0 errors; extension loads in Safari (Mac, unsigned dev mode) | CLAUDE.md Swift build rows | done (2026-10-18, supervised: macOS + iOS Simulator builds SUCCEEDED with CODE_SIGNING_ALLOWED=NO, engine copied into appex; evidence: ralph/evidence/build-*.log. 'Loads in Safari' moved to T016 manual check) |
| T003 | `settings.js`: defaults, schema validation, migration v0→v1, storage wrapper | T001 | invalid values rejected/clamped; round-trip tests | `npm test` | done (2026-10-17, evidence: `npm test` 100/100 pass (38 new settings cases) in activity.md; `engine/src/settings.js`, `engine/test/settings.test.js`) |
| T004 | `activation.js`: mode × per-site rule × system scheme × schedule → on/off | T003 | truth-table tests incl. schedule crossing midnight, DST boundary, equal start/end | `npm test` | done (2026-10-17, evidence: `npm test` 128/128 pass (28 new activation cases) in activity.md; `engine/src/activation.js`, `engine/test/activation.test.js`) |
| T005 | `transform.js`: bg/fg/border mapping in OKLCH preserving hue; sliders; presets; **min-contrast enforcement ≥4.5:1** for text-on-bg pairs | T001 | property test: 10k random pairs → output ratio ≥4.5; slider identity at defaults | `npm test` | done (2026-10-17, evidence: `npm test` 153/153 pass (25 new transform cases incl. two 10k-pair contrast properties and slider identity) in activity.md; `engine/src/transform.js`, `engine/test/transform.test.js`) |
| T006 | `early.js` anti-flash + `detect.js` already-dark decision (color-scheme meta, root bg luminance) | T004, T005 | decision unit tests; sheet removed when site dark | `npm test` | done (2026-10-17, evidence: `npm test` 191/191 pass (38 new detect/early cases incl. fake-DOM sheet removal on dark sites) in activity.md; `engine/src/detect.js`, `engine/src/early.js`, `engine/test/detect.test.js`) |
| T007 | Dynamic engine: CSSOM rules, inline styles, `MutationObserver`, shadow roots, cross-origin sheet re-fetch via background | T005, T006, T002 | fixture pages render dark; no element gets `pointer-events` changes or overlays | T012 command (or manual Safari with screenshots if B12 refused) | done (2026-10-18, runner e2e at HEAD 8ecdafb: `ℹ tests 7 ℹ pass 7 ℹ fail 0`, evidence: ralph/evidence/e2e-latest.md, t007-e2e.json, t007-*-{before,after}.png; plus owner Safari check on wikipedia.org + citizenfreepress.com) |
| T008 | Filter fallback engine + per-site engine choice; image modes; hide bg images | T007 | fixture images not double-inverted; toggling engines without reload | same | done (2026-10-17, runner e2e at HEAD 3dd86e4: all 5 `e2e/filter.test.js` cases pass (media as authored in filter engine, not double-inverted; dim + hide bg in both engines; dynamic→filter→dynamic in 10 ms / 9 ms, same document, no reload); the run's 1 failure is T010's popup test, not T008; evidence: ralph/evidence/e2e-latest.md, t008-e2e.json, t008-*.png) |
| T009 | `background.js`: settings broadcast, toolbar icon state, Mac `commands` shortcut | T003, T002 | storage change reaches open tabs < 200 ms; shortcut toggles | unit tests + manual Safari | done (2026-10-18: unit half `npm test` 233/233 + owner manual Safari check 02:30Z: Option+Shift+N toggles, badge reads "off" when off and is empty when on (by design), hover title reads on/off; Settings shortcut listing not reported; evidence: activity.md) |
| T010 | Popup (S05) + options page (S06) with tokens; edit-time `fixing-accessibility` | T009 | all controls native; names on icon buttons; restricted-page state | manual + T015 | done (2026-10-18: automated checks + owner Safari check 07:41Z on build 9d9d35f: "This site" section shows, Never dark turns Wikipedia light and persists. Earlier "stuck dark" was Safari still running the previous build's extension until it was unticked and re-ticked; empty-tab state not separately reported) |
| T022 | Popup host fallback for Safari (blueprint fix 1): `TAB_STATE` carries `host`; background stores per tab; popup uses tab.url → report.host → lastFocusedWindow query; restricted only when all empty; no new permission | T009 (popup code already exists) | unit tests cover all 4 source combinations; WebKit popup e2e passes with `tab.url` undefined and a stored host; manifest permissions unchanged | `npm test` + runner e2e | done (2026-10-18: `npm test` 294/294 pass incl. engine/test/popup-host.test.js (4 source combinations, manifest permissions unchanged); runner e2e 06:31Z: "popup in Safari: tab.url undefined, host comes from the stored report" ✔ and "popup with no tab.url and no stored host is restricted" ✔; evidence: ralph/evidence/e2e-latest.md, t010-e2e.json; the run's 1 failure is T013's perf test, not T022) |
| T029 | **Fix the 0.5–2 s white pop-in on heavy sites like amazon.com** (owner report 2026-10-18 16:52Z, real Safari, Mac in dark mode). Opus analysis (blueprint fix 5): the base sheet only darkens `html`/`body`; Amazon's own containers paint white backgrounds and stay white until the dynamic engine starts. It starts only after the whole HTML is parsed (`whenParsed`), then re-fetches cross-origin sheets. Fix: (1) the interim sheet (manifest `base.css` for system dark, plus the early JS sheet for mode always) also neutralizes element backgrounds while loading: `:root:not([data-sunglasses-off]):not([data-sunglasses-ready]) body *:not(img,picture,video,canvas,svg,iframe,embed,object)` → background-color transparent, light text/borders, `!important`; (2) the content script sets `data-sunglasses-ready` on `<html>` in the same task the engine's first override sheet is in place, which removes the interim rule; (3) start the dynamic engine on stylesheets as they arrive (`<link>`/`<style>` insertion observer from document start) instead of waiting for full parse; (4) cache the rewritten CSS per sheet URL in the background (session memory, LRU), not just the raw text. Media stays untouched throughout | T007 (builds on the shipped base sheet) | new WebKit fixture `heavy-grid.html`: cross-origin sheets with white containers served after a 1500 ms delay, plus a 300 ms settings read. Sampled every animation frame from first paint until the engine is ready: no frame where >2% of viewport pixels have OKLCH L > 0.9, excluding image boxes; once ready, all T012 checks still pass; images never inverted/faded; with mode off or a never site, the interim rule never applies after settings arrive. Then rebuild the owner copy and the owner re-checks amazon.com | runner e2e + owner check | blocked (B33: implemented, `npm test` 308/308; needs `npm run e2e` outside the sandbox for e2e/t029.test.js, evidence ralph/evidence/t029-e2e.json, plus the owner's amazon.com re-check) |
| T023 | Fix the first-paint white flash in real Safari (blueprint fix 2): synchronous dark base sheet before any await, removed in the same task when off/already-dark | T006, T007 | Opus decision on B22 (option a, refined): a manifest-declared `css` file (Safari injects it before first paint, no JS) paints a dark base only under `@media (prefers-color-scheme: dark)` and `:root:not([data-sunglasses-off])`; the content script sets `data-sunglasses-off` the moment settings say off / never / already-dark, and keeps the existing synchronous JS sheet for mode "always" with a light system. Accepted tradeoff, documented in replica/README.md: when the system is dark and the page should stay light (mode off or a "never" site), a dark base may show for at most the settings-read latency. Acceptance: WebKit e2e with settings read delayed 300 ms: first rendered frame not white on all 10 T012 fixtures with system dark; with system light + mode off, no dark frame at all; transient-dark duration with system dark + mode off measured and ≤ settings-read latency + 1 frame; owner re-check on amazon.com | runner e2e | needs owner check (B28; implemented 8031941, runner e2e 68/68 incl. all T023 delayed-settings cases after the supervisor fixed the harness stand-in for manifest css; owner re-checks amazon.com in the rebuilt copy) |
| T024 | Cut style-recalc cost of generated override CSS (blueprint fix 3), measured | T013 | new perf metric `gridInsertRecalc`: forced-style-recalc time during the insert storm with engine ≤ 2× without engine (median of 3); generated rule count on the product-grid fixture reduced ≥ 50% vs 2026-10-18 baseline; all T012 e2e still pass | runner e2e (perf) | pending |
| T025 | Keep authored dark islands as authored; keep palette swatches distinct (blueprint fix 4) | T005, T007 | hard-cases fixture gains a dark box on a light page (stays within ΔE 5 of authored, text still ≥4.5:1) and a 48-swatch palette (after transform, no two swatches that differed by ΔE ≥ 10 end up within ΔE 3; lightness order preserved); all T012 e2e still pass | `npm test` + runner e2e | done (2026-10-18: `npm test` 302/302 incl. engine/test/island-palette.test.js; runner e2e at HEAD 17ff696 (07:09Z): `ℹ tests 39 ℹ pass 39 ℹ fail 0`, incl. "hard-cases: every text node ≥ 4.5:1, buttons clickable" which asserts island ΔE ≤ 5, island text ≥ 4.5:1, 48 swatches with no ΔE≥10 pair collapsing below ΔE 3 and lightness order kept; evidence: ralph/evidence/e2e-latest.md, e2e-latest.log, t012-e2e.json (islandPalette), t012-hard-cases-{before,after}.png, activity.md) |
| T027 | Rename the user-facing product name to **Sunglasses for Safari** (owner 2026-10-18; chosen over "Safari Sunglasses" to follow Apple's "… for Safari" trademark pattern) across app display names (`CFBundleDisplayName`, `PRODUCT_NAME` of app + extension), manifest `name`/`short_name`/`description`, popup/options/app copy, docs (PRODUCT.md keeps the sunglasses-for-white-pages joke), Xcode scheme names (keep the ` (macOS)` / ` (iOS)` suffixes, which the runner discovers) and CLAUDE.md commands. Bundle IDs, App Group, repo and folder stay `sunglassesatnight` / `sunglasses-at-night`. Don't edit ralph/*.sh | T025 | no old name in shipped files (Replica brand sweep clean for "Sunglasses at Night"); both Swift builds succeed under the new scheme names; e2e + unit tests pass | sweep + runner builds + runner e2e | done (2026-10-18 supervisor: `grep -rn "Sunglasses at Night"` over Extension, App, Shared, Config, engine/src, xcodeproj, docs/site, PRODUCT.md → 0 hits; Replica `sweep.py --avoid "Sunglasses at Night,…"` hits are only the internal identifiers kept by decision (bundle/App Group IDs, target names, `data-sunglasses-at-night` attribute); runner builds under the new schemes SUCCEEDED, Swift 15/15, e2e 68/68 at 08:5xZ) |
| T028 | macOS container app gets out of the way (owner 2026-10-18: no lingering icon in ⌘-Tab): quit when the last window closes (`applicationShouldTerminateAfterLastWindowClosed`); show extension state via `SFSafariExtensionManager.getStateOfSafariExtension`; once enabled, show a short "You're set, you can close this" state with a Quit/Done button; no login item, no background agent, no menu-bar extra. Keep it a normal app (no `LSUIElement`), so onboarding and App Review behave normally | T002 | Swift unit/UI test: closing the window terminates the app; state view switches when the extension reports enabled (mocked); macOS build succeeds | runner Swift build/tests | done (2026-10-18 supervisor/Opus: B30 decided, the delegate-level test (`applicationShouldTerminateAfterLastWindowClosed` → true) plus the mocked state switch is sufficient; no UI test target. Fixed a Swift 6 data-race build error in Shared/ExtensionStatusModel.swift (@MainActor model, @Sendable completion). Runner: both builds SUCCEEDED, ContainerAppTests 4/4, total 15/15. Owner sees it in the rebuilt test copy) |
| T026 | Phase 3B design directions (new /new-app): `/impeccable shape` on the core screen (toolbar popup + container app Settings), 3 distinct worlds in `design/concepts/{a,b,c}` sharing one state module, screenshots 1440×900 + 390×844 via the runner's Playwright step, `/impeccable critique` → one fix batch → `/impeccable audit` per concept, `docs/design/{directions,critique}.md`; Opus writes `comparison.md`. **Stop for owner approval** | T027, T028 (names and app behavior settled first) | all files present; screenshots exist for each concept and size; Impeccable output present in logs | manual review | pending (B23: impeccable script now allowed; `/impeccable shape` runs unattended per Impeccable's rule: infer from PRODUCT.md, label assumptions; the owner still approves the direction) |
| T011 | Report a problem → `mailto:` with hostname, version, settings; no auto-send | T010, T026 | draft opens with exactly those fields; nothing transmitted by the extension | unit test on URL builder | pending |
| T012 | E2E on WebKit with 8 fixture pages (light, already-dark, inline styles, SPA mutations, images, cross-origin sheet, links, shop buttons) **plus an original "hard cases" fixture modeled on the categories of https://webbrowsertools.com/darkmode/ (owner request 2026-10-18; write our own page, don't copy theirs): images in links/figures and in 1–3 nested iframes; images with opacity / long transition / `all: revert` / `filter: none`; url() and data: background images; picture/source, canvas, embed, object; every input type + textarea + button; about:blank iframe; white-on-dark and dark-on-white text; a background-color palette; font-smoothing on/off**. Images must not be inverted, hidden or faded | T007, T008 | every visible text node ≥4.5:1; first paint not white; all buttons clickable; screenshots in `ralph/evidence/` | `npm run e2e` | done (2026-10-18, runner e2e at HEAD 2a8ec48 (04:28Z): all 20 `e2e/t012.test.js` cases ✔ (10 fixtures × readable+clickable / first paint not white); hard-cases: 60 top-level text nodes min ratio 4.50, about:blank + 3 nested frames dark and readable, 8/8 buttons clickable, all 19 media probes match authored pixels after the extension runs (not inverted, hidden or faded). The run's 1 failure is T013's uncommitted perf test, not T012. Evidence: ralph/evidence/e2e-latest.md, t012-e2e.json, t012-*.png) |
| T013 | Performance budget, **incl. a synthetic Amazon-style product-grid fixture** (owner report 2026-10-18: amazon.com search grids get very laggy). Original markup, no Amazon code/assets: ~60 product cards, each with image + srcset, price, rating stars, badges, sponsored labels; 15+ stylesheets with ~5,000 rules incl. many color declarations; nested carousels; lazy-loaded images swapped in on scroll; ~200 DOM mutations/s for 5 s (ads/recs inserts, attribute flips) | T007 | 5,000-node fixture: initial pass ≤ 50 ms median, mutation batch ≤ 8 ms on this Mac; product-grid fixture: no engine task > 50 ms after first paint, engine share during the 5 s mutation storm ≤ 10%, and **rAF gap max with engine ≤ rAF gap max of the same fixture without engine in the same run + 8 ms, taking the median of 3 runs** (owner-accepted 2026-10-18, replacing the absolute 32 ms that mostly measured headless WebKit jitter); numbers in ralph/evidence/t013-perf.json | `npm run perf` | blocked (B32: runner perf at e9cc01a fails gridStormRafGapMax, median 32 ms with engine vs 20 ms without, limit 28; other 4 budgets pass; evidence: ralph/evidence/t013-perf.json, e2e-latest.md) |
| T014 | Native messaging bridge: App Group mirror, Reset all (both stores) | T002, T003 | Swift unit tests; reset clears both | Swift tests row | done (2026-10-17, evidence: runner Swift tests `** TEST SUCCEEDED **`, SettingsBridgeTests 11/11 incl. both reset-clears-both cases, at HEAD c0e4c30 in `ralph/evidence/swift-build-latest.md` + `ralph/evidence/test-macOS.log`; `npm test` 239/239 native-reset cases in `engine/test/background.test.js`; activity.md) |
| T015 | SwiftUI app S01–S04 + accessibility (VoiceOver labels, Dynamic Type XXXL, Full Keyboard Access, Reduce Motion) | T014, T026 | `ios-accessibility` checklist pass; popup keyboard pass | Swift build + manual evidence | pending |
| T016 | Platform runs: macOS Safari, iPhone sim, iPad sim (incl. compact tab bar popup, R13) | T010, T015 | screenshots per platform in `ralph/evidence/` | `xcrun simctl` + manual | pending |
| T017 | Original **minimalist sunglasses** app icon (owner 2026-10-18) + Safari toolbar icons (template-style, light/dark), generated, no third-party art; no moon/purple (R15); also used in Safari's extension list and the App Store | T002, T026 | asset rows in `docs/asset-licenses.md` | build | pending |
| T018 | DRAFT privacy policy, minimal terms, support page (`docs/site/`, not hosted) + in-app copy; marked "Draft for legal review" | T007, T014 | every statement maps to a data-inventory row | manual cross-check table | done (2026-10-18: manual cross-check, 16 rows, 0 unmapped data statements; legal fields left as placeholders under B1/B2/B6/B8; evidence: docs/site/claims-map.md, docs/site/{privacy,terms,support}.html, docs/site/in-app-copy.md, activity.md. Not verified by running code: Bash was unavailable this session. In-app copy is wired into S04 by T015) |
| T019 | Privacy verification: static no-network test (no `fetch`/XHR/WebSocket/`URLSession` except the T007 same-origin re-fetch), manifest permission allowlist test, no StoreKit, `npm audit` | T007, T008, T009, T014, T022 | test fails on any new network API or permission | `npm run privacy-check` | done (2026-10-18 supervised, outside sandbox: `npm run privacy-check` → `ℹ tests 17 ℹ pass 17 ℹ fail 0` incl. `npm audit: no known vulnerabilities`; the mailto half of B24 still waits on T011) |
| T020 | Sweeps: claims, dark patterns, Replica brand leftover sweep (no "Noir", "Dark Reader", "Midnight", "Dark Eyes"), App Store listing draft + lint | T018 | sweep clean; listing within store limits; every claim has an evidence row | `replica-brand` sweep tool, `replica-launch` lint | on hold (owner 2026-10-18 16:52Z: park the App Store listing work; resume only when the owner says so) |
| T021 | Phase 5–6: fill `docs/compliance-checklist.md`, audits, Gate A report | all | 20 rows with evidence paths | report | pending |

## Safeguard coverage

Every row in `docs/compliance-checklist.md` maps to a task above, or has a NOT APPLICABLE reason (3, 5, 6, 10, 18) based on the app's behavior: free, no tracking, no forms, no email sending.

## Permission changes (need approval)

Project `.claude/settings.json`, adapted from the Ralph quickstart but narrower:

- allow: `Bash(node --test:*)`, `Bash(node --check:*)`, `Bash(npm run check|test|e2e|perf|privacy-check:*)`, `Bash(xcodebuild:*)`, `Bash(xcrun simctl:*)`, `Bash(git status|diff|log|add|commit:*)`
- ask: `Bash(npm install:*)`, `Bash(git push:*)`
- deny: `WebFetch`, `Bash(curl:*)`, `Bash(wget:*)`, `Bash(sudo:*)`, `Bash(rm -rf:*)`, `Read(./.env*)`, `Read(~/.ssh/**)`
- sandbox on; `autoAllowBashIfSandboxed` **off** (upstream has it on)
- `defaultMode: acceptEdits`

Other approvals requested:
1. **B12:** add `playwright` as a dev-only dependency (WebKit engine, Apache-2.0) for T012. If you say no, T012 falls back to manual Safari checks with screenshots, which is weaker evidence for the contrast claim.
2. **B10 (optional):** install Chromium so REA can capture public reference pages.
3. **B11 (optional):** install the Caveman skill.
4. Execution cost cap per Ralph run. The skill requires asking. Proposal: 10 iterations × ≤5 `/goal` turns, stop after 2 iterations without progress.

## Human review and launch blockers

See `docs/launch-blockers.md` (B1–B12). Building is approved (2026-10-18). Blockers for release (Gate B): B1–B9.
