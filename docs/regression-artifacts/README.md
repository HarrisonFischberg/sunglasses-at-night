# Regression artifacts: WebKit harness and real Safari (2026-10-28)

Branch under test: `claude/project-thread-3d83p0`, run on Harold's Mac
(macOS 27.0.1, Safari 27.0.1, Playwright 1.64.1 WebKit). Fixture pages only.

## Results

| Run | Pass | Fail | Output |
| --- | --- | --- | --- |
| `npm test` (unit) | 381 | 0 | `tap/unit-tests.txt` |
| `npm run regression` (WebKit) | 24 | 0 | `tap/regression-webkit.txt`, `webkit-darwin-1024x900/` |
| `npm run e2e` (full, WebKit) | 143 | 7 | `tap/e2e-full-webkit.txt` |
| `qa/safari-regression.mjs` (real Safari) | 7 pages, 0 contrast failures | 0 | `safari-macos/`, `tap/safari-macos-run.txt` |

All 7 e2e failures are known and pre-existing on `main`:

- `e2e/t030.test.js` popup @ 390x844 / 1440x900 (6 tests): "text contrast >= 4.5:1",
  `Match system` at 1.1:1. Flaky in count on both trees: the same file on `main`
  failed 1 and 3 variants in two runs, on this branch 6 and 2
  (`tap/main-t030-sitefixes.txt`, `tap/rerun-t030-*.txt`).
- `e2e/site-fixes.test.js` "site fix: sheet after the override, fix rule wins,
  INVERT applied": `page.waitForFunction: Timeout 30000ms exceeded.` Fails on `main` too.

## Real Safari (`safari-macos/safari-regression.json`)

Proof before any result: ready mark set, 4 extension sheets, canvas luminance 0.008.

| Page | Text checked | Min ratio | Failures |
| --- | --- | --- | --- |
| forms | 11 | 6.54 | 0 |
| inputs | 22 | 6.54 | 0 |
| layers | 7 | 6.37 | 0 |
| css-cases | 13 | 10.95 | 0 |
| embedded | 5 | 6.47 | 0 |
| media | 2 | 12 | 0 |
| own-dark | 4 | 6.85 | 0 |

Typed text (17 fields): ratios 12.32 to 16.67 (forms `#email` 13.04).
Layers, pixel inside vs outside the surface: menu 39 / 20, dialog 39 / 13,
popover 39 / 20, custom modal 39 / 12 (surfaces stand off the page).

Safari captures are cropped to the page (Safari's toolbar and bookmarks bar removed).

## Manual picker checks (Harold, real Safari)

1. Email ▸ Remove dark mode: only that field turned white. Pass.
2. "Search" inside the web component: the menu says it can't be fixed on its own
   and focuses Bigger area; clicking Remove dark mode does nothing. Bigger area ▸
   Remove dark mode showed "Some text in it is hard to read now (3 places)"; Undo
   restored the dark box. Pass, with one finding below.
3. Reload: the Email fix still applies, nothing else changed (verified in the page:
   only `input#email` carries a fix). Pass.

Steps 4 (autofill) and 5 (iPhone) were not run.

## Findings

- Picker: the fix buttons are disabled for a part inside a web component, but
  `engine/src/picker.js` has no `button:disabled` style, so they look clickable.
  Addressed on `claude/project-thread-3d83p0` after this run (commit 4700733, the
  buttons are hidden); these captures and Harold's check predate that commit.

## Run notes (local only, not committed to the branch under test)

- Safari's HTTPS-Only behaviour ("Warn before connecting to a website over HTTP",
  Settings ▸ Security) blocks the http://localhost fixtures in new windows; it was
  turned off for the run.
- Safari's website access for the extension is per origin, and the fixture server
  picks a random port, so the run pinned the port via a local `SAN_SITE_PORT` edit to
  `e2e/harness.js`.
- `qa-mac shot` (ScreenCaptureKit) failed with SCStreamErrorDomain -3811 right after
  Screen Recording was granted; the run fell back to `screencapture -x -o -l <window>`
  (same 2x window image).
- Safari ▸ Settings ▸ Extensions ▸ Edit Websites crashes Safari 27.0.1
  (`-[WebsitesPreferences _updatePreferencePaneForSelectedPreference]`).
