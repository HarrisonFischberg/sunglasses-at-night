# Activity log

## 2026-10-17 — scaffold

- Created project skeleton under the `new-app` skill.
- Next: Phase 0 intake and tool-environment verification.

## 2026-10-18 — Phase 0–3 (plan only, no product code)

- Intake answered by owner: name Sunglasses at Night, macOS+iOS/iPadOS, refs Noir / Dark Reader / Midnight, private repo, free, global, hello@rarecreatures.app, youngest age.
- Tools: `docs/tool-environment.md` (Caveman BLOCKED, REA web capture BLOCKED: no CDP browser).
- Discovery: public listings only → `docs/rea-findings.md`, `replica/`.
- Wrote prd.md DRAFT v1, data inventory, checklist (pre-build), blockers B1–B12.
- Ralph runner adapted at `ralph/ralph.sh`; refuses to run until prd.md says APPROVED.
- Next: owner approval of prd.md + permission changes.

## 2026-10-17: T001 color engine (Ralph iteration). BLOCKED (B13)

- Goal: T001 acceptance criteria (≥40 unit cases incl. edge syntaxes; WCAG contrast ±0.01), proven by `node --test engine/test/`.
- Wrote:
  - `engine/src/color.js` (ESM). Parses hex, the 148 named colors, transparent, currentcolor (via `opts.currentColor`), rgb/rgba, hsl/hsla (legacy + modern syntax), hwb, lab, lch, oklab, oklch, and color() in srgb, srgb-linear, display-p3, a98-rgb, prophoto-rgb, rec2020, and xyz/xyz-d50/xyz-d65. Also handles `none`, angle units, calc(), relative color syntax (`from`), light-dark(), and color-mix() with hue methods, premultiplied alpha and missing components. A var(), system-color or unresolvable operand returns `opts.fallback`. Also does sRGB↔OKLCH, CSS Color 4 gamut mapping, WCAG relative luminance + contrast with alpha compositing, and formatRgb/formatHex.
  - `engine/test/color.test.js`: 62 `test()` cases (52 + 10 WCAG reference rows).
  - `engine/scripts/check.js` for `npm run check`.
- Verification: **not run.** `node --test engine/test/` → "This command requires approval". The same refusal came for `npm test`, `node engine/scripts/check.js` and `rtk proxy node --test engine/test/`, despite the allow rules in `.claude/settings.json`. Logged as B13. Zero verification runs completed, so the 5-attempt budget is untouched. Nothing is claimed passing.
- Note for T020 sweep: the CSS named color `midnightblue` in `color.js` is a standard keyword, not reference branding. Expect a false positive on "Midnight".
- Note for T007: the engine is ESM. Content scripts will need a dynamic `import(runtime.getURL(...))` or a build step.
- Next: owner fixes B13 (allowlist vs RTK rewrite), then rerun `node --test engine/test/` and set T001 done or fix failures.

## 2026-10-17: T002 Xcode project (Ralph iteration). BLOCKED (B14)

- Goal: T002 acceptance criteria (both schemes build with 0 errors; extension loads in Safari on the Mac, unsigned dev mode), proven by the CLAUDE.md Swift build rows.
- Wrote the project by hand. `safari-web-extension-packager` needs approval, so the template wasn't used.
  - `SunglassesAtNight.xcodeproj` (objectVersion 77). Targets: `Sunglasses at Night (iOS)`, `Sunglasses at Night (macOS)`, `Sunglasses at Night Extension (iOS)`, `Sunglasses at Night Extension (macOS)`. Shared schemes `Sunglasses at Night (iOS)` and `Sunglasses at Night (macOS)` match the CLAUDE.md names. Each app embeds its extension (PlugIns) and depends on it.
  - Bundle IDs (placeholders pending B1/B7): app `app.rarecreatures.sunglassesatnight`, extension `app.rarecreatures.sunglassesatnight.extension`. App Group `group.app.rarecreatures.sunglassesatnight` in all 4 entitlements (`Config/*.entitlements`). macOS adds app-sandbox and hardened runtime. Signing is ad-hoc (`CODE_SIGN_IDENTITY = "-"`, Manual, no team) until B7.
  - Deployment targets: iOS 16.0, macOS 13.0, Swift 6.0.
  - Extension run-script phase "Copy Web Extension Resources and engine/src": `ditto Extension/Resources` → bundle resources root, and `engine/src` → `<resources>/engine/`. User-script sandboxing is off for the extension targets only, because the phase writes into the bundle.
  - `App/` (synchronized group shared by both apps): `SunglassesAtNightApp.swift`, `ContentView.swift` (placeholder; S01–S04 come in T015). `Extension/SafariWebExtensionHandler.swift` (acknowledges messages; the bridge comes in T014). `Extension/Resources/manifest.json` (MV3, no permissions yet). `Config/Extension-Info.plist` (NSExtension `com.apple.Safari.web-extension`).
- Commands and real results:
  - `xcodebuild -list -project SunglassesAtNight.xcodeproj` → OK: 4 targets, configs Debug/Release, schemes `Sunglasses at Night (iOS)` and `Sunglasses at Night (macOS)`.
  - Attempt 1/5: `xcodebuild -scheme "Sunglasses at Night (macOS)" -destination 'platform=macOS' -derivedDataPath build/DerivedData build` → exit 65, `** BUILD FAILED **`, "Build Preparation: Couldn't create workspace arena folder '…/build/DerivedData': Unable to write to info file '…/info.plist'". The default DerivedData in `~/Library` is unwritable too (shown by `-list`).
  - Attempt 2/5: same scheme with `-derivedDataPath "$TMPDIR/san-dd"` → exit 65, same Build Preparation error. Nothing was compiled, so the Swift sources have **not** been type-checked.
  - The iOS build row was not attempted. It would hit the same arena error, and CoreSimulatorService is unreachable ("Simulator device support disabled").
  - `plutil -lint …` and `xcrun swiftc -parse …` → "This command requires approval". Compound or piped commands are refused as well.
- Stopped after 2 of 5 attempts. The failure comes from the environment, not the project, so more attempts can't succeed. Logged as B14. Nothing is claimed passing.
- Next: owner fixes B14 (or runs both CLAUDE.md Swift build rows by hand), then loads the macOS app in Safari with Develop ▸ Allow Unsigned Extensions. If it builds, update the CLAUDE.md table with any `-derivedDataPath` change.

## 2026-10-18 — supervised fix after Ralph run 1 (2 iterations, $3.84)

