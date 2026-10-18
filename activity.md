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
