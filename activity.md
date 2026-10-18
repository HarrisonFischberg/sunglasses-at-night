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
