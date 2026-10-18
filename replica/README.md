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
