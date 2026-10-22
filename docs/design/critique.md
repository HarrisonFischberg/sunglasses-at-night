# Critique and audit log (T026)

Method: ⚠️ DEGRADED: single-context. The platform is `adaptive` (native-first), so Assessment B (browser overlay) does not apply, and no sub-agent was spawned. Assessment A was done by the Builder from the runner-captured screenshots in `design/screenshots/` (1440×900, 390×844, -off, -restricted) and the concept source. Detector: regex-only on `.css/.js` (the static `.html` was not parsed for element rules). Rendered-page measurements (overflow, 44 px targets, text contrast) come from the runner's `e2e/design-shots.test.js` → `ralph/evidence/t026-e2e.json`.

## Evidence

| Step | Source | Result |
| --- | --- | --- |
| Measured, pre-fix | `ralph/evidence/t026-e2e.json` (12 captures) | overflowX 0, no low-contrast text, no targets under 44 px, no page errors, in every concept/size/state |
| Detector, pre-fix | `docs/design/logs/detect-{a,b,c}-pre.txt` | A 0, B 0, C 1 (`dark-glow` on `.lamp`, fixed) |
| Detector, post-fix | `docs/design/logs/detect-{a,b,c}-post.txt` | A 0, B 0, C 0 (regex only, undercount) |

## Critique per concept (design review of the screenshots)

### A — Tortoiseshell (serif, amber, hairlines)
- Strengths: calmest world; the "Lights low." status reads as the brand joke in one line; the mode list uses whole-row targets with plain descriptions (good for privacy/consent clarity); Settings reads as a document, which suits a rarely opened app.
- Issues: (1) the popup's fieldset legends ("Dark mode", "This site") sat on the hairline above them with no air; (2) the two checkboxes in Pictures had an uneven, loose gap; (3) the popup is long at 390 px (four modes, four looks, four sliders): Look sliders could collapse behind a disclosure.
- Heuristics worth noting: visibility of status strong; minimalism good except slider block length.

### B — Polarized (teal, mono accents, card grid)
- Strengths: the single large Dark mode switch is the fastest one-handed control of the three; mono type for hostnames and times is distinctive; the two-column Settings with a section rail suits Mac.
- Issues: (1) the "On a schedule" tile was orphaned in a 2-column grid; (2) selected state is inconsistent (white tile for mode, teal for site and pictures); (3) the schedule hint read "Used when When is set to On a schedule" (clumsy copy); (4) the saturated teal status block is the loudest element in a dim-room popup (against the "comfortable at night" brief).
- Remaining after fix batch: items 2 and 4 (owner call, not a defect).

### C — Dusk (rounded, coral, soft surfaces)
- Strengths: most native-feeling (iOS grouped-list rhythm); the Look presets as miniature page previews explain Standard/Soft/Warm/Mono without words; the lamp orb is a friendly status mark.
- Issues: (1) "This site" and "Look" group titles straddled the card's top edge (legend inside a fieldset); (2) the orb is decoration, not a control, and the Off state is only reachable through the segmented control; (3) four-segment control labels ("System", "Schedule") are abbreviated against the other concepts' wording.

## One fix batch (applied, one pass only)

| Concept | Change | File |
| --- | --- | --- |
| A | Legends float into the padding box so they clear the rule | `design/concepts/a/style.css` |
| A | `.block` grid gap 0.6rem → 0.25rem (even checkbox rhythm) | `design/concepts/a/style.css` |
| B | Odd last tile spans the row (`.tiles > :last-child:nth-child(odd)`) | `design/concepts/b/style.css` |
| B | Hint copy → "Used when the mode is On a schedule." | `design/concepts/b/index.html` |
| C | Group titles float inside the card | `design/concepts/c/style.css` |

Not changed, left for the owner: B's loud teal status block and inconsistent selected states, C's abbreviated segment labels, A's long popup. These are direction choices, not defects.

## Audit per concept

Audit checks, by the measured evidence available (no new run after the fix batch):
- Overflow at 390 px and 1440 px: 0 px in all three (t026-e2e.json).
- Text contrast: no failures flagged by the test in any concept/state.
- Touch/click targets: nothing under 44 px in any concept.
- Detector post-fix: 0 findings in all three (regex only).
- Not verified: keyboard/focus order and Reduce Motion in a real browser, VoiceOver. Those belong to T015/T017 on the real UI, not to throwaway concepts.

**Pending:** the fix batch changed CSS after the screenshots were taken, so `design/screenshots/*.png` show the pre-fix state. The runner's next e2e re-captures them and rewrites `t026-e2e.json`; check it for regressions (the fix touches layout in all three).

Next: Opus writes `docs/design/comparison.md`; the owner approves one direction.
