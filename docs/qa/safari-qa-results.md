# Safari QA results (2026-10-19, paused)

Paused by the owner on 2026-10-20 to try the fixes in real use. Nothing was
committed, pushed or published. How to resume: see the end of this file.
Suite layout and commands: `qa/README.md`.

## What actually ran

| Target | Ran? | Build | Coverage |
| --- | --- | --- | --- |
| Installed extension, macOS Safari 27.0.1 (macOS 27.0.1, dark appearance) | yes | fixed `34e7fb11` | 229 of 231 manifest rows (228 domains), 1 blocked (britannica.com paywall), zoom.us not finished (Safari hung). Pilot 10 × 5 startup repeats: 45 PASS, 5 FAIL (all amazon.com). |
| Installed extension, Mobile Safari, iOS 27.0 Simulator (iPhone 17, light appearance) | yes, partial | fixed `34e7fb11` | 132 of 231 rows (131 domains) attempted, 127 completed, 3 blocked (target.com, zillow.com CAPTCHA; lonelyplanet.com access denied), 2 not finished (theguardian.com, weather.com: the UI test stopped responding). Stopped at the owner's request. 13 fixtures (the strict-CSP fixture `fx-csp` was added later and has not run in Safari); pilot 10 × 5 startup repeats: 38 PASS, 12 NEEDS_REVIEW, 0 FAIL (pre-fix: 10 FAIL). |
| Pre-fix baseline (HEAD `42c65ba`, engine `92eb4e4f`) | yes | | iOS: 13 fixtures, 10-site pilot, 5 × startup repeats. Mac: pilot + 5 × startup repeats (Mac baseline used an earlier runner whose on/off tracking could misread already-dark sites; its Amazon and Quiet Town recordings were checked by eye). |
| iPad simulator, physical devices | no | | iPad simulator created ("Sunglasses QA iPad") but not run. |
| Supplementary | Playwright WebKit (diagnosis only, labelled) | | Not counted as Safari acceptance. |

Each live site: startup recorded from before navigation to readiness, OFF
(fresh load), ON (same loaded page), OFF again (restoration), scrolled OFF/ON.
Statuses per category with reasons are in each `results.json` and the HTML
report (`node qa/report.mjs <run>`).

Fixed build, automated statuses (not visually reviewed unless noted):

| Category | macOS PASS / FAIL / REVIEW / UNTESTED | iOS PASS / FAIL / REVIEW / UNTESTED |
| --- | --- | --- |
| Startup flash | 150 / 34 / 44 / 0 | 38 / 9 / 6 / 76 (recordings lost, see harness limits) |
| Surfaces | 93 / 2 / 36 / 11 | 84 / 16 / 7 / 3 |
| Media | 89 / 8 / 46 / 53 | 67 / 9 / 26 / 2 |
| Text & controls | 81 / 20 / 64 / 63 (+ computed-style audit: 128 / 16 / 21 / 19) | 100 / 3 / 24 / 2 |
| Function | 213 / 0 / 15 / 0 | 126 / 0 / 1 / 2 |
| Restoration | 146 / 17 / 64 / 1 | 117 / 5 / 5 / 2 |

The FAIL and NEEDS_REVIEW rows were sampled by eye, not all reviewed. Several
categories of false alarm were found and the checks tightened (carousels and
app-install sheets changing the page between paired captures, Safari not
drawing a covered window). The remaining FAILs still need per-site review.

Harness self-check (known-bad fixtures, iOS, before and after the fixes): a
white flash, a greyed photo, unreadable text and a click-blocking overlay are
each detected; the correct baseline page passes every check.

## Bugs found and fixed (in source, unit tests 346/346, privacy checks 17/17)

| # | Severity | Bug | Evidence (before → after) | Fix |
| --- | --- | --- | --- | --- |
| B1 | high | First frame paints white when dark mode is on regardless of a light system ("Always", schedule, "Always dark" sites): the anti-flash CSS only applies in dark appearance until the async settings read lands. | iOS fixtures: page light in the first animation frames 4/36 → 0/29 runs; video shows the full white page for one frame. | `engine/src/first-paint.js`: the background registers the same CSS without the media gate at `document_start` (`scripting` permission, owner-approved 2026-10-20; recorded in `prd.md`, `docs/data-inventory.md`). |
| B2 | high | Product photos black under a light `::after` tint with `mix-blend-mode: multiply` (Amazon Fresh pattern). | `qa/fixtures/media.html` tile black → photo visible (iOS). | Rule-level: a light/clear background that blends in the same rule becomes transparent (also reaches pseudo-elements). |
| B3 | medium | White page under light text mid-load when a late sheet paints html/body white (Shopify). | quiettownhome.com startup: iOS 5/5 FAIL (69% bright) → 5/5 PASS; Mac 4/5 → 5/5 PASS. | Re-armed interim sheet carries the dark root/body base again. |
| B4 | medium | Late custom elements (shadow DOM) white for ~1 s. | reddit.com startup: iOS 5/5 FAIL (up to 19% bright for ~1 s) → 5/5 NEEDS_REVIEW (3–10% bright); Mac 5/5 NEEDS_REVIEW → 5/5 PASS. | Pending shadow hosts checked every frame for 10 s. |
| B5 | high | `z-index:-1` content hidden (NYT lead photos vanished): our root background stopped body-to-canvas propagation. | nytimes.com iOS lead photo gone → shown (WebKit diagnosis; Mac NYT 5/5 startup PASS). | Root background left to the body when the page relies on propagation. |
| B6 | medium | Black inline SVG logos (`fill="#000"` attributes) invisible (NYT wordmark). | WebKit diagnosis: fill `#000` → light; fixture `svg-logo-black`. | Zero-specificity rules map dark neutral fill/stroke attributes. |
| B7 | medium | On sites whose CSP forbids inline styles (gov.uk, mozilla.org, pypi.org, mastodon.social) the popup said "on" while the page stayed white. | Mac Safari gov.uk: our `<style>` elements have no sheet. | Content script detects the blocked sheet and reports "this site's security policy blocks it". **Built into the Mac app at the end, not yet re-tested in Safari** (WebKit diagnosis only). |

