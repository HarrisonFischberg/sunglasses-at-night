# Safari QA suite

Installed-extension testing for Sunglasses at Night in **real macOS Safari**
and **Mobile Safari in the Xcode iOS Simulator**, plus deterministic fixtures
and a shared 230-domain live-site manifest. Nothing here injects the
extension's CSS or calls engine functions: every run goes through the
installed app extension and its own controls (the popup on iOS, the
Option+Shift+N shortcut on the Mac).

Results of the 2026-10-19 runs, findings, fixes and how to resume: `docs/qa/safari-qa-results.md`.

`qa/diag-webkit.mjs` is a supplementary Playwright WebKit diagnosis helper (never Safari acceptance).

## Layout

| Path | What |
| --- | --- |
| `manifest/sites.json` | shared live-site manifest (230 rows, 230 distinct domains; sets `pilot` = 10, `p50` = 50). Edit `manifest/build-manifest.mjs`, then run it. |
| `manifest/fixtures.json` | deterministic fixtures, including the known-bad harness checks |
| `fixtures/` | fixture pages, `probe.js` (page-side observer, fixtures only), synthetic images (`make-images.mjs`) |
| `lib/server.js` | fixture server on :8765 with `?delay=` / `?stall=` and a beacon endpoint |
| `ios/SafariQA.xcodeproj` | XCUITest runner: enables the extension in Settings, drives Safari and the extension popup |
| `run-ios.mjs` | iOS host runner: builds/installs, batches, screen recording, resumable checkpoint |
| `run-mac.mjs` | macOS runner: dedicated Safari window, AppleScript navigation + DOM audit, ScreenCaptureKit capture/recording |
| `tools/qa-image.swift`, `tools/qa-mac.swift` | image/video metrics and macOS window capture (Apple frameworks only, built into `build/`) |
| `analyze.mjs`, `lib/judge.js` | measurements → per-category statuses (thresholds in `judge.js`) |
| `report.mjs` | HTML report with paired captures and startup timelines |

All output goes to `build/qa/runs/<run>/<platform>/` (git-ignored: it holds
third-party screenshots, which this repo does not redistribute).

## One-time setup

**iOS Simulator** (no manual steps):

```bash
xcrun simctl create "Sunglasses QA iPhone" "iPhone 17" com.apple.CoreSimulator.SimRuntime.iOS-27-0
node qa/run-ios.mjs setup
```

`setup` builds the app for the simulator, installs it, and runs
`testEnableExtension` (Settings ▸ Apps ▸ Safari ▸ Extensions ▸ Sunglasses for
Safari: on, All Websites: Allow). Use a dedicated simulator: the runner
drives Safari in it. An iPad run: create "Sunglasses QA iPad" and pass
`--device "Sunglasses QA iPad"`.

**macOS Safari** (manual, once):

1. `scripts/build-mac.sh`, then Safari ▸ Settings ▸ Extensions: untick and re-tick Sunglasses at Night.
2. Safari ▸ Settings ▸ Developer: tick **Allow JavaScript from Apple Events**.
3. System Settings ▸ Privacy & Security ▸ **Screen & System Audio Recording**: allow the app that runs the command (Terminal, or Claude).
4. System Settings ▸ Privacy & Security ▸ **Accessibility**: allow the same app (it presses Option+Shift+N).

The Mac run brings Safari to the front for each shortcut press: don't use
the Mac while it runs.

## Cool-down mode

`node qa/cooldown.mjs` finishes the saved runs one site at a time, one platform at a time, pausing whenever the Mac is hot or busy (see `docs/qa/safari-qa-results.md`).

## Commands

| What | iOS Simulator | macOS Safari |
| --- | --- | --- |
| prove the installed build is active | `node qa/run-ios.mjs sites --set fixtures --ids fx-activation` | `node qa/run-mac.mjs check` |
| fixtures + harness checks | `node qa/run-ios.mjs sites --set fixtures --run R` | `node qa/run-mac.mjs sites --set fixtures --run R` |
| smoke (3 sites) | `node qa/run-ios.mjs sites --set smoke --run R` | `node qa/run-mac.mjs sites --set smoke --run R` |
| 10-site pilot | `--set pilot` | `--set pilot` |
| 50 sites | `--set p50` | `--set p50` |
| full (230 rows) | `--set full` | `--set full` |
| one site | `--ids example.com` | `--ids example.com` |

Then:

```bash
node qa/analyze.mjs build/qa/runs/R/ios-Sunglasses-QA-iPhone
node qa/analyze.mjs build/qa/runs/R/macos-safari
node qa/report.mjs R
```

Runs resume: each platform folder has `checkpoint.json`; a rerun skips sites
already done (`--fresh` starts over, `--retry N` sets attempts per site).

## What each site run does

Dark mode is persisted on between sites. Per site:

1. **startup-on**: a launcher page (`fixtures/go.html`, already dark) navigates to the site and beacons the exact time; the screen is recorded from before that moment to readiness (iOS: `simctl io recordVideo`; Mac: ScreenCaptureKit, 60 fps, per site).
2. **fresh-off**: dark mode off through the real control, reload: the original page.
3. **live-on**: dark mode on, same loaded page (paired with fresh-off).
4. **live-off**: off again, same page: restoration (vs fresh-off).
5. **scrolled-off / scrolled-on**: scrolled further down (lazy media, sticky headers), paired.

Readiness: Safari finished loading and the screen stopped changing (two
near-identical frames), or 4 s of only small changes for pages that never stop
animating ("animated"). Readiness failures are recorded, never hidden.

## Statuses

Per platform, site and category: PASS, FAIL, BLOCKED, UNTESTED, NEEDS_REVIEW,
NOT_APPLICABLE, each with a reason. Categories: startup flash, surfaces, media,
text/controls, function, restoration. Fixture pages add DOM-side evidence from
`probe.js` (flashDom, textDom, mediaDom, tap delivery); the Mac adds an
in-page computed-style audit on every site (textDom, mediaDom, restoreDom).
Evidence is `automated` unless a person reviewed the captures
(`<platform>/reviews.json`, shown as ✓).

Limits that matter when reading results:

- Simulator results are not physical-device display results.
- Flash timing is limited by the recording's frame gaps (reported per run).
- iOS text/media checks are screenshot estimates; the Mac's are computed styles.
- Login, paywall, CAPTCHA and geo walls are BLOCKED, never PASS.
