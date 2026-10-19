# Replica artifacts

Outputs: recon map, architecture, design tokens, feature matrix, parity diff,
brand sweep, listing lint.

## Intentional differences

Each place the reference conflicted with accessibility, privacy, honest
pricing, or a safeguard. A removed harmful pattern is not a parity defect.

| Screen / flow | Reference behavior | Our behavior | Reason |
| --- | --- | --- | --- |
| Purchase | Paid ($0.99–$5.99), Noir per-platform | Free on all platforms, no IAP | owner decision 2026-10-18 |
| Site reports | Noir can send automatically | Only a user-initiated email draft with the hostname; never automatic | safeguards 7, 9 |
| Schedule | Noir evening/night default | Fixed user times only, no location / sunset lookup | avoid location permission (safeguard 7) |
| Themes | 20+ (Noir) | small original preset set | original assets; less surface to maintain |
| iCloud sync, Shortcuts, Widgets, visionOS | present in some references | deferred to v2 | scope; sync adds a data flow needing review |
| Visual design | not studied | ui-ux-pro-max direction | public-text-only scope; see design-direction.md |

## Owner override: teal status block (T034, 2026-10-19)

The owner restored concept B's original colors (blue-black surfaces, mirror-teal `#5fd7c9`, monospace readouts). The earlier critique's night-rule objection to a teal status block (`docs/design/critique.md`) is overridden by the owner's choice; the status block may use teal. Selected states stay a single teal style (no coral).

## First-paint tradeoff (T023, B22)

Safari content scripts read settings only asynchronously, so before that read
resolves the script can't tell mode "always" from "off", a "never" site or an
already-dark page. `Extension/Resources/content/base.css` is declared in the
manifest, so Safari injects it before first paint with no script. It paints
the dark base only under `@media (prefers-color-scheme: dark)` and
`:root:not([data-sunglasses-off])`. The content script sets
`data-sunglasses-off` on `<html>` the moment settings are known (off, never,
already-dark, or when its own sheet takes over).

Accepted tradeoff: when the system is dark and the page should stay light
(mode off, or a "never" site), the dark base may show for at most the
settings-read latency. With a light system it never applies. With a light
system and mode "always", the page can still show light until the settings
read resolves (the base is dark-system only).
