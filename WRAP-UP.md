# Sunglasses at Night: wrap-up (2026-10-19)

Owner decision 2026-10-19: **personal use, wrap up.** The build loop is
stopped. Nothing was published, submitted or deployed. The only outward-facing
action was the private GitHub repo and its `build/v1` branch.

## What you have

A Safari Web Extension that darkens every website, with a small container app.

- Dark mode: match system, always, on a schedule (crosses midnight), or off; Option+Shift+N toggles it.
- Per site: default, always dark, never dark, a per-site look (brightness, contrast, sepia, grayscale) and engine.
- Engines: dynamic (rewrites the site's colors, keeps text ≥ 4.5:1) and filter (inverts, then flips photos back) as a fallback.
- Images: leave, dim, or don't invert; option to hide background images; already-dark sites left alone.
- Handles the hard cases found while testing: no white flash while a site's late style files load (Amazon), multiply-blended product photos and tints (Amazon grids), text over photos, Shopify "number triplet" colors (Quiet Town), content inserted after load.
- Popup and options page in concept B's layout and blue-black / teal colors; teal sunglasses icon everywhere.
- Report a problem: opens a Mail draft to support@rarecreatures.app with the site name. Never sent automatically.
- No network code, analytics, account or tracking (`npm run privacy-check`: 17/17, 0 vulnerabilities).

## State of the checks (last runs)

| Check | Result |
| --- | --- |
| Engine unit tests (`npm test`) | 339 / 339 |
| WebKit browser tests (`npm run e2e`) | 109 / 110 at f998c20 (single-run speed test, since replaced by median of 3); `e2e/perf.test.js` median of 3 passes every gating budget (batch 7.5 / 8 ms, thin headroom) |
| macOS + iOS Simulator builds, Swift tests, launch smoke | pass |
| Your Safari checks | popup, Never dark, shortcut, scrolling OK; status line fix and the latest Amazon / Quiet Town fixes in your current copy, not yet confirmed by you |

## Rebuilding on your Mac

```bash
scripts/build-mac.sh
```

Then Safari ▸ Settings ▸ Extensions → untick and re-tick "Sunglasses at Night".
The build is signed with your Apple Development certificate but has no
provisioning profile (Xcode on this Mac isn't signed in to an Apple ID). If
Safari drops the extension after a restart, turn on Develop ▸ "Allow unsigned
extensions", or sign Xcode into your Apple ID (Xcode ▸ Settings ▸ Accounts)
and build with your team for a fully provisioned copy.

## If you ever want the App Store

Remaining items, all recorded in `prd.md` and `docs/launch-blockers.md`:

1. Run on iPhone / iPad (T016) and the accessibility pass of the app screens (T015, `docs/accessibility-t015.md`).
2. Owner facts: seller name and country (B1, B2), a public privacy-policy URL (B5), report-email retention (B6), Apple Developer team signing (B7), "4+, not Kids" confirmed (B3).
3. Legal: trademark check of the name (B9), review of the privacy policy and terms drafts in `docs/site/` (B8).
4. App Store listing text (T020, on hold) and the final launch-readiness report (T021).

This is engineering launch-readiness, not legal compliance: nothing here has
legal approval.

## Where things are

- Code: `engine/src` (logic, the source of truth) → `node engine/scripts/bundle.js` → `Extension/Resources` (what Xcode ships); `App/`, `Shared/` (container app).
- Plan and history: `prd.md` (tasks), `activity.md` (log), `docs/blueprint.md` (architecture + fixes 1–9), `docs/design/` (directions, comparison, system).
- Loop tooling (stopped): `ralph/` (runner, verify scripts, evidence).
- Branch: `build/v1` on github.com/HarrisonFischberg/sunglasses-at-night (private).
