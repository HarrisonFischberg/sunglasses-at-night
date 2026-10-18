# Recon map: Safari dark-mode extensions (iOS, iPadOS, macOS)

Scope: Safari dark-mode Web Extension + container app, from public listings only
For: Sunglasses for Safari (free, no data collection)
Date: 2026-10-18
Evidence detail: `docs/rea-findings.md` (R1–R13). Feature matrix: `replica/features.csv`.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | App Store listing | https://apps.apple.com/us/app/noir-dark-mode-for-safari/id1581140954 | Noir iOS; $2.99; 4+; reviews |
| 2 | App Store listing | https://apps.apple.com/us/app/noir-dark-mode-for-safari/id1592917505?mt=12 | Noir Mac |
| 3 | App Store listing | https://apps.apple.com/us/app/dark-reader-for-safari/id1438243180 | Dark Reader; $4.99–5.99; 4+ |
| 4 | App Store listing | https://apps.apple.com/us/app/-/id6760980920 | Midnight; $0.99; 4+; no reviews yet |
| 5 | GitHub (MIT) | https://github.com/darkreader/darkreader | directory names only |

## Core loop

User installs the app, enables the extension in Safari, and every website turns dark
without further action. Tweaks happen in the toolbar popup.

## Screens (ours, derived from the matrix; not reference layouts)

| ID | screen | route / how to reach | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| S01 | App: Welcome / Enable | launch container app | explain + deep-link to Safari extension settings | steps, button | not-enabled, enabled (macOS can detect via SFSafariExtensionManager; iOS cannot, so show steps) |
| S02 | App: Settings | tab/sidebar | activation mode, schedule, look sliders, images, presets | Form, Picker, Slider, Toggle | default, schedule-invalid |
| S03 | App: Sites | tab/sidebar | list per-site rules, delete rule | List, swipe/delete | empty, filled |
| S04 | App: About & Privacy | tab/sidebar | privacy policy, acknowledgements, contact, reset all | text, button, confirm dialog | — |
| S05 | Extension popup | Safari toolbar | on/off for this site, mode, sliders, report site | toggle, segmented, sliders | site default, site always, site never, restricted page (no host), already-dark detected |
| S06 | Extension options page | popup "More settings" | same as S02/S03 for macOS users who skip the app | HTML form | — |

## Flows

```
F01 First run
    S01 -> Safari Settings (system) -> back -> S01 enabled state
    edge: user denies "All Websites" permission → explain per-site grant still works
F02 Exclude this site
    S05 toggle "This site" → never; page restores instantly, no reload
F03 Tune look for one site
    S05 "Customize this site" → sliders → saved as per-site override
F04 Schedule
    S02 mode = Schedule, start 20:00 end 07:00 (crossing midnight)
F05 Report broken site
    S05 "Report a problem" → opens Mail draft to owner contact with hostname only; user can edit/cancel
F06 Reset
    S04 Reset all → confirm → defaults, sites cleared
```

## Inferred data model (local only)

```
Settings { mode: system|always|schedule|off, schedule:{start,end}, look:{brightness,contrast,sepia,grayscale,preset,bg?,fg?}, images: leave|dim|noinvert, hideBgImages:bool, engine: dynamic|filter }
SiteRule { host, enabled: default|always|never, look?: partial Look, engine?: dynamic|filter }
Stored in browser.storage.local, mirrored to App Group UserDefaults via native messaging. No server, no account.
```