Also: popup declares `<meta name="color-scheme" content="dark">` (iOS sheet
title was black on dark); not re-verified.

## Still open

1. **amazon.com on your signed-in Mac: white content area for ~1 s, about 1 s after navigation, 5/5 runs, before and after the fixes.** Every computed style polled during that second is dark, and it does not reproduce in Playwright WebKit or the iOS Simulator. Cause not found; looks like Safari painting before our styles take effect. Recordings: `build/qa/runs/final-repeat/macos-safari`, `build/qa/runs/amazon-check`.
2. **Blank white frames during navigation on some Mac sites** (yelp.com, merriam-webster.com, wsj.com: 0.2–0.4 s, whole page empty). Probably the same mechanism as 1.
3. **Text left dark on dark** (computed colors, Mac): coursera.org, irs.gov, newyorker.com, food52.com, patagonia.com and 11 more (`textDom` FAIL). Not reproduced in WebKit; Safari-specific sheet handling suspected.
4. **Strict-CSP sites can't be darkened at all** (B7 only makes it honest). Real fix: constructable stylesheets (`adoptedStyleSheets`), which CSP does not block.
5. Dark transparent `<img>` logos (Wikipedia wordmark) invisible; colored SVG icons and brand accents washed out (Allrecipes stars, Amazon/Reddit buttons); saturated CSS gradients darkened ~5×.
6. Same-origin iframe can show its own white for one frame on load (fixture `dynamic.html`).
7. One Safari WebContent out-of-memory crash during the Mac run, in the CSP-violation path (`com.apple.WebKit.WebContent-2026-10-19-194639.ips`); site not identified.
8. apple.com/iphone: top section captured blank with dark mode on; inconclusive (capture may have hit an undrawn window).

## Harness limits found

- Safari stops drawing a covered or minimized window: Mac captures/recordings then prove nothing (now detected and marked UNTESTED).
- Mac dark mode is switched with Option+Shift+N; a focused text field swallows it (now blurred first). Live ON/OFF pairs on some Mac sites still did not take (marked UNTESTED).
- Mac fixtures can't load: Safari's HTTPS-Only mode blocks `http://localhost` (set `QA_MAC_HTTP=1` if it is turned off).
- iOS: `simctl recordVideo` files were lost in 23 of 40 batches when runs were restarted, hence 76 iOS flash UNTESTED; heavy pages (theguardian.com, weather.com) can hang the accessibility snapshot.
- Running the simulator and Safari together overheated the Mac; run one platform at a time.

## Resume from here

**Cool-down mode (recommended, overnight, Mac plugged in):**

```bash
node qa/cooldown.mjs
```

It finishes the pending Mac rows first (2 at the time of writing), then the
iPhone rows (104), one site at a time with a 20 s pause, never both platforms
at once. Before each site it checks the Mac's thermal state and load and waits
until they are back to normal. It keeps the display awake; leave the Safari
test window uncovered. Ctrl-C stops it; the same command continues from the
checkpoints. `--dry-run` lists what would run, `--platform mac|ios` limits it,
`--pause 60` slows it further. Log: `build/qa/cooldown.log`.

The iPhone rows continue in the same run folder on whichever build is
installed in the QA simulator (now the popup build, commit `b1bd8b2`; earlier
rows used `34e7fb11`). Each batch's `env.json` records the installed engine hash.

Manual commands, if needed:

Run state is in `build/qa/runs/` (git-ignored): `fixed/ios-Sunglasses-QA-iPhone` (iOS, checkpoint at 126 done), `final/macos-safari` (Mac, 229 done), baselines in `baseline*`.

```bash
# iOS: continue the 230-row run where it stopped (one platform at a time)
node qa/run-ios.mjs sites --set full --run fixed --batch 5 --retry 1
node qa/analyze.mjs build/qa/runs/fixed/ios-Sunglasses-QA-iPhone
# Mac: retry the unfinished rows (zoom.us) and re-test the B7 build on gov.uk
node qa/run-mac.mjs sites --set full --run final --retry 2
node qa/run-mac.mjs sites --ids gov.uk,mozilla.org,pypi.org,mastodon.social --run csp-check
node qa/report.mjs final
```

Before resuming on iOS, install the current build (the runs above used `34e7fb11`; the tree now builds `8e6ef34a` with B7): `node qa/run-ios.mjs setup --run fixed` (if Settings automation fails, the extension stays enabled across reinstalls; the activation fixture proves it).
