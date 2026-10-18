# Design direction (ui-ux-pro-max)

Command: `python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "utility browser extension dark mode privacy minimal night" --design-system -p "Sunglasses for Safari" --density 4 --motion 3`, plus `--stack swiftui`.

No reference visual design was studied (public text only), so this direction comes from ui-ux-pro-max, not from any reference.

- Style: Minimalism / Swiss: functional, high contrast, little decoration. Motion 3/10, respect Reduce Motion.
- Container app: native SwiftUI `Form`/`List` with system colors, SF Symbols, Dynamic Type. Follows system light/dark.
- Popup / options page (HTML): tokens below, light + dark via `prefers-color-scheme`.

| token | dark | light | checked pair (Replica contrast.py) |
| --- | --- | --- | --- |
| background | #0F172A | #FFFFFF | — |
| card | #192134 | #F8FAFC | — |
| foreground | #FFFFFF | #0F172A | 17.85:1 |
| muted text | #94A3B8 | #475569 | 6.96 (on bg) / 6.26 (on card) ; 7.58 light |
| accent | #22C55E | #15803D | 7.83 dark ; 5.02 light |
| on-accent | #0F172A | #FFFFFF | 7.83 ; 5.02 |
| warning text | #FBBF24 | #B45309 | 10.69 ; 5.02 |
| focus ring | #FFFFFF 2px + offset | #0F172A 2px + offset | non-text ≥3:1 |

## Intentional departures from ui-ux-pro-max output

| Recommendation | Ours | Reason |
| --- | --- | --- |
| Inter via Google Fonts | system font stack (`-apple-system`, SF) | no third-party network request (privacy, safeguard 7/8), no font license to manage (19) |
| "Trust & Authority" pattern: security badges, logos, case studies | none | no badges or certifications exist; would be unsupported claims (11, 12) |
| GSAP scroll reveal | none | no dependency; popup has no scrolling content |