- Run 1: T001 and T002 code written, both marked blocked (B13 permissions, B14 Xcode sandbox).
- Root causes: untrusted workspace → project allow rules ignored; RTK hook rewrites `xcodebuild` → sandbox exclusion misses; `node --test engine/test/` (directory) fails on Node 24.
- `npm test` → 57/62 at first. Fixed: OKLab inverse matrices now computed (round-trip ≤1e-9), byte rounding epsilon for exact halves (hsl/hwb 127.5→128), test expectation 3.95→3.98 for 50% black over white (composite is 127.5, not #808080). Result: `ℹ tests 62 ℹ pass 62 ℹ fail 0`.
- Xcode: macOS + iOS Simulator builds `** BUILD SUCCEEDED **` with `CODE_SIGNING_ALLOWED=NO` (signing requires B7). Logs: `ralph/evidence/build-*.log`.
- Runner changes: `--settings .claude/settings.json`, `ralph/verify-swift.sh` around each iteration, `needs-runner-build` status.

## 2026-10-17: T003 settings model (Ralph iteration). DONE

- Goal: T003 acceptance criteria (invalid values rejected/clamped; round-trip tests), proven by `npm test`.
- Wrote:
  - `engine/src/settings.js` (ESM, no deps, no network). Schema v1: `mode` (system/always/schedule/off), `schedule` {start, end} as `HH:MM`, `look` {brightness 50–150, contrast 50–150, sepia 0–100, grayscale 0–100}, `images` (leave/dim/no-invert), `hideBackgroundImages`, `detectDark`, `engine` (dynamic/filter), `sites` {hostname → {rule default/always/never, optional look/engine/detectDark overrides}}.
  - Validation: invalid enums, booleans, times and non-numeric sliders are rejected and fall back to defaults. Numeric sliders are clamped and rounded. Unknown keys are dropped. Hostnames are normalized (lowercase, trailing dot removed) and invalid ones rejected. Entries that only inherit are pruned. Sites are capped at 5,000. Every problem is reported as a "path: reason" string. `__proto__` keys don't pollute prototypes.
  - Migration: v0 = the unversioned pre-release layout (`enabled` boolean, sliders at the top level, `sites` host → 'dark'/'light'), migrated to v1. A future or garbage `version` resets to defaults. Migration is idempotent.
  - Storage wrapper `createSettingsStore(area)` with load (migrates, and writes back only when something changed), save (validates before writing), update (merges look/schedule one level deep), setSite, reset and subscribe (onChanged → validated settings). There is also `createMemoryArea()` for tests, and `resolveSite()` for per-site overrides.
  - `engine/test/settings.test.js`: 38 cases, including a 500-input randomized fixed-point round-trip and a save → load round-trip through the storage wrapper.
  - `docs/data-inventory.md`: the settings row now lists the new fields. The data flow is unchanged (on-device `browser.storage.local`).
- Verification, attempt 1/5: `npm test` → `ℹ tests 100 ℹ pass 100 ℹ fail 0` (62 color + 38 settings). `npm run check` → `node --check: 2 file(s) OK`.
- No Swift changes, so no runner build is needed.
- Note for T004: equal schedule start and end are stored as given, and activation.js decides what they mean. `timeToMinutes()` is exported.
- Note for T014: the App Group mirror should store the same validated v1 object.

## 2026-10-17: T004 activation decision (Ralph iteration). DONE

- Goal: T004 acceptance criteria (truth-table tests incl. schedule crossing midnight, DST boundary, equal start/end), proven by `npm test`.
- Wrote:
  - `engine/src/activation.js` (ESM, pure, no DOM/network). `decide({ settings, hostname, systemDark, now, timeZone })` → `{ on, reason }`, plus `isActive`, `isInSchedule`, `inWindow` and `localMinutes`. Precedence: mode `off` is the master switch and beats every site rule; then site `never` → off; site `always` → on; then mode `always` → on, `system` → on only when `systemDark === true`, `schedule` → on inside the window.
  - Schedule semantics: local wall-clock minutes, start inclusive and end exclusive. start > end crosses midnight. **start === end is an empty window (never on)**, and "all day" is mode `always`. DST needs no special case: a skipped start time (02:30 on spring-forward day) takes effect at 03:00, and on fall-back day the repeated hour is evaluated by its wall-clock reading both times. An optional IANA `timeZone` (via `Intl.DateTimeFormat`) makes the tests independent of the host zone. Without it, the runtime's local clock is used.
  - `engine/test/activation.test.js`: 28 cases. They cover the full 4 modes × 3 site rules × system dark/light × in/out-of-window truth table (48 combinations in 12 tests, plus a coverage check), reasons, hostname normalization, midnight crossing at every boundary, 00:00 edges, equal start/end at all 1,440 minutes, America/New_York spring-forward and fall-back, Europe/London spring-forward, and invalid input.
- Verification, attempt 1/5: `npm test` → `ℹ tests 128 ℹ pass 128 ℹ fail 0` (62 color + 38 settings + 28 activation). `node --test engine/test/activation.test.js` → `ℹ tests 28 ℹ pass 28 ℹ fail 0`. `npm run check` → `node --check: 3 file(s) OK`.
- No Swift changes, so no runner build is needed.
- Owner decision worth confirming (not a blocker): equal start/end = never on, and global Off overrides per-site "Always dark". Both are documented in the `activation.js` header and pinned by tests.
- Note for T009: the background script has to re-evaluate when the schedule crosses a boundary (e.g. a 1-minute `alarms` tick, or the next boundary computed from `schedule`) and when `prefers-color-scheme` changes.

## 2026-10-17: T005 color transform (Ralph iteration). DONE

- Goal: T005 acceptance criteria (property test: 10k random pairs → output ratio ≥4.5; slider identity at defaults), proven by `npm test`.
- Wrote:
  - `engine/src/transform.js` (ESM, pure, no DOM/network). `transformColor(color, role, look)` for roles `bg`/`fg`/`border`: OKLCH lightness is inverted into a per-role band (bg 0.19–0.42, fg 0.72–0.94, border 0.32–0.50), chroma is scaled and capped, hue is kept, alpha is kept. Out-of-gamut results lose chroma only. color.js's CSS gamut mapping clips within a just-noticeable difference, which turned hue by up to ~10° at low L, so transform uses its own chroma-only reduction.
  - Sliders act in OKLCH: grayscale scales chroma, sepia blends toward amber (h 70°, C 0.06), contrast scales L around 0.5, brightness scales L. Each step is skipped at its default, so the default look is an exact no-op. `normalizeLook` clamps/rounds like the settings schema (reuses `LOOK_RANGES`).
  - 4 original presets: `standard`, `soft`, `warm`, `mono`.
  - `ensureContrast(fg, bg, { min = 4.5, canvas })` moves only text lightness (toward white or black, whichever has more headroom) by binary search. Translucent text that can't reach the target is made opaque. A translucent bg is composited over `canvas`. Candidates are snapped to `formatRgb` precision (`quantize`) and must pass against both the exact and the 8-bit backdrop. The returned color is always a verified one. `transformPair(fg, bg, { look, canvas, min })` → `{ fg, bg, backdrop }` (default canvas = mapped page white).
  - `engine/test/transform.test.js`: 25 cases. Includes a 10,000-pair property over random fg/bg (25% translucent) × random looks via `transformPair`, measured after a `formatRgb` → `parseColor` round-trip; a 10,000-pair property over raw `ensureContrast` with light and dark backgrounds; slider identity (1,000 colors × `applyLook` and × 3 roles of `transformColor` at defaults, deep-equal); hue preservation; presets; sliders; edge cases.
- Verification:
  - Attempt 1/5: `npm test` → `ℹ tests 153 ℹ pass 150 ℹ fail 3`. The 10k `transformPair` property passed. Failures: raw `ensureContrast` worst 4.472 (checked against the unquantized bg, not the 8-bit one the browser renders), and two hue-preservation cases (gamut clipping shifted hue 9–10°). Fixed in the code (quantized backdrop check; chroma-only gamut reduction). Tests unchanged.
  - Attempt 2/5: `npm test` → `ℹ tests 153 ℹ pass 152 ℹ fail 1`. A composited 50% white-over-black backdrop (127.5) passed at 8-bit but not exactly. Fixed in code: candidates must pass both. Test unchanged.
  - Attempt 3/5: `npm test` → `ℹ tests 153 ℹ pass 153 ℹ fail 0` (62 color + 38 settings + 28 activation + 25 transform). `npm run check` → `node --check: 4 file(s) OK`.
- No Swift changes, so no runner build is needed.
- Note for T007: pass the real underlying color as `canvas` for translucent backgrounds when it's known. The guarantee is against `backdrop`. Write colors with `formatRgb` so the 8-bit check holds.
- Note for T012: the property tests cover the math only. The ≥4.5:1 product claim still needs the WebKit fixture run.

## 2026-10-17: T006 anti-flash + already-dark detection (Ralph iteration). DONE

- Goal: T006 acceptance criteria (decision unit tests; sheet removed when site dark), proven by `npm test`.
- Wrote:
  - `engine/src/detect.js` (ESM, pure, no DOM/network). `parseColorScheme`, `usedColorScheme({ css, meta, systemDark })` (root computed `color-scheme` beats the meta tag; "light dark" follows the system; none = light). `detectAlreadyDark({ rootBg, bodyBg, rootColor, bodyColor, colorScheme, metaColorScheme, systemDark })` composites body bg over root bg over the canvas (white, or ~rgb(30 30 30) when the used scheme is dark) and returns dark when WCAG luminance < `DARK_LUMINANCE` (0.1, about rgb(89 89 89)) **and** the text is lighter than the background (dark text on a darkish page still gets the readability fix). No readable bg → the used scheme decides. `finalDecision({ activation, detectDark, detection })` → `{ apply, reason }`.
  - `engine/src/early.js` (DOM injected). `startEarly({ document, getComputedStyle, settings, hostname, systemDark, now, timeZone })` runs `activation.decide` at document_start and, when on, appends `<style id="sunglasses-at-night-early">` (to head, or the root if there's no head yet). `antiFlashCss(look)` sets only `color-scheme`, `background-color` and `color` (page white/black mapped through transform.js, contrast enforced). Nothing touches layout, pointer events or overlays. `finish()` measures the page with the sheet switched off (`media="not all"`, restored synchronously) and removes the sheet when the site is already dark and the resolved (per-site or global) `detectDark` is on. It's idempotent. `whenParsed(document, fn)` runs on DOMContentLoaded.
  - `engine/test/detect.test.js`: 38 cases. They cover color-scheme parsing and precedence; 19 detection cases (white, dark body/root, root-vs-body coverage, oklch, mid-gray, dark text on darkish bg, translucent bgs, dark canvas via CSS/meta, meta contradicted by a white page, light-dark × system, unreadable colors); the threshold; the `finalDecision` table; anti-flash CSS (dark, ≥4.5:1, colors only, follows the look); a fake DOM whose computed style reports the sheet's colors while the sheet is on, which proves measurement happens with it off. The fake-DOM cases check: sheet injected, sheet **removed on dark sites** (incl. a transparent page with meta `color-scheme: dark`), sheet kept and re-enabled on light sites, global and per-site `detectDark` overrides, site `never`, mode off, and idempotence.
- Verification, attempt 1/5: `npm test` → `ℹ tests 191 ℹ pass 191 ℹ fail 0` (153 previous + 38 detect/early). `npm run check` → `node --check: 6 file(s) OK`.
- No Swift changes, so no runner build is needed.
- Note for T007: `engine/src/*.js` are ES modules, and MV3 content scripts are classic scripts. T007 has to bundle `early.js` and its imports into a classic `content/early.js`, register it in `manifest.json` (`run_at: document_start`, `all_frames`), read settings synchronously enough for document_start, call `whenParsed(document, ctl.finish)`, and remove or replace the early sheet once the dynamic engine applies. Not registered in the manifest in this task, so nothing has loaded in Safari yet.

## 2026-10-17: T007 dynamic engine (Ralph iteration). BLOCKED (B15)

- Goal: T007 acceptance criteria (fixture pages render dark; no element gets `pointer-events` changes or overlays), proven by the T012 command `npm run e2e` on WebKit.
- Wrote:
  - `engine/src/dynamic.js`: `startDynamic({ document, window, look, fetchSheet })` → `{ stop, refresh, settle }`.
    - CSSOM: every readable sheet's style rules are rewritten (incl. @import, @media/@supports/@layer/@container/@scope blocks, CSS nesting). The results go into one override `<style>` kept last in the scope, with the same selectors, so source order and specificity still decide. Keyword values (inherit, currentcolor…) are copied verbatim so ordering stays exact. @keyframes and @page are skipped.
    - Custom properties: `--x: <color>` also defines `--san-{bg,fg,border}--x`, and `var(--x)` reads become `var(--san-<role>--x, var(--x))`. Gradients have every color stop rewritten; url()/strings are never touched.
    - Inline styles and `bgcolor` / `<font color>` / `<body text>`: `!important` rules keyed by `data-san-inline`. Inline `!important` declarations (which no sheet can beat) are rewritten in place, and the original is restored on `stop()`.
    - Contrast pass: any visible text still under 4.5:1 on its composited flat-tree background gets a `data-san-fix` rule (`ensureContrast`).
    - A MutationObserver per scope (childList/attributes) plus a 1 s poll for insertRule edits and late custom-element shadow roots. Open shadow roots are separate scopes; adopted sheets get `!important` copies.
    - Cross-origin sheets (cssRules throws) are fetched via `fetchSheet` and parsed in a detached document (nothing applies, nothing loads).
    - Only `<style>` elements and data attributes are added. No pointer-events, overlays or layout properties (unit-tested).
  - `engine/src/sheet-fetch.js` (background): http(s) only, no URL credentials, our content-script senders only, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'force-cache'`, text/css only, ≤ 4 MB, LRU 64. `engine/src/messages.js` holds the message type, so the content bundle has no fetch code.
  - `engine/src/content.js` (load settings → `startEarly` → at DOMContentLoaded `finish()` → remove the early sheet → `startDynamic`; restarts on settings change). `engine/src/background.js`.
  - `engine/scripts/bundle.js`: a zero-dependency ESM → classic-IIFE bundler, one function scope per module. Run by the new `pretest`/`pree2e` scripts. Outputs `Extension/Resources/content/engine.js` and `Extension/Resources/background.js`.
  - `manifest.json`: `storage`, host `<all_urls>`, `background.service_worker`, content script at `document_start` with `all_frames`.
  - Tests: `engine/test/dynamic.test.js` (14), `sheet-fetch.test.js` (6), `bundle.test.js` (5: bundles fresh, classic, compile; background registers one listener; no network APIs in the content bundle).
  - E2E: `e2e/harness.js` (two loopback origins; the bundled content script plus an API shim whose sendMessage reaches the real background handler), `e2e/page-audit.js` (an independent in-page audit), `e2e/dynamic.test.js`, and 7 fixtures (`light`, `inline`, `spa`, `shadow`, `cross-origin` + `cdn/`, `links`, `shop`). Each fixture loads once without and once with the engine. The test asserts: baseline light; root luminance < 0.1; every visible text element on a background with luminance ≤ 0.2 at ≥ 4.5:1; only `<style>` added; same element structure; identical computed `pointer-events`; every baseline-hittable control still hittable; real clicks/fill/select on the shop page; re-fetches only to the CDN origin. Writes `ralph/evidence/t007-e2e.json` and `t007-<fixture>-{before,after}.png`.
  - `docs/data-inventory.md`: a row for the cross-origin sheet re-fetch.
- Verification:
  - `npm test` → `ℹ tests 216 ℹ pass 216 ℹ fail 0` (191 previous + 25 new). `npm run check` → `node --check: 11 file(s) OK`.
  - `npm run e2e`, runs 1–2: no output, killed after ~10 min (WebKit hung at launch; rtk buffers output until exit).
  - Run 3 (probe with a 45 s launch timeout): `browserType.launch: Timeout 45000ms exceeded … sandbox_extension_issue_file_to_process failed for /Users/harrison/Library/Caches/ms-playwright/webkit-2370/Playwright.app: 1 (Operation not permitted) … Connection Invalid error for service com.apple.hiservices-xpcservice`.
  - Run 4 (Chromium probe, only to debug the harness): `Executable doesn't exist at …/chromium_headless_shell-1248/…`. Not installed, and a download isn't approved.
  - Run 5 (the real suite): all 7 fixture tests `✖ … browserType.launch: Timeout 180000ms exceeded`, with the same sandbox error. No page ever loaded.
  - Stopped at 5 runs. The failure is the sandbox, not the engine. Logged as **B15**. T007 is **blocked (B15)**, not done. The e2e suite and fixtures have never run, so first-run harness bugs are possible.
- Swift: only Extension resources changed (manifest, two new bundled JS files). The runner's next `verify-swift.sh` build will confirm they still copy into the appex.
- Next (owner): run `npm run e2e` in a normal terminal (or approve the runner step in B15), then paste the summary here. Fixing any harness/engine failures it shows is the next iteration's T007 work.

## 2026-10-17: T009 background.js (Ralph iteration). BLOCKED (B16, manual Safari)

- Goal: T009 acceptance (storage change reaches open tabs < 200 ms; shortcut toggles), proven by unit tests + manual Safari.
- Wrote:
  - `engine/src/background-core.js` (new): `createBackground({ api, fetch })` with the API injected. It pushes every settings write to all open tabs as `SETTINGS_CHANGED` (validated through `migrate`; a tab with no receiver doesn't stop the rest). It tracks per-tab toolbar state from top-frame `TAB_STATE` reports (title plus an "off" badge until T017 icons; navigation resets to "not running on this page"; closing a tab forgets it). The `toggle-dark-mode` command toggles the master switch `off` ↔ the previous mode, stored under the separate key `shortcutRestoreMode`, falling back to `always`. The T007 sheet handler is kept.
  - `engine/src/background.js`: now just wires the real API. `engine/src/messages.js`: `SETTINGS_CHANGED`, `TAB_STATE`.
  - `engine/src/content.js`: accepts `SETTINGS_CHANGED` (sender-checked, validated) and dedupes it against its own `storage.onChanged` with a JSON comparison, so there's one restart per write. The top frame reports `TAB_STATE` after each decision.
  - `Extension/Resources/manifest.json`: `action` (default title) and `commands.toggle-dark-mode` (Option+Shift+N on Mac, Alt+Shift+N elsewhere). No new permission.
  - Tests: `engine/test/background.test.js` (17 cases). `engine/test/bundle.test.js`: the background-bundle listener test now expects the T009 listeners (message, storage, tabs.onRemoved/onUpdated, commands), one each. New manifest test: action + Mac shortcut present, permissions still `["storage"]`.
- Verification:
  - `npm test` attempt 1 → 232/233. One failure was a fake-API bug in my test (`onChanged.ls` undefined), fixed in the fake, assertion unchanged.
  - `npm test` attempt 2 → **233 tests, 233 pass, 0 fail**. Includes "broadcast: a settings write reaches every open tab in < 200 ms" (50 fake tabs, real timing).
  - `npm run check` → `node --check: 12 file(s) OK`.
  - Swift: `ralph/evidence/swift-build-latest.md` (HEAD 378fa42) predates this manifest change. The runner's next build covers it.
- Not done: manual Safari (real tabs < 200 ms, Option+Shift+N toggles, toolbar title/badge). Agents can't open Safari or load the unsigned extension. Logged as B16 with exact steps. Row set to `blocked (B16)`, not done.
- Data flows: none new. `TAB_STATE`/`SETTINGS_CHANGED` are in-extension messages, nothing leaves the device.

## 2026-10-17: T014 native messaging bridge (Ralph iteration). NEEDS-RUNNER-BUILD

- Goal: T014 acceptance (Swift unit tests; reset clears both stores), proven by the CLAUDE.md "Swift tests" row.
- Wrote:
  - `Shared/SettingsBridge.swift` (new, compiled into both apps, both extensions and the test bundle via a synchronized `Shared` group). App Group `UserDefaults` mirror of the settings JSON (≤ 1 MB, objects only) plus a `resetGeneration` counter. Messages: `sync` (stores the mirror, but answers `reset: true` and does **not** store when the app has reset since the extension's last seen generation), `reset` (clears the mirror and bumps the generation), `get`. `resetAll()` is the app's Reset all.
  - `Extension/SafariWebExtensionHandler.swift`: routes `SFExtensionMessageKey` messages to `SettingsBridge.shared()`. Replies `app group unavailable` if the container can't be opened (e.g. unsigned).
  - `engine/src/background-core.js`: `syncNative()` on startup and after every settings write. A `reset: true` reply clears `browser.storage` (settings → defaults, shortcut restore key removed, generation stored first so the follow-up sync isn't reset again). `resetAll()` sends `reset` and then clears local, so both stores end up empty. With no native messaging or a failing host it no-ops.
  - `Extension/Resources/manifest.json`: adds the `nativeMessaging` permission (listed in the prd.md architecture).
  - Xcode: new macOS unit-test target `SunglassesAtNightTests` (`Tests/`, no host app, compiles `Shared/` directly), added to the shared macOS scheme's TestAction. `AppIdentifiers.appGroup` now reuses `SettingsBridge.appGroup`.
  - Tests: `Tests/SettingsBridgeTests.swift` (11 XCTest cases: mirror round-trip across two bridges on one suite, app Reset all clears the mirror and stale syncs can't repopulate it, extension `reset` clears the mirror, generations increase, malformed messages / non-object / oversized settings rejected). `engine/test/background.test.js`: 6 new native cases with a fake host following the same contract (startup and write mirroring, app reset → extension store cleared, reset while stopped applies at startup, extension reset clears both, no or failing host, malformed reply). `engine/test/bundle.test.js`: the exact permission pin is now `['storage', 'nativeMessaging']`, still an exact match.
- Verification:
  - `npm test` attempt 1 → 238/239. The only failure was the T009 pin `permissions === ['storage']`, which this task changes on purpose. Updated it to the exact prd set.
  - `npm test` attempt 2 → **239 tests, 239 pass, 0 fail**.
  - `npm run check` → `node --check: 12 file(s) OK`.
  - Swift tests row (`xcodebuild test -scheme "Sunglasses at Night (macOS)" … CODE_SIGNING_ALLOWED=NO`), run in-session twice → `** TEST FAILED **` before compiling: `Couldn't create workspace arena folder '…/build/DerivedData': Unable to write to info file … Operation not permitted`. That is the known B14 sandbox failure, not a test result. Swift tests can't run in the agent sandbox (B14). `ralph/verify-swift.sh` runs `xcodebuild test` once `xcodebuild -list` shows a `Tests` target, which it now does, and writes `## Swift tests (macOS)` into `ralph/evidence/swift-build-latest.md`. Row set to `needs-runner-build`. The next iteration reads that section and either marks T014 done or fixes it.
- Data flows: new on-device row in `docs/data-inventory.md` (settings mirror + reset generation in the App Group). No network.

## 2026-10-17: T014 runner Swift verification (Ralph iteration). DONE

- Goal: T014 acceptance (Swift unit tests; reset clears both stores), proven by the CLAUDE.md "Swift tests" row as run by the runner.
- Command (runner, `ralph/verify-swift.sh`): `xcodebuild test -scheme "Sunglasses at Night (macOS)" -destination 'platform=macOS' -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO`.
- Result (`ralph/evidence/swift-build-latest.md`, 2026-10-18T02:00:38Z, HEAD c0e4c30): macOS build exit 0, iOS build exit 0, Swift tests exit 0: `Test Suite 'SettingsBridgeTests' passed … Executed 11 tests, with 0 failures (0 unexpected)`, `** TEST SUCCEEDED **`. Full log: `ralph/evidence/test-macOS.log`.
- "Reset clears both": Swift side covered by `testAppResetAllClearsMirrorAndSignalsExtension` and `testExtensionResetMessageClearsMirror` (in the 11 that passed). Extension side covered by the 6 native cases in `engine/test/background.test.js` (`npm test` 239/239 from the previous iteration). Those cases use a fake host, so the real Safari ↔ App Group round trip with a signed build is still unverified (needs B7 signing; it belongs to T016's manual platform runs).
- No code changes this iteration. Row set to `done`.

## 2026-10-18 — end of Ralph run 1 (10 iterations total, $18.71)

- Done: T000–T006, T014. Blocked: T007 (B15 e2e can't launch WebKit in sandbox), T009 (B16 manual Safari check).
- Supervised re-check: `npm test` → `ℹ tests 239 ℹ pass 239 ℹ fail 0`. Runner Swift: macOS + iOS builds SUCCEEDED, `Executed 11 tests, with 0 failures`.
- Supervised `npm run e2e` (outside sandbox, B15 option a): `ℹ tests 7 ℹ pass 0 ℹ fail 7`. Every fixture times out in `openPage` waiting for `style[data-sunglasses-at-night="override"]`; no page errors or console output. The engine or harness never injects the override sheet in WebKit. Not yet diagnosed. Log: `ralph/evidence/e2e-supervised.log`.

## 2026-10-18 02:30Z — owner manual Safari test (supervisor note for the loop)

- Owner ran the signed test build (HEAD ~bdda3a0+, built 02:23Z) in real Safari on macOS with the extension enabled: **pages darken and "work well" on wikipedia.org and citizenfreepress.com.** So the T007 engine does inject in Safari; the 0/7 e2e result is most likely a **harness problem** (Playwright WebKit init-script/content-script setup), not the engine. Check the harness first.
- Owner asked that testing also cover the hard cases from https://webbrowsertools.com/darkmode/. T012's acceptance now includes an original local fixture for those categories. e2e itself stays loopback-only. The supervisor will run the real page once, supervised.
- 02:30Z owner T009 result: Option+Shift+N works; badge shows "off" when off and nothing when on (as designed); hover title says "on" when on. T009 → done, B16 closed.

## 2026-10-17: T007 e2e 0/7 diagnosis (Ralph iteration). NEEDS-RUNNER-BUILD

- Goal: T007 acceptance (fixture pages render dark; no `pointer-events` changes or overlays), proven by `npm run e2e`.
- Input: `ralph/evidence/e2e-latest.md` (runner, HEAD 256a35f): 0/7. Every fixture timed out at `e2e/harness.js:108` waiting for `style[data-sunglasses-at-night="override"]`, with no page errors. That fits a silent early return, since `main().catch(() => {})` swallows errors.
- Cause: `engine/src/content.js` `main()` returned immediately when `document.documentElement` was null. Safari's `document_start` runs after `<html>` is inserted, which is why the owner's real-Safari test worked. Playwright's WebKit `addInitScript` runs before any element exists, so the engine never started in any fixture.
- Fix: new `whenRoot(document, fn)` in `engine/src/early.js` runs now if the root exists. Otherwise it waits for it with a `MutationObserver` on the document (childList), falling back to DOMContentLoaded. `content.js` awaits it after loading settings and then runs as before. No engine behavior changes once a root exists.
- Tests: `engine/test/detect.test.js` adds `whenRoot` (runs now with a root; with no root it observes the document, ignores mutations until the root appears, then fires once and disconnects).
- Verification:
  - `npm test` → `ℹ tests 240 ℹ pass 240 ℹ fail 0`.
  - `npm run e2e` in-session → every launch fails: `browserType.launch: Timeout 180000ms exceeded … sandbox_extension_issue_file_to_process failed for …/webkit-2370/Playwright.app: 1 (Operation not permitted)`. That is the known sandbox limit, not a test result.
- Row set to `needs-runner-build`. The next iteration reads the runner's `ralph/evidence/e2e-latest.md`, then marks T007 done (7/7 with the pointer-events/overlay checks) or keeps fixing it.
- Session goal required done or blocked, so the row is now `blocked (B17)`: the acceptance proof needs an e2e run outside the sandbox (runner `ralph/verify-e2e.sh` or the owner). Retrying the same in-sandbox launch wouldn't change the result. B17 is in `docs/launch-blockers.md`. Unblock: a 7/7 `ralph/evidence/e2e-latest.md` at or after commit c9a8f4d.

## 2026-10-17: T010 popup (S05) + options page (S06) (Ralph iteration). BLOCKED (B18)

- Goal: T010 acceptance (all controls native; names on icon buttons; restricted-page state), proven by "manual + T015".
- Wrote:
  - `engine/src/ui-core.js`: pure view logic. `pageHost` (null for about:, file:, data:, extension and other non-http(s) pages = restricted), `popupView` (restricted / site default|always|never / already-dark / forced-dark / per-site look, plus status text), site-entry edits that delete inherit-only entries, preset matching, Sites rows, schedule hint (same wording as `activation.js` semantics).
  - `engine/src/popup.js` → `Extension/Resources/popup/popup.{html,js}`: mode select, "This site" radios, "darken even if already dark" checkbox, already-dark note, separate-look-for-this-site checkbox, preset select, 4 range sliders with `<output>`, "More settings" icon button (`aria-label`, SVG `aria-hidden`) → `runtime.openOptionsPage()`. Restricted pages hide every site control and say why; global mode and look stay.
  - `engine/src/options.js` → `Extension/Resources/options/options.{html,js}`: mode + schedule (`type=time`, `aria-describedby` hint, `aria-invalid` on bad input), look, images, hide background images, already-dark detection, engine, Sites list (per-row remove icon buttons named "Remove rule for <host>"; focus kept in the list on removal), Reset all via native `<dialog>` with `showModal()` (focus trapped, Escape cancels, initial focus on Cancel, focus back to the Reset button).
  - `Extension/Resources/ui/ui.css`: design-direction tokens, light + dark via `prefers-color-scheme`, `font: -apple-system-body` (Dynamic Type), 44 px targets, 2 px `:focus-visible` ring, no outline removal, no remote fonts.
  - `engine/src/messages.js`: `GET_TAB_STATE`, `RESET_ALL`, shared `OFF_TEXT`. `engine/src/background-core.js` answers both only for our extension pages (no `sender.tab`, matching id); content scripts and other extensions get nothing.
  - `manifest.json`: `action.default_popup`, `options_ui` (open in tab). No new permissions. `engine/scripts/bundle.js`: popup/options targets.
  - `engine/test/ui.test.js` (27 cases): view logic, entry edits round-trip through the store, background message gating, static HTML checks per page (no widget roles/inline handlers/tabindex>0; every button named, icon buttons via `aria-label`, SVGs `aria-hidden`; every input/select labelled; no inline script; every id the script uses exists), restricted-state wiring, manifest paths, no network in popup/options bundles, token contrast ≥4.5:1 in both schemes (focus ring ≥3:1).
  - `e2e/ui.test.js` (WebKit, loopback only): popup light/dark keyboard Tab pass (every stop native + named, icon button reachable), rule set from the keyboard is saved, restricted state for about:blank / extension / file: URLs, already-dark override, options Tab pass, named remove buttons, Reset dialog focus + Escape + confirm. Screenshots → `ralph/evidence/t010-*.png`, `t010-e2e.json`.
- `fixing-accessibility` skill loaded and applied while editing (names, keyboard, dialog focus, semantics, forms, contrast).
- Verification:
  - `npm test` → `ℹ tests 267 ℹ pass 267 ℹ fail 0` (one failure on the first run was my new test treating `role="status"`/`role="alert"` live regions as fake widgets; narrowed to widget roles).
  - `npm run check` → `node --check: 15 file(s) OK`. `node --check e2e/ui.test.js` OK.
  - `npm run e2e`: not run in-session (WebKit can't launch in the sandbox, B15/B17). The runner's `ralph/verify-e2e.sh` will run `e2e/ui.test.js` with the rest.
- Not met yet: the "manual" half (real Safari popup on Mac + iOS, VoiceOver names, restricted page in Safari) needs the owner, and the "T015" half (popup keyboard pass under T015's checklist) depends on T015, which is pending. Row set to `blocked (B18)`; steps are in `docs/launch-blockers.md`.
- 02:41Z supervisor: runner e2e 7/7 at 8ecdafb → T007 done, B17 closed. The agent had marked T007 `blocked` instead of `needs-runner-build`, so the runner skipped it; PROMPT.md now says so explicitly.
- 02:41Z owner report: amazon.com product-grid search pages get very laggy. T013 now includes a synthetic product-grid fixture with concrete jank budgets. The supervisor will profile the real page once, supervised.
- 02:50Z supervisor profile of real amazon.com search grid (WebKit, engine 8ecdafb): engine MutationObserver time 277 ms vs 8 ms baseline, max callback 73 ms, worst frame 169 ms vs 58 ms; the page's 53 sheets are mostly cross-origin → ~3,700 generated override rules. Details + suspects: `ralph/evidence/amazon/profile-2026-10-18.json`. T013 must bring the synthetic grid within its budgets; the supervisor re-profiles the real page after T013.

## 2026-10-17 — T008 filter fallback engine, image modes, hide bg images, per-site engine (Ralph iteration)

- Goal (bounded `/goal`): T008 acceptance "fixture images not double-inverted; toggling engines without reload", proved by the T012-style WebKit e2e run.
- Built:
  - `engine/src/filter.js` (new): `startFilter()` adds one marked `<style>` as the root's last child: `:root{filter:invert(100%) hue-rotate(180deg) [look sliders]!important;color-scheme:light!important}`, `:where(:root){background-color:#fff}` so the canvas inverts too, and a counter-filter on **outermost media only**: `:is(img,video,canvas,embed,object,iframe[src]…):not(:is(video,canvas,embed,object,iframe) *)`. `<picture>` isn't countered (its `<img>` is), media inside countered media are skipped, about:/srcdoc frames (no content script) stay under the page filter. Image modes: `leave` = media as authored; `no-invert` = also inline `<svg>`; `dim` = `brightness(80%)` *before* the counter so page∘counter cancels exactly. `hideBackgroundImages` = `background-image:none!important` on everything outside SVG.
  - `engine/src/dynamic.js`: `startDynamic({images, hideBackgroundImages})`. Dim adds `img,video,canvas,embed,object{filter:brightness(80%)!important}` to the base sheet (beats inline `filter:none` / `all:revert`). Hide strips url()/image-set() layers from `background-image` in sheets, cross-origin sheets, inline styles (incl. inline `!important`) and the `background` attribute, and keeps gradients (`withoutImages`).
  - `engine/src/content.js`: picks `startFilter` or `startDynamic` from `resolveSite(...).engine` (per-site override of the global engine) and passes image settings. Engine switches use the existing settings-change restart: teardown + re-run, no reload.
  - Popup: "Engine" select in the This site group (Default / Dynamic / Filter) with a hint; `withEngine()` + `popupView().engine` in `engine/src/ui-core.js`. The global engine/images/hide controls already existed on the options page (T010).
  - Tests: `engine/test/filter.test.js` (15 cases, incl. a model of the CSS filter primitives showing page∘counter = identity and a doubled counter visibly wrong, dim-before-counter order, outermost-only selector, image modes, hide rules, `withoutImages`, fake-DOM start/stop, `withEngine`), `engine/test/png.test.js` (PNG reader for the e2e pixel checks, all 5 row filters, RGB/RGBA).
  - `e2e/filter.test.js` (5 WebKit cases, loopback only) on new fixture `e2e/fixtures/images.html` (solid-color data: images in plain/picture/link/figure/`filter:none`/`all:revert`/canvas, url() and gradient backgrounds). Checks **screenshot pixels** (a filter doesn't change computed colors) via `e2e/png.js`: filter engine page + canvas-below-content dark, every media element ≈ authored color (±12) and the dark image still dark (not inverted, not double-inverted), only one `<style>` added, pointer-events/hit-testing unchanged, link clickable; dynamic engine media untouched; dim + hide in both engines; per-site engine dynamic → filter → dynamic on the open page with timings, cleanup of dynamic attributes, same document (`__sameDocument` marker, 1 navigation entry). `e2e/harness.js` gained a `ready` option (engine sheet role to wait for).
- Verification:
  - `npm test` → `ℹ tests 282 ℹ pass 282 ℹ fail 0`.
  - `npm run check` → `node --check: 16 file(s) OK`.
  - `npm run e2e -- --test-name-pattern="filter engine"` in-session: WebKit failed to launch (`browserType.launch` TimeoutError; `sandbox_extension_issue_file_to_process failed … Playwright.app: 1 (Operation not permitted)`, `Connection Invalid error for service com.apple.hiservices-xpcservice`), the same sandbox limit as B15. No test ran. This doesn't count against the 5 verification attempts; that count starts with the runner's run.
- Status: `needs-runner-build`. The runner's `ralph/verify-e2e.sh` decides T008: 5/5 in `e2e/filter.test.js` → the next iteration marks it done using `ralph/evidence/e2e-latest.md` + `t008-e2e.json` + `t008-*.png`. Known risk: whether WebKit's root filter covers the canvas below short pages (the `belowContent` check).

## 2026-10-17: T008 filter engine + image modes (Ralph iteration). DONE

- Goal: T008 acceptance: fixture images not double-inverted; engines toggle without a reload. Decided by the runner's WebKit e2e run (`npm run e2e`).
- Verification: read `ralph/evidence/e2e-latest.md` (runner, 2026-10-18T03:04:30Z, HEAD 3dd86e4): `ℹ tests 16 ℹ pass 15 ℹ fail 1`. All 5 T008 cases pass:
  - ✔ filter engine: page dark, media as authored (not inverted, not double-inverted), nothing intercepts clicks
  - ✔ dynamic engine: media untouched by default
  - ✔ dynamic engine / ✔ filter engine: images "dim" dims media; "hide background images" hides url() backgrounds
  - ✔ per-site engine switches dynamic → filter → dynamic without a reload (toFilterMs 10, toDynamicMs 9, same document, 1 navigation entry)
- Pixels (`ralph/evidence/t008-e2e.json`): img/picture/linked/figure/canvas/`filter:none`/`all:revert` all read ≈230,199,151 vs authored 230,200,150 under the filter engine; page bg 0,0,0.
- The 1 failure is `e2e/ui.test.js:122` "popup on a normal page… icon button reachable and named". It belongs to T010, already blocked (B18), and is out of scope here.
- Known limitation, recorded and not hidden: under the filter engine, a CSS `url()` background image is inverted once (fixture `#bg` 230,200,150 → 79,49,0). It is not double-inverted, and no T008 criterion covers it. The dynamic engine shows it as authored. T012's "hard cases" (url() backgrounds, images must not be inverted) will need either the dynamic engine or a counter-filter for background images under filter mode.
- Status: T008 done.

## 2026-10-17: T012 WebKit e2e, 8 fixtures + hard cases (Ralph iteration). NEEDS RUNNER E2E

- Goal (bounded `/goal`): T012 acceptance: every visible text node ≥4.5:1; first paint not white; all buttons clickable; screenshots in `ralph/evidence/`. Proof: `npm run e2e`.
- Built:
  - `e2e/fixtures/already-dark.html` (own dark theme, `color-scheme` meta) and `e2e/fixtures/hard-cases.html`, an original page covering the owner's categories. It was written from the category list only, with nothing taken from the reference page. Images in links/figures; 3 nested same-origin frames (`hard-frame-{1,2,3}.html`), each with an image and frame 3 with a translucent one and a button; images with `opacity:.5`, a 30 s transition, `all: revert` and `filter: none`; url() (`hard-tile.svg`) and data: backgrounds; picture/source, canvas, embed, object, `input type=image`; all 22 input types plus textarea, select and buttons (UA-styled and author-styled); an empty about:blank frame and one the page writes into (incl. a late insert); white-on-dark, light-on-black, dark-on-white text; a 16-color background palette; 4 `-webkit-font-smoothing` values. All media are solid #e6c896 / #28283c so pixels can be checked.
  - `e2e/t012.test.js` covers 10 pages (light, already-dark, inline, spa, images, cross-origin, links, shop, shadow, hard-cases), each with two tests:
    - **First paint:** the server holds the body back (`?stall`, split right after `<body>`). After two rAFs the page's canvas color (`page-audit.js canvasColor()`, root/body background over the color-scheme canvas) must be luminance < 0.1 with zero body children, and the same moment without the extension must be light (> 0.5), so the check can tell. A screenshot is also taken when WebKit allows one before the body arrives (Playwright waits for `document.fonts.ready`); its 6×6 pixel grid must then be dark too.
    - **Readable + clickable:** page-audit in **every HTML frame** (about:blank frames get the audit via `addScriptTag`) with no failures (≥4.5:1 on a background ≤0.2 luminance). Every enabled button / submit / reset / image input / `[role=button]` / summary in every frame passes Playwright's trial click (visible, stable, enabled, receives the pointer event).
    - **Hard cases extras:** every media point in top page + 3 nested frames is checked on full-page screenshot pixels, before and after, as authored ±12 (translucent ones = authored opacity over the surrounding pixels): not inverted, hidden or faded. The empty about:blank frame pixel must be dark; the filled one must be audited. Real clicks run on 2 top-page buttons, the frame-3 button and the about:blank-frame button, plus an image link.
    - **Already-dark extras:** no sheets or attributes from us, and computed colors identical to the page without the extension.
  - `engine/src/dynamic.js` `adoptFrame()`: the manifest has no `match_about_blank`, so about:blank / srcdoc frames get no content script, and a page-filled frame would stay light inside a dark page. The engine now runs a nested `startDynamic` on their same-origin document, restarts on the frame's `load` and stops with the parent. It skips frames where a content script already marked the document.
  - `e2e/harness.js`: `.svg` mime type; `?stall=<ms>`; `openFirstPaint()`; `openPage(..., { ready: null })` for pages the engine must leave alone; the content script is skipped in `about:` frames, matching Safari, since Playwright init scripts run in every frame; `auditBundle` exported.
- Verification:
  - `npm test` → `ℹ tests 282 ℹ pass 282 ℹ fail 0`. `npm run check` → `node --check: 16 file(s) OK`; `node --check` on the 3 e2e files OK.
  - Server sanity (`node --test` on a scratch test): `/hard-cases.html?stall=700` arrives as 2 chunks, 4485 bytes ending `<body><!-- -->` at 4 ms and the rest at 707 ms; `hard-tile.svg` → `image/svg+xml`; the audit bundle parses; the 4 new pages return 200.
  - `npm run e2e` in-session: WebKit can't launch (`browserType.launch: Timeout 180000ms exceeded … sandbox_extension_issue_file_to_process failed for …/webkit-2370/Playwright.app: 1 (Operation not permitted)`), so all 16 existing tests show as launch failures. This is the known sandbox limit (B15/B17), not a test result, and doesn't count against the 5 attempts.
- Status: `needs-runner-build`. The runner's `ralph/verify-e2e.sh` decides: the 20 `t012.test.js` cases pass → done, with evidence `ralph/evidence/e2e-latest.md`, `t012-e2e.json`, `t012-*.png`.
- Known risks for the runner run:
  1. WebKit's canvas behind an about:blank frame in a dark-scheme parent.
  2. The UA button face color in dark scheme against the 0.2 background-luminance cap.
  3. SVG embed/object documents getting the content script.
  4. The filter engine still inverts url() backgrounds once (T008 note). T012 tests the default dynamic engine.
- Status change: the session goal accepts only done or blocked, and no in-session WebKit run is possible, so the row is now `blocked (B19)` with B19 in `docs/launch-blockers.md`. Caveat recorded there: `ralph/next-task.js` skips blocked rows. The owner must run `npm run e2e` or set the row back to `needs-runner-build` for the runner to decide T012. Nothing is claimed passing.

## 2026-10-18 03:47Z — supervisor: run 2 interrupted at iteration 6 (T013)

- The runner was killed mid-iteration 6 when the supervising session ended (no result JSON). The uncommitted T013 work in progress is left in the tree (`e2e/perf.test.js`, `e2e/perf/`, `engine/scripts/perf.js`, edits to `engine/src/dynamic.js`): continue from it, don't discard it.
- Runner e2e at b497a77: 25/36. T012's first-paint check fails on all 10 pages; T010's popup keyboard case fails. Both re-queued as `needs-runner-build` (they were wrongly `blocked` on "waiting for runner", so the runner skipped them).
- Resuming run 2 with the remaining 4 iterations.

## 2026-10-17: T010 popup + options (Ralph iteration). BLOCKED (B18, owner manual check)

- Goal: T010 acceptance (all controls native; names on icon buttons; restricted-page state), proven by "manual + T015".
- Input: runner e2e at 11d2c57 (`ralph/evidence/e2e-latest.md`): T010 is 3/4. Restricted page, already-dark and options pass. `popup on a normal page` fails with `AssertionError: icon button reachable and named` (`e2e/ui.test.js:122`).
- Cause: the test, not the popup. `#more` is a native `<button>` with `aria-label="More settings"`. WebKit, like Safari on default settings, moves plain Tab only between text fields and selects. The options walk in `ralph/evidence/t010-e2e.json` shows the same thing: mode → time fields → preset → images → engine, with no button, checkbox or range.
- Fix (`e2e/ui.test.js`): `tabOrder` takes a key and blurs first. The popup and options tests now walk with both Tab and Option+Tab (`Alt+Tab`, Safari's "reach every control"). Every stop in both walks must be native and named. The Option+Tab walk must reach `More settings` and a site-rule radio (popup), plus `Remove rule for a.test`, `Remove rule for b.test` and `Reset all settings…` (options). Both orders go into `t010-e2e.json`. This is stricter than before. No assertion was removed.
- Commands: `node --check e2e/ui.test.js` OK. `npm test` → `ℹ tests 286 ℹ pass 286 ℹ fail 0`. `npm run e2e` can't launch WebKit in-session (B15), so the runner's next `ralph/verify-e2e.sh` decides the 4 `ui.test.js` cases.
- Status: `blocked (B18)`. Acceptance also needs the owner's manual Safari check (B18 steps, now including Option+Tab) and T015. Nothing is claimed passing until both of these hold: the next `e2e-latest.md` shows `popup on a normal page` ✔, and the owner has pasted B18 results. If the runner e2e still fails that case, set the row back to `needs-runner-build`.

## 2026-10-18: T012 first-paint check (Ralph iteration). NEEDS-RUNNER-BUILD

- Input: runner e2e at 6c42c49 (`ralph/evidence/e2e-latest.md`, exit 1, 26/37). All 10 `every text node ≥ 4.5:1, buttons clickable` cases pass, including hard-cases media as authored and already-dark left as authored. All 10 `first paint is not white` cases fail at `e2e/t012.test.js:193` `body content had already arrived` (2–7 !== 0), each taking ~16 s, i.e. 2 × the 8 s `?stall`. The other failure is T013's `gridStormRafGapMax: 36 > 32` (uncommitted T013 work, not this task).
- Cause: the test's premise, not the engine. WebKit renders no frame (and runs no rAF) while the document's body is empty; it keeps the layer tree frozen until there's content. So the old `waitForTimeout` + double-rAF measurement only resolved once the stalled body arrived, and the `bodyChildren === 0` precondition could never hold. No bodiless frame exists to be white.
- Fix: `e2e/harness.js` `openFirstPaint()` adds an init script that queues a rAF at document start and records `canvasColor()` (+ `bodyChildren`, `atMs`) in the **first frame WebKit renders**, whenever that is. `e2e/t012.test.js` asserts: baseline first-frame canvas light (> 0.5, non-already-dark pages), so the check can tell; extension first-frame canvas luminance < 0.1; a screenshot right after it must exist and have 0 of 36 grid samples with luminance > 0.9 (no white areas). The dropped assertions were the bodiless precondition and the bodiless-only pixel checks. Their replacement is now mandatory: the screenshot used to be optional (`if (px)`).
- Commands: `node --check e2e/harness.js && node --check e2e/t012.test.js` → OK. `npm run e2e` can't launch WebKit in-session (B15), so the runner's next `ralph/verify-e2e.sh` decides the 10 first-paint cases.
- In-session `npm run e2e` at f06ec97 (stop hook asked for real output): bundle OK, then every `webkit.launch` hit `Timeout 180000ms exceeded … sandbox_extension_issue_file_to_process failed for …/webkit-2370/Playwright.app: 1 (Operation not permitted)`. Result: `ℹ tests 16 ℹ pass 0 ℹ fail 13 ℹ cancelled 3`, killed at the 20-min background limit before `t012.test.js` started. That's the B15 sandbox limit, not a test result, and doesn't count toward the 5 attempts.
- Status: `needs-runner-build`, per the runner contract (not `blocked`: only a runner-side check is outstanding). When the next `e2e-latest.md` shows all 20 `t012.test.js` cases ✔, mark it done with evidence `ralph/evidence/e2e-latest.md`, `t012-e2e.json`, `t012-*.png`.

## 2026-10-17: T012 e2e on WebKit (Ralph iteration). DONE

- Goal: T012 acceptance (every visible text node ≥4.5:1; first paint not white; all buttons clickable; screenshots in `ralph/evidence/`; hard-cases images not inverted, hidden or faded), proven by `npm run e2e`.
- Verification: runner `ralph/verify-e2e.sh` → `npm run e2e` at HEAD 2a8ec48, 2026-10-18T04:28:34Z (`ralph/evidence/e2e-latest.md`, `.log`): `ℹ tests 37 ℹ pass 36 ℹ fail 1`. All 20 `t012.test.js` cases ✔: `{light, already-dark, inline, spa, images, cross-origin, links, shop, shadow, hard-cases}: every text node ≥ 4.5:1, buttons clickable` and `…: first paint is not white`. The single failure is `T013 perf budget` (`gridStormRafGapMax: 47 > 32`, uncommitted T013 work), not T012.
- `ralph/evidence/t012-e2e.json` (`_meta.date` 04:28:32Z, same run): every fixture's extension first-frame canvas is rgb(20,20,20) with 0 white samples (baselines are white, so the check can tell the difference); min text ratios 4.50–13.05 with 0 failures, including hard-cases (60 nodes), its about:blank frames and hard-frame-1/2/3; 8/8 hard-cases buttons clickable; all 19 hard-cases media probes (link/figure images, opacity, long transition, `all: revert`, `filter: none`, url()/data: backgrounds, picture, canvas, embed, object, input[type=image], images in nested frames 1–3) read their authored pixel after the extension runs; about:blank frame pixel is rgb(20,20,20).
- Caveat: the first-frame `atMs` is still ~8 s on every fixture, baselines included. That's the fixture server's deliberate stall before WebKit paints, not the extension. The assertion reads the first frame actually rendered.
- In-session `npm run e2e` is still not possible (B15 sandbox), so this rests on the runner's run, per the runner contract.
- Status: T012 → done.

## 2026-10-17: T013 performance budget (Ralph iteration). DONE

- Goal: T013 acceptance. 5,000-node fixture: initial pass ≤ 50 ms median, mutation batch ≤ 8 ms. Product-grid fixture: no engine long task > 50 ms after first paint, engine time during the 5 s storm ≤ 10% of wall time, rAF gaps ≤ 32 ms. Numbers go in `ralph/evidence/t013-perf.json`, proven by `npm run perf`.
- Work (continued from the interrupted run-2 iteration 6 tree):
  - Fixtures, all original markup (`e2e/perf/fixtures.js`). The 5,000-element page has 3 sheets with 1,020 rules. The store-search grid has 60 cards, each with a lazy `<img>` whose src/srcset are swapped in by IntersectionObserver, plus price, stars, badges and sponsored labels. It loads 16 linked sheets (10 from a second loopback origin, so the CSSOM can't read them and the engine re-fetches) with 4,992 rules and many color declarations. It also has 3 carousels with nested tracks and auto-advance transforms. The storm makes 1,000 mutations over 5 s (200/s): ad inserts and removals, class and attribute flips, text swaps and inline style writes, while the page scrolls.
  - Harness (`engine/scripts/perf.js`): `npm run perf`. `e2e/perf.test.js` runs the same `runPerf()` so the runner's e2e records it.
  - Engine (`engine/src/dynamic.js`):
    - Mutation callbacks now do only the work that prevents a light flash: inline styles, new sheets, shadow roots and frames.
    - Contrast checks are deferred (100 ms coalescing) and run in ≤ 6 ms slices, all reads first and then all writes, with a per-slice background cache.
    - Sheet rewrites after sheet loads or remote arrivals yield at the slice deadline.
    - A `class` flip triggers only a contrast check, not a rescan.
    - Shorthand var() serialization runs only when an empty color longhand shows up.
    - `opts.monitor` is test-only task timing.
- Verification (runner `ralph/verify-e2e.sh` → `npm run e2e` at HEAD e1e1115 + this tree, 2026-10-18T04:34Z, `ralph/evidence/e2e-latest.log` lines 25–35), output of `summary(runPerf())`:
  ```
  T013 perf (Playwright WebKit 27.2 (headless), darwin arm64, HEAD e1e1115)
  PASS nodesInitialMedian: 22 (max 50)
  PASS nodesBatchMedian: 2.5 (max 8)
  PASS gridLongestEngineTaskAfterFirstPaint: 14 (max 50)
  PASS gridStormEngineShare: 0.011 (max 0.1)
  PASS gridStormRafGapMax: 24 (max 32)
  grid storm: 1000 mutations in 5000 ms, engine 55 ms (1.1%), longest engine task 11 ms, rAF gap max 24 / p99 19 ms (baseline without engine: max 20 / p99 19 ms)
  grid load: engine 60 ms before storm, longest after first paint slice 14 ms; ads styled 24/24; card bg rgb(24, 20, 11)
  overall: PASS
  ✔ T013 perf budget: 5,000-node page and product-grid storm (25683ms)
  ```
  The whole suite passed: `ℹ tests 37 ℹ pass 37 ℹ fail 0`.
- History: earlier runner runs of work-in-progress versions missed the rAF budget (6c42c49: 36 ms; 2a8ec48: 47 ms). The deferred, sliced contrast work closed it. The rAF gap is the tightest budget: 24 ms against 32, with a 20 ms page-only baseline. Treat it as the one to watch on slower Macs.
- `npm test` → `ℹ tests 286 ℹ pass 286 ℹ fail 0`.
- In-session `npm run perf` (attempt 1): no output before it was killed at the 10-min background limit. WebKit can't launch inside the session sandbox (B15). It's not a perf result and doesn't count toward the 5 attempts. `t013-perf.json` was not overwritten (still `when` 2026-10-18T04:31:01Z from the runner run above).
- Status: T013 → done. Evidence: `ralph/evidence/t013-perf.json`, `ralph/evidence/e2e-latest.md`, `ralph/evidence/e2e-latest.log`.
- Correction (same session, after the stop-hook review): done was premature. The goal asks for the real output of `npm run perf` itself. The runner ran it through `e2e/perf.test.js`, which uses the same `runPerf()`/`summary()` but isn't the npm script.
- Timestamps reconciled: `ralph/verify-e2e.sh:14` stamps the header (04:34:10Z) after the whole suite exits. The perf test ran mid-suite and wrote the JSON at 04:31:01Z. The ~3 min after it are the remaining cases (10 first-paint cases at ~16.4 s each, plus others).
- In-session `npm run perf` attempt 2 (no pipe, 30-min limit): still no output after 10+ min, so I stopped it. Same B15 sandbox hang. Two attempts, no result either way.
- Status: T013 → `blocked (B20)`. The owner runs `npm run perf` in a terminal, or approves adding it to the runner's out-of-sandbox step. Nothing beyond the runner's `runPerf()` numbers is claimed.

## 2026-10-18 05:10Z — supervisor: end of run 2, real-site checks

- Run 2 finished (4 + 6 iterations). T012 done (runner e2e 37/37 at e1e1115). T013: the loop marked it done and then `blocked (B20)`; B20 only says `npm run perf` can't run in-session.
- Supervisor ran `npm run perf` 3× outside the sandbox: engine budgets all pass every time (longest engine task 4–5 ms, storm share 0.8–1.1%), but `gridStormRafGapMax` goes 32 / 29 / 33 against max 32, and the runner saw 57. Baseline without the engine is 21–31 ms on the same runs, so this metric mostly measures headless WebKit jitter. Owner decision pending on the metric (see report).
- Real amazon.com grid (3 runs, engine at 1871816) vs the 02:50Z profile: engine MutationObserver time 277 → 73–83 ms, longest callback 73 → 18–31 ms. **Still a 132–156 ms worst frame with the engine vs 58–72 ms without**, every run. Likely style recalculation over the ~3,700-rule override sheet when Amazon inserts content: browser work, not engine JS, so the JS-only budgets don't see it. Candidate run-3 task: measure recalc cost (with vs without the override sheet on an insert storm) and shrink the generated sheet (dedupe rules, drop rules for selectors that match nothing, avoid expensive selectors, scope cross-origin sheet rewrites).
- Real webbrowsertools.com/darkmode (WebKit, engine at 1871816; second plain load got a Cloudflare block, not retried beyond one fresh load): page dark, all images, picture, canvas, embed, object, bg images and form fields visible and not inverted. Issues: (1) the 2- and 3-level nested iframe images show "Err" with the engine (fine without it), cause unknown, possibly the site's own frame load; check in Safari; (2) the "white text + dark background" box gets lightened to mid-gray; an authored dark box should stay as authored; (3) the background-color palette collapses to near-black, so swatches lose distinctness. Screenshots (local, gitignored): `ralph/evidence/webbrowsertools/`.

## 2026-10-18 06:05Z — supervisor (Opus): owner feedback + switch to new /new-app

- Owner Safari check: nested-frame "Err" not visible in Safari → harness artifact, dropped. Popup shows **no "This site" section** → T022 (cause analysed in docs/blueprint.md fix 1). **White flash on first load (e.g. amazon.com)** → T023. Amazon "much faster"; remaining stutter → T024. Dark box / palette → T025.
- Owner: use the new /new-app version. Wrote `docs/blueprint.md`. Loop now pinned to `claude-sonnet-5-5` (Builder); Opus supervises and handles escalations. T013 metric revised (baseline + 8 ms, median of 3).
- Impeccable install was blocked for me by the auto-mode classifier (adds hooks) → B21, owner action. T026 (Phase 3B design directions) and UI tasks T011/T015/T017 wait on it.
- Starting run 3 (10 iterations, Sonnet).

## 2026-10-18 — T022 popup host fallback (Builder, Sonnet 5.5)

- `content.js` TAB_STATE now carries `host: location.hostname`; `background-core.js` stores it per tab (string, ≤253 chars) and GET_TAB_STATE returns it.
- `ui-core.js` new `resolveHost({url, reportHost, focusedUrl})`: tab.url → report.host → lastFocusedWindow tab url; null (restricted) only when all are empty. A restricted tab.url (about:blank) is not overridden by a report host. `popupView` takes `focusedUrl`.
- `popup.js`: when tab.url and report.host are both missing, queries `{active:true, lastFocusedWindow:true}` and re-fetches the report by that tab's id. No new permission.
- Tests: `engine/test/popup-host.test.js` (all 4 source combinations, background host storage, manifest permissions `["storage","nativeMessaging"]` unchanged). `e2e/ui.test.js` gains "popup in Safari: tab.url undefined, host comes from the stored report" and "no tab.url and no stored host is restricted".
- Command: `npm test` → `ℹ tests 294 ℹ pass 294 ℹ fail 0`. (First run failed the no-network bundle check because an `https://` template literal landed in the popup bundle; replaced with `normalizeHostname`.)
- Not run here: `npm run e2e` (runner-only). Row set to `needs-runner-build`; the next iteration reads `ralph/evidence/e2e-latest.md` and marks it done or fixes it.
- Runner e2e at 06:23Z (ralph/evidence/e2e-latest.md): 38/39, the one failure was "popup with no tab.url and no stored host is restricted" (#site visible). Cause is in the test, not the popup: `open()` has `tabUrl = 'https://example.com/'` as a default, so `tabUrl: undefined` was replaced by the default and both new cases ran with a real URL. Fix: `e2e/ui.test.js` now uses `tabUrl: null` to mean "tab object with no `url` property" (shim builds `{ id: 5 }`). The "Safari" case therefore now truly has `tab.url` undefined and gets its host from the stored report. `npm test` unchanged (294/294 earlier; no engine code touched this turn).
- Re-ran after the e2e edit: `npm test` → `ℹ tests 294 ℹ pass 294 ℹ fail 0`; `node --check e2e/ui.test.js` → syntax-ok.
- Status stays `needs-runner-build`: the next runner `npm run e2e` must show both cases passing.
- 06:17Z `/impeccable init` (Opus, this session): owner interview answered (users: everyone, with night reading and white pages most important; differentiators confirmed; voice: witty, a nod to the name). Wrote `PRODUCT.md` (platform `adaptive`). No image generation available → no buildPath recorded; app screens are code-first. Live mode skipped (native + extension). T026 unblocked.

## T022 — Popup host fallback (2026-10-18, Builder)
- Verification: `npm test` → `tests 294, pass 294, fail 0` (includes engine/test/popup-host.test.js: 4 source combinations; manifest permissions asserted unchanged).
- Runner e2e (ralph/evidence/e2e-latest.md, 06:31Z, HEAD 3e86fa6): `popup in Safari: tab.url undefined, host comes from the stored report` ✔; `popup with no tab.url and no stored host is restricted` ✔; other popup cases ✔. Only failure: T013 perf (`gridStormRafGapMax 41 > 32`), unrelated.
- Status: T022 done. Next: owner re-check of the popup "This site" section in Safari clears B18 / T010.

## T023 — First-paint flash (2026-10-18, Builder): blocked (escalate, B22)
- Read `engine/src/content.js`, `engine/src/early.js`, `e2e/harness.js`, `e2e/t012.test.js`, blueprint fix 2. Runner e2e at HEAD 9d9d35f (06:36Z): 39/39 pass, so the existing "first paint not white" cases already pass with the harness's synchronous settings shim; the real-Safari gap is the async `storage.local.get` before `startEarly`.
- Finding: with a 300 ms settings read the script can't know "always" vs "off" vs "already-dark" at start. A synchronous dark base sheet fixes "always" but shows a dark flash on mode-off/already-dark pages until settings arrive. The acceptance ("no dark flash, ΔE 5 from authored, with a 300 ms read") needs a synchronous per-origin decision cache, and blueprint fix 2 rules out page storage. No other synchronous store exists for a content script.
- Per Builder role I didn't redesign. No source changed, nothing run (no verification command applies yet). Row set to `blocked (escalate: B22)`; B22 lists options (a) accept transient dark until the settings read resolves and relax the AC (recommended, no new data flow), (b) page-localStorage cache, (c) background `scripting.insertCSS` with new permissions.

## T025 — Dark islands and palette (2026-10-18, Builder)
- `engine/src/transform.js`: new exported `DARK_ISLAND_L = 0.3`. A `bg` color at or below it (OKLCH L) is returned as authored (hue, chroma, alpha kept; the look sliders still apply). Lighter backgrounds are inverted across the whole bg band, now `lo 0.19 → hi 0.44` (was 0.42), with chroma ×0.8 capped at 0.12 as before. Lighter source → darker output, no ties.
- Fixture `e2e/fixtures/hard-cases.html`: `#island` (author-dark `#1b2336` box with `#f2f2f2` text on the white page) and `#swatches` (48 swatches, hsl hue 0..330 step 30 × lightness 20/40/60/80 %, sat 65 %). `e2e/t012.test.js` hard-cases case now compares computed colors before/after the engine: island ΔE ≤ 5 and text ≥ 4.5:1, no swatch pair with ΔE ≥ 10 ends under 3, lightness order of inverted swatches kept; it records `islandPalette` in `t012-e2e.json`. ΔE = OKLab distance × 100.
- Unit tests: new `engine/test/island-palette.test.js` reads the same 48 swatches from the fixture and checks the same things on `transformColor`/`transformPair`, plus islands with a non-default look and light backgrounds still darkening.
- Changed existing test: `engine/test/transform.test.js` "mapping inverts lightness order within a role" expected black and `#404040` backgrounds to be lightened, which is the old behavior T025 removes. For `bg` it now covers only grays lighter than the island threshold; a new case asserts dark backgrounds stay as authored (`#000000` → `rgb(0 0 0)`). fg and border assertions unchanged.
- Tuning log: threshold 0.4 / hi 0.40 left 5 colliding pairs and an order failure; threshold 0.3 / hi 0.40 left 2 (a dark red island vs a mid red, two pale swatches 12 ΔE apart landing 2.7 apart); hi 0.44 left none. Limit, stated plainly: any map that keeps dark colors and inverts light ones folds the lightness axis, so a dark swatch and a mid-light swatch of the same hue authored ≥ 10 apart can still land close. The 48-swatch fixture passes; an arbitrary palette is not guaranteed.
- Commands: `node --check e2e/t012.test.js` OK; `npm run check` → `node --check: 16 file(s) OK`; `npm test` → `ℹ tests 302 ℹ pass 302 ℹ fail 0`.
- In-session `npm run e2e` attempt (after the stop hook asked for runner output): no output after 420 s, moved to background, output file empty. Same B15 sandbox hang as T013's attempts; it is not a test result and I stopped it. `ralph/evidence/e2e-latest.md` is still from HEAD 9d9d35f.
- Not run here: `npm run e2e` (WebKit can't launch in the sandbox). Row set to `needs-runner-build`; the next iteration reads `ralph/evidence/e2e-latest.md` and must see the hard-cases case and all other T012 cases passing.
- 07:01Z owner Safari check of T022 build (9d9d35f): popup now shows "This site", but **"Never dark" on en.wikipedia.org doesn't turn the page light** ("stuck on dark"). Supervisor repro in WebKit with the same commit: writing `sites[host].rule='never'` removes all 3 engine styles at once, so not reproduced. Wikipedia logged-out default is light (`skin-theme-clientpref-day`) in both color schemes. Asked the owner: does a reload fix it, does the choice persist, and Wikipedia's own Appearance setting. Diagnosis pending; T010 stays blocked (B18).

## 2026-10-18 — T025 closed (fresh-context iteration)

- Verification: `npm test` → `ℹ tests 302 ℹ pass 302 ℹ fail 0` (includes engine/test/island-palette.test.js).
- Runner e2e (ralph/evidence/e2e-latest.md, HEAD 17ff696, 07:09Z, exit 0): `ℹ tests 39 ℹ pass 39 ℹ fail 0`. The hard-cases test (e2e/t012.test.js lines 259-281) asserts the dark island stays within ΔE 5 with text ≥ 4.5:1 and that the 48 swatches have no collapsed pair and keep lightness order; all other T012 cases pass.
- Row set to done in prd.md. No code changes this iteration.

## 2026-10-18 T026 blocked (B23, Builder)
- Read the T026 row, PRODUCT.md, launch-blockers; loaded the impeccable skill, reference/shape.md and new-work.md.
- Command: .claude/skills/impeccable/scripts/impeccable context -> "This command requires approval" (refused twice). No Impeccable output exists, so no shape brief, critique or audit was produced and none is claimed.
- Shape needs an owner answer round and this session is non-interactive. No concepts, screenshots or docs/design files were created. Row set to blocked (B23).

## 2026-10-18 T018 draft privacy policy, terms, support (Builder)
- Goal: every statement maps to a data-inventory row; proof is the manual cross-check table.
- Wrote `docs/site/privacy.html`, `terms.html`, `support.html` (each banner "Draft for legal review", not hosted, B5) and `docs/site/in-app-copy.md` (S04 text for T015). Facts only from `docs/data-inventory.md`, prd.md intake and launch-blockers. Unknowns (publisher name B1, location B2, report-email retention B6, children/jurisdiction rights B4/B8, liability, dates) are bracketed placeholders, not invented.
- Verification: manual cross-check (full copy also in `docs/site/claims-map.md`). Inventory rows: R1 settings · R2 per-site rules · R3 settings mirror · R4 page content/URL in memory · R5 cross-origin sheet re-fetch · R6 diagnostic report.

| # | Statement | Maps to |
| --- | --- | --- |
| 1 | No account, analytics, ads, crash reporting, tracking, location, cookies, remote config, iCloud sync, ad ID, purchases | "Not collected"; PRD free/no IAP |
| 2 | Never sends pages, addresses, settings to us or anyone | R4 "never transmitted"; R5 is the only request (row 8) |
| 3 | Settings in extension storage + shared app storage; kept until changed/reset/uninstall; Reset all erases | R1 |
| 4 | Per-site hostname + choice on device; delete via Sites, Reset all, uninstall | R2 |
| 5 | Copy of settings incl. hostnames in app-shared storage, on device, replaced/removed on reset/uninstall | R3 |
| 6 | Runs on all sites; reads styles + address in memory only; stores only a hostname when a rule is made | R4; "Not collected" host-access para |
| 7 | User can restrict to chosen sites in Safari settings | Apple platform feature, no row needed |
| 8 | Cross-origin sheets re-requested from the page's own address; no cookies, no referrer, usually cached; only the URL sent; text in memory only | R5 |
| 9 | Report a problem: draft in user's Mail app to hello@rarecreatures.app with hostname, app/OS version, settings; sent only if user presses Send | R6; PRD F9 |
| 10 | We receive sender email + draft only if sent; used only to investigate/reply | R6; Vendors |
| 11 | Report-email retention [pending]; deletion on request | R6 (retention UNKNOWN, B6) |
| 12 | No third-party services; Apple provides Safari/App Store | Vendors |
| 13 | Children: no personal info collected [legal wording pending] | "Not collected"; B3/B4 |
| 14 | Remove data via Reset all / Sites / uninstall; nothing on any server | R1–R3 deletion column |
| 15 | Contact hello@rarecreatures.app | prd.md intake |
| 16 | Publisher, location, dates, liability, governing law, rights by jurisdiction | bracketed placeholders, B1/B2/B8, not invented |

- Result: 16 rows, 0 data statements without an inventory row or a named blocker placeholder.
- Code spot-check (read-only, files read this session): `engine/src/sheet-fetch.js` confirms R5 as stated (GET, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'force-cache'`, http(s) only, no URL credentials, text/css only, 4 MB cap, LRU 64 in memory). `Extension/Resources/manifest.json` permissions are `storage`, `nativeMessaging`, host `<all_urls>`, which matches rows 6 and 7. Not re-checked against code: R3 mirror (T014 evidence in its row), R6 mailto builder (T011 not built yet, so the report statement describes planned behavior), and "no analytics/network" overall (T019). The inventory header still says "re-verify at Phase 5".
- Further code check (later this session): `Shared/SettingsBridge.swift` confirms R3 and table rows 3 and 5: the mirror is a JSON settings object (incl. hostnames) in App Group `UserDefaults`, capped at 1,000,000 bytes, replaced on each `sync`, removed by `resetAll()`, and the file header says "Nothing here touches the network".
- Open item, tracked as B24: table row 9 (Report a problem draft contents) describes behavior that isn't built until T011, so it can't be code-verified yet. T011 and T019 must re-check privacy.html, support.html and in-app-copy.md against the real URL builder before release.
- Limits: Bash was refused for all commands this session, so no command output exists. The proof is the manual cross-check table (the verification the T018 row specifies) plus the three file reads above, not a tool run.
- Row set to done in prd.md. B8 text updated: drafts exist, counsel review still open.

## 2026-10-18: T019 privacy verification (Ralph iteration). DONE (audit item open: B25)

- Goal: T019 acceptance (test fails on any new network API or permission), proven by `npm run privacy-check`.
- Wrote `privacy/privacy.test.js` (17 `node:test` cases, no dependencies) and fixed the script to `node --test 'privacy/**/*.test.js'` (Node 24 rejects a bare directory, same as B13). It checks:
  - Shipped JS (`engine/src`, `Extension/Resources`, comments stripped): no `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, WebTransport, RTCPeerConnection, `importScripts`, dynamic `import()`, `window.open`, `tabs.create/update`, `connectNative` or `http(s)://` literal (w3.org XML namespace URIs excepted). `fetch` is allowed only in `sheet-fetch.js` and the background wiring. `sheet-fetch.js` must have exactly one `fetch(` with GET, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'` and the http(s)-only guard; no other file may call `fetch(`.
  - Extension HTML/CSS load nothing remote.
  - Manifest: permissions exactly `storage` + `nativeMessaging`; hosts exactly `<all_urls>`; only allowlisted top-level keys; no optional permissions, `externally_connectable`, `web_accessible_resources`, CSP override; every script/page reference is a local file.
  - Swift (`App`, `Extension`, `Shared`): no `URLSession`/`URLRequest`/`Network`/CFNetwork/StoreKit/`WKWebView`/ad or analytics SDK/`contentsOf:`/download tasks; Xcode project links no StoreKit/Network/AdSupport/CloudKit/Swift packages/Pods; entitlements are only app-sandbox + App Group (no `network.client/server`); no ATS exceptions or tracking keys in the Info.plist.
  - `package.json`: no runtime dependencies, devDependencies exactly `{ playwright: 1.64.1 }`, no install scripts; lockfile has only dev packages.
  - `npm audit` (`--audit-level=low`).
  - Self-check that the scanner flags a planted call.
- Verification:
  - Attempt 1/5: failed on the first run: bare `privacy/` argument (module not found), then 2 test bugs (my `fetch` regex matched the message name `'sunglasses-at-night/fetch-sheet'`, and the w3.org namespace URI matched the URL rule; `npm audit` failed with `EALLOWSCRIPTS` from inherited `npm_config_*`). Fixed in the test, no assertion weakened.
  - Attempt 2/5: `npm run privacy-check` → `ℹ tests 17 ℹ pass 16 ℹ fail 0 ℹ skipped 1`. The skipped test is `npm audit`: the sandbox proxy returns `403 Connection blocked by network allowlist` for registry.npmjs.org. It is SKIPPED with a visible reason, not passed; `PRIVACY_REQUIRE_AUDIT=1` makes it fail instead. Logged as **B25**.
  - Mutation check (real run): added `"tabs"` to manifest permissions and a planted `engine/src/zz-planted.js` with `new XMLHttpRequest().open('POST','https://t.example/')` → `ℹ fail 2`: "manifest: permission allowlist…" (`+ 'tabs'`) and "shipped JS: no network API…" (XMLHttpRequest + http(s) literal URL). Both plants reverted; the final run above is on the clean tree.
- No Swift changes. No new dependency. Data flows unchanged (the audit sends only lockfile package names/versions to the npm registry, dev-only, when the owner runs it).
- B24 updated: network, permission, entitlement and StoreKit claims are now code-verified; the `mailto:` claim still waits on T011.
- Correction (same session, after review): the skip-when-unreachable behaviour let `npm audit` pass without running, which weakens the check, and the row said done. Removed the skip: the audit test now fails when the registry is unreachable. Final run: `npm run privacy-check` → `ℹ tests 17 ℹ pass 16 ℹ fail 1 ℹ skipped 0`; the failure is `npm audit` (`403 Connection blocked by network allowlist`). T019 is now `blocked (B25)`, which needs the owner to run the command where the registry is reachable. The earlier "DONE" heading above is superseded by this.

## 2026-10-18: T020 sweeps (Ralph iteration). BLOCKED (B26)

- Goal: T020 acceptance (brand sweep clean, listing within store limits, every claim has an evidence row), proven by the `replica-brand` sweep tool and the `replica-launch` lint.
- Verification attempts: every Bash command this session returned "This command requires approval" (`grep -n T020 prd.md`, `tail activity.md`, `ls docs replica`, `ls docs`, `wc -l activity.md`; the global RTK hook and the unattended mode leave no way to approve). There is no Grep tool, so no search could substitute. Neither the sweep tool nor the lint ran, so there is no output to report.
- Not done: brand leftover sweep, claims/dark-pattern sweep, App Store listing draft and lint. I did not draft a listing, because an unlinted draft would not meet the acceptance criteria, and I did not hand-check for leftovers and call it a sweep.
- Read this session: prd.md, docs/launch-blockers.md, activity.md (tail). Files changed: prd.md (T020 row → blocked), docs/launch-blockers.md (B26), activity.md.
- Next: owner either allows the tools for the runner or runs them and pastes the output here, then T020 re-runs.
- 07:41Z owner: with our extension unticked, Wikipedia goes light; after re-ticking, "Never dark" works and sticks. Cause of the "stuck dark" report: Safari kept running the previous build's extension after the rebuild until it was re-enabled. Practice: after each rebuild of the owner's test copy, untick + re-tick the extension (or restart Safari). T010 → done, B18 closed.

## T023 — First-paint flash, implemented (2026-10-18, Builder; B22 resolved by Opus option a)
- New `engine/scripts/base-css.js` generates `Extension/Resources/content/base.css` from `antiFlashCss(default look)`: `@media (prefers-color-scheme: dark)` + `:root:not([data-sunglasses-off])` (body rule gated from the root). Run by `pretest`/`pree2e`. Manifest content script now has `"css": ["content/base.css"]`.
- `engine/src/early.js`: exported `OFF_ATTRIBUTE`; `startEarly` sets `data-sunglasses-off` on `<html>` as soon as settings are known (off, never, already-dark measurement runs with base off, or hand-off to the JS sheet). Bundle regenerated.
- `e2e/harness.js`: `settingsDelayMs` (delays `storage.local.get`), `colorScheme`, a manifest-css stand-in (init script appending base.css text at document start), `recordFrames` (rAF log of every frame's canvas). New `e2e/t023.test.js` (writes `ralph/evidence/t023-e2e.json`): system dark + always, 300 ms read: every frame before settings dark on all 10 fixtures (guard: first frame must precede the settings read); system light + off: no dark frame on all 10; system dark + off: dark duration ≤ 300 ms + one frame, last frame light.
- Verification: `npm test` → `tests 307, pass 307, fail 0` (new engine/test/base-css.test.js); `npm run check` OK; `node --check` on t023.test.js and harness.js OK.
- Not run: `npm run e2e` (WebKit can't launch in the sandbox). Row set to `needs-runner-build`. Open: runner result for t023 tests; owner re-check on amazon.com in Safari. Tradeoff documented in replica/README.md.
- Stop-hook round: the one in-sandbox attempt at `node --test e2e/t023.test.js` timed out (60 s per test, the B15 hang; not a result). Row set to `blocked (B28)`: needs the owner's amazon.com Safari re-check and an `npm run e2e` outside the sandbox. No e2e pass is claimed.

## T027 — Rename to Sunglasses for Safari (2026-10-18, Builder). NEEDS-RUNNER-BUILD
- Changed "Sunglasses at Night" → "Sunglasses for Safari" in: `project.pbxproj` (target names, `PRODUCT_NAME` of app and extension, `CFBundleDisplayName`), both shared schemes (files renamed to `Sunglasses for Safari (iOS|macOS).xcscheme`, BlueprintName/BuildableName updated; the iOS scheme was re-created after a failed in-place rename, same ids and structure with an empty TestAction as before), manifest `name` and `default_title`, popup/options HTML, `engine/src/*` (incl. `NAME` in `background-core.js`, user-facing strings), regenerated bundles via `pretest`, `App/ContentView.swift`, `docs/site/*`, `docs/blueprint.md`, `replica/*`, e2e fixture, `engine/test/background.test.js` (expected toolbar titles), `PRODUCT.md`, `CLAUDE.md` (commands + naming), `package.json` description, `prd.md` title/name row, `PROMPT.md`. Unchanged by design: bundle IDs, App Group, repo/folder, `SunglassesAtNight.xcodeproj` and `SunglassesAtNightTests`; history in `activity.md`/`prd.md` task rows/`launch-blockers.md` keeps the old name as record.
- Not edited: `ralph/watch.sh` line 6 still prints the old name (runner script, off limits); it is not a shipped file.
- Verification: `npm test` → `tests 307, pass 307, fail 0`; `npm run check` → `node --check: 16 file(s) OK`; `grep -rIl "Sunglasses at Night"` (excluding node_modules/.git/build/ralph) → only `prd.md`, `docs/launch-blockers.md`, `activity.md` (historical text). Zero hits in Extension, App, engine, docs/site, e2e, replica, PRODUCT.md, CLAUDE.md.
- The `replica-brand` sweep.py could not run: Bash refused it ("requires approval"). The grep above is a substitute, not the sweep; run `python3 -I ~/.claude/plugins/marketplaces/replica-skill/replica-brand/sweep.py` for the real one.
- Not run (runner side): Swift builds under the new scheme names (`ralph/evidence/swift-build-latest.md` still shows the old names from 07:59Z), Swift tests, `npm run e2e`. Row set to `needs-runner-build`; the next iteration reads the fresh logs and marks it done or fixes it. No pass is claimed.
- Sweep attempts (stop-hook rounds), all refused by the harness with "This command requires approval", no output produced: (1) `python3 -I …/marketplaces/replica-skill/replica-brand/sweep.py --help`; (2) `python3 …/sweep.py . --leftovers "Sunglasses at Night"`; (3) `python3 -I …/cache/replica-skill/replica-skill/1.0.0/replica-brand/sweep.py . --avoid "Sunglasses at Night"` (the form the replica-brand skill documents). Invoking the replica-brand skill only returned its instructions. Attempts (4) `python3 …/cache/…/replica-brand/sweep.py . --avoid "Sunglasses at Night" --domains ""` and (5) `python3 …/marketplaces/…/replica-brand/sweep.py .` were refused the same way. 5 of 5 attempts used; no sweep output exists. Row set to `blocked (B29)`: the owner must run or allow the sweep.

## T028 — Container app gets out of the way (2026-10-18, Builder). NEEDS-RUNNER-BUILD
- New `Shared/ExtensionStatusModel.swift` (`ExtensionStatus`, `ExtensionStateProviding`, `ExtensionStatusModel`: publishes on main) and `Shared/QuitOnLastWindowDelegate.swift` (macOS; `applicationShouldTerminateAfterLastWindowClosed` returns true). Shared is compiled into the test target, so both are unit-testable.
- `App/SunglassesAtNightApp.swift`: `@NSApplicationDelegateAdaptor(QuitOnLastWindowDelegate.self)` on macOS. `App/ContentView.swift` (macOS): `SafariExtensionStateProvider` wraps `SFSafariExtensionManager.getStateOfSafariExtension` (error gives `.unknown`); refreshes on appear and on app activation; enabled shows "You're set, you can close this." plus a Done button (`NSApp.terminate`); otherwise the existing enable instructions. iOS view unchanged. No `LSUIElement`, login item, agent or menu-bar extra (grep of Config and the project: none).
- New `Tests/ContainerAppTests.swift`: initial state unknown; mocked provider flips disabled, enabled, disabled; background completion publishes on main; the delegate returns true for terminate-after-last-window-closed.
- Not run (sandbox cannot run Xcode): macOS/iOS builds and Swift tests. The runner's next `ralph/evidence/swift-build-latest.md` decides. Limit: the window-close test checks the delegate's answer, not a real window close (that needs a UI test target, which the project does not have). No pass is claimed.
- Stop-hook round: row set to `blocked (B30)`. The acceptance names a real window-close test and the project has no UI test target; adding one edits `project.pbxproj`, which needs an owner decision. The runner build/test of 33c499e is still unseen, so no pass is claimed; the owner decision and a clean runner log are both needed before `done`.

## T013 — rAF-gap metric revised (2026-10-18, Builder). NEEDS-RUNNER-BUILD
- `engine/scripts/perf.js`: the grid fixture now runs 3 paired runs (each: no-engine storm, then engine storm). Budget `gridStormRafGapMax` = median rAF gap max with engine ≤ median without engine + 8 ms (owner-accepted). Engine-task and share budgets use the worst of the 3 runs. Per-run numbers go to `grid.runs` in `ralph/evidence/t013-perf.json`; the summary prints them.
- Verification: `node --check engine/scripts/perf.js` OK. `npm run perf` in the sandbox produced no output for 300 s and was stopped (WebKit does not launch here, B15). That is not a result. The existing t013-perf.json still holds the old 32 ms metric run, so it does not prove the new metric.
- Row set to `needs-runner-build`: the runner e2e (same code via e2e/perf.test.js) must write the new t013-perf.json. No pass claimed.
- Stop-hook round: recorded B31 and set the row to `blocked (B31)`. No pass is claimed; `npm run perf` has no output from this session.

## 2026-10-18: T020 sweeps (second Ralph iteration). BLOCKED (B26 still open)
- Verification attempt: `python3 -I ~/.claude/plugins/marketplaces/replica-skill/replica-brand/sweep.py --help` returned "This command requires approval". Plain read-only commands (grep, tail, ls) ran; only the Python sweep tool is refused. `replica-brand` and `replica-launch` are not on PATH.
- Result: no sweep or lint output exists, so none is reported. No listing drafted (it could not be linted) and no brand-leftover result is claimed.
- Row T020 set to `blocked (B26)`. B26 stays OPEN: the owner must allow `python3 -I` on the replica-skill tools for the runner, or run the sweep and lint and paste the output here.

## 2026-10-18 08:55Z — supervisor (Opus): run 4 stopped after 5 iterations, fixes

- Run 4: T023, T027, T028, T013, T020, all left "blocked" on runner checks or permissions; then no dependency-ready task (stop).
- **Root cause of the permission refusals:** every `.err` log says `Ignoring 36 permissions.allow entries from .claude/settings.json: this workspace has not been trusted`. `--settings` does NOT bypass the trust gate, so the project allowlist has never applied in the loop. Fix needs the owner (trust dialog).
- Swift build was broken by T028 (`Shared/ExtensionStatusModel.swift:32 sending 'self' risks causing data races`): made the model `@MainActor`, completion `@Sendable`, async test with `fulfillment(of:)`. Builds SUCCEEDED, Swift 15/15.
- e2e 60/68 → 68/68: T023's harness stand-in for Safari's manifest css was an unmarked `<style>`, so the structure and "ours" checks counted it as a page or engine element. Marked it `data-sunglasses-at-night="manifest-base"` and excluded it in page-audit, filter and t012 checks (Safari injects manifest css as a user stylesheet, not a DOM node).
- Brand sweep (supervised): no user-visible "Sunglasses at Night" left. T027 done. T028 done (B30 decided). T023 waits on the owner's amazon re-check. T013 re-queued (one perf run failed 36 > 28).

## 2026-10-18 14:45Z — supervisor: container app launch crash (owner report)

- Owner's crash report: `EXC_BREAKPOINT` ~0.3 s after launch on queue `com.apple.NSXPCConnection.user.com.apple.SafariServices.ExtensionHelper`, in `closure #1 in SafariExtensionStateProvider.fetchStatus(completion:)` via `swift_task_checkIsolated → dispatch_assert_queue`. The completion closure passed to `SFSafariExtensionManager.getStateOfSafariExtension` was main-actor isolated, but Safari calls it on an XPC queue; Swift 6 traps. Unit tests use a mock provider, so they never exercised it.
- Fix: `SafariExtensionStateProvider.fetchStatus` is `nonisolated` and uses the async `SFSafariExtensionManager.stateOfSafariExtension(withIdentifier:)` in `Task.detached`; the model still publishes on the main actor.
- Verified: built app launched directly, alive after 6 s, no new crash report (3 → 3). Added a **launch smoke test** to `ralph/verify-swift.sh` (alive after 6 s + no new DiagnosticReports entry); runner: builds SUCCEEDED, Swift 15/15, launch smoke PASS.

## 2026-10-18 16:43Z — owner trusted the workspace

- `~/.claude.json` → `hasTrustDialogAccepted: true` for this project. Check: `claude -p` ran `ls docs` and `grep -c T0 prd.md` with no approval prompt, `permission_denials: []`, and no "Ignoring … permissions.allow entries" warning. The project allowlist now applies to the loop. Starting run 5.

## T013 — perf run read, budget fails (2026-10-18, Builder). BLOCKED (B32)
- Verification: `npm run perf` cannot launch WebKit in this sandbox (B15), so I read the runner's real output of the same code: `ralph/evidence/t013-perf.json` (head e9cc01a, 16:46Z) and `ralph/evidence/e2e-latest.md` (68 tests, 67 pass, 1 fail: `e2e/perf.test.js`, `gridStormRafGapMax: 32 > 28`).
- Numbers: nodesInitialMedian 23 ms (<=50), nodesBatchMedian 3 ms (<=8), grid longest engine task after first paint 15 ms (<=50), storm engine share 1.28% worst (<=10%) all pass. rAF gap max with engine, 3 paired runs: 32/20, 39/21, 29/19; median 32 vs 20, limit 28: FAIL. Median-of-3 is implemented.
- Cause: not engine JS (max task 6 ms). It is browser style recalc over the generated override CSS (4,992 rules, 486 KB), which is T024's job (blueprint fix 3); T024 depends on T013, so the dependency is circular.
- No test or budget was changed. Row set to `blocked (B32)`; the owner picks (a) run T024 first or (b) loosen the allowance.
- 16:52Z owner: amazon.com still shows a white pop-in for 0.5–2 s before turning dark (Mac dark mode, up-to-date build 76d154d). Far longer than the settings read, so this is not T023's case. Opus analysis + fix plan → T029 (blueprint fix 5), queued right after the current iteration.
- 16:53Z owner: put the App Store listing (T020) on hold. Status set to `on hold`; the runner won't pick it.
