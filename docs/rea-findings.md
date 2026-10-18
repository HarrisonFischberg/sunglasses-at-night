# REA findings

Authorized target: Noir – Dark Mode for Safari (Jeffrey Kuiken), Dark Reader
for Safari (Dark Reader Ltd), Midnight: Dark Mode for Safari (BigBalli
Consulting llc). Named by the owner 2026-10-18.

Authorization and restrictions: owner said "yes" to using these as references
without naming a scope, so I applied the narrowest one: **public pages only**.
That means App Store listings, developer marketing pages, and the public MIT
`darkreader/darkreader` repository (file structure only). I did not buy,
install, decompile, or runtime-inspect any of the three apps. None is
installed on this Mac. Widening the scope (for example licensed local copies)
needs a new owner answer.

Methods used (least intrusive first):
1. Public browser observation. REA web capture (`capture_web_screenshot`,
   `inspect_web_page`) is **BLOCKED**: no CDP browser on this Mac (see
   `docs/tool-environment.md`). Fallback: fetched public App Store pages as
   text (WebFetch / WebSearch), dated 2026-10-18.
2. Static inspection: GitHub API listing of the `darkreader/darkreader` MIT
   repo's `src/generators` and `src/inject` directory names. No source file
   contents were read or copied.
3. Runtime inspection: not done (not authorized, nothing installed).

| # | Observation | Evidence | Verified or inferred | Limitation | Informs |
| --- | --- | --- | --- | --- | --- |
| R1 | All three are Safari Web Extensions inside a container app. Midnight and Dark Reader sell one universal purchase covering iPhone, iPad and Mac. Noir's iOS and Mac apps were separate purchases (2021 review). | App Store listings id6760980920, id1438243180, id1581140954 | Verified (listing text) | Listing claims are not runtime-checked | One universal app, free on every platform (F1) |
| R2 | Activation modes: follow system appearance, always on, manual (Midnight). Noir defaults to system on Mac and evening/night on iOS. Dark Reader syncs with system dark mode. | Listings | Verified (listing text) | — | Activation modes System / Always / Schedule / Off (F2) |
| R3 | Per-site control: exclude a site with one tap from the toolbar popup (Midnight). Noir supports an allowlist or denylist. Dark Reader supports per-site enable/disable. | Listings | Verified | — | Per-site rules from the popup (F3) |
| R4 | Dark Reader users complain they can't set the effect sliders per site, and that there is no scheduling. | Dark Reader listing reviews (4 shown, 2018–2021) | Verified (review text) | Tiny, old sample | Per-site slider overrides + schedule (F2, F4): differentiation |
| R5 | Look controls: brightness, contrast, sepia, custom background/text colors, presets (Dark Reader). 20+ themes (Noir). Image dim/darken/leave (Midnight). Noir has toggles for background images and image inversion. | Listings | Verified | — | Sliders, a small preset set, image handling (F4, F5) |
| R6 | Detects sites that are already dark and leaves them alone (Dark Reader, Noir). Noir users report misdetection. | Listings + Noir reviews | Verified that the feature exists; quality unverified | — | Already-dark detection with a per-site override (F6) |
| R7 | Midnight injects styles before the page renders so there is no white flash. | Midnight listing | Verified (claim) | Not runtime-checked | `document_start` base sheet (F7) |
| R8 | Noir reviews report slower Safari, unclickable buttons on some shops, bright links left untinted, and pages with bright imagery not tinting cleanly. | Noir reviews | Verified (review text) | Anecdotal | Performance budget (T013), pointer-events safety (no overlay elements), link color pass, test fixtures (T012) |
| R9 | All three list "Data Not Collected". Noir offers site reports with auto/ask/never modes. | Listings (labels not verified by Apple) | Verified (label text) | Self-reported | No network code at all. Site report = user-initiated mailto draft, domain only (F9) |
| R10 | Dark Reader's open-source engine is organized as several theme engines (CSS filter, SVG filter, static theme, dynamic theme), plus a dark-site detector and an anti-flash fallback. | GitHub API directory names under `src/generators`, `src/inject` | Verified (names only) | Internal behavior not read | Original design: dynamic color rewrite as the primary engine, CSS-filter fallback mode. Written from scratch, no code copied |
| R11 | Shortcuts / Control Center / Focus Filters / Widgets integration (Noir). | Noir listing | Verified (claim) | — | Deferred, out of v1 scope (P2 in feature matrix) |
| R12 | Age rating 4+ on all three. | Listings | Verified | — | Target 4+ rating; children's-data review (safeguard 17) |
| R13 | iPadOS 26.4 Safari crash when opening an extension popup with the compact tab bar; iOS 26.6 extension load delay (Noir release notes, attributed to Apple bugs). | Noir listing release notes | Verified (developer statement) | Not reproduced | Test plan: popup on iPad compact tab bar (T016) |

## Limitations of this analysis

- No rendered-page observation of any reference app. Visual design was not
  studied, and none is reproduced: our UI direction comes from
  `ui-ux-pro-max`, not from a reference (`replica/design-direction.md`).
- Review samples are small and self-selected.
- Privacy labels are developer-reported and unverified.

## Blockers / unauthorized paths not taken

- REA web capture: BLOCKED (no CDP browser). Fix: owner approves installing
  Chromium or Chrome, or accepts the text-only public observation above.
- Purchasing or decompiling Noir / Dark Reader / Midnight: not authorized, not
  done.
- Reading Dark Reader source file contents: not done. Even though the repo is
  MIT, the goal is original code. If any snippet is ever adapted, the MIT
  notice must ship in `docs/asset-licenses.md` and in-app acknowledgements.
