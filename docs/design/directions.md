# Design directions (T026, Phase 3B)

Status: concepts built; screenshots, critique and audit wait for the runner's
WebKit step (see "What is not done"). The owner approves one direction.

## `/impeccable shape` brief (unattended: assumptions are labeled)

Impeccable context loaded from `PRODUCT.md` (no DESIGN.md exists yet). Nobody
could answer the discovery interview, so per Impeccable's rule the brief is
inferred from PRODUCT.md. Every row marked **ASSUMPTION** is the owner's to
correct.

1. **Job and audience.** Mode: *Operate*. Someone in a dim room, often on a
   phone one-handed, opens the popup mid-browsing to answer "is it on, and for
   this site?" and, rarely, to change an exception. The container app is opened
   rarely: first run, per-site rules, schedule, privacy, Reset all.
2. **Outcome and proof.** The status answer is readable in under a second; the
   most common exception (this site: default / always / never) is two taps.
   Proof: screenshots at 1440×900 and 390×844, measured touch targets ≥44 px and
   text contrast ≥4.5:1 (`e2e/design-shots.test.js` → `ralph/evidence/t026-e2e.json`).
3. **Selected direction.** Not chosen here; three worlds below, owner picks.
4. **Scope.** Core screen = toolbar popup + container-app Settings, rendered as
   static previews sharing `design/concepts/state.js`. Not shipped code.
   Untouched: engine, copy of privacy/consent/errors (plain), the real popup.
5. **States and ranges.** Mode ×4; site rule ×3; restricted page (no site
   section); already-dark page; Look presets ×4 plus custom; 0–N site rules
   (empty state included). Pin with `?mode=off`, `?restricted=1`,
   `?alreadydark=1`, `?rule=never`, `?dark=0`.
6. **Interaction and layout.** Popup width 300–420 px. Settings: one column on
   phone, two on desktop. Native controls only (radio, range, checkbox, time):
   VoiceOver, Full Keyboard Access and Dynamic Type come for free.
7. **Constraints.** WCAG 2.2 AA, 44 px targets, Reduce Motion respected, system
   fonts only (no font download), no network, no moon-on-purple (REA R15),
   no reference-app names or looks. Wit only in the status line.

**Assumptions to confirm:** (1) dark-only surfaces: the popup may be dark in
light-mode Safari because the product is dark mode; the real popup today
follows system. (2) The popup shows the Look sliders inline rather than behind
the gear. (3) Wit tone ("Shades on.", "Lights low.") is acceptable in the status
line. (4) System font stacks, no bundled typeface, to keep the extension small.

## Three worlds

| | A. Tortoiseshell | B. Polarized | C. Dusk |
| --- | --- | --- | --- |
| Feel | warm, editorial, calm | instrument panel, decisive | soft, rounded, native-iOS |
| Palette | warm black, amber `#e3a752` | blue-black, mirror-teal `#5fd7c9` | warm gray, coral `#ff9a76` |
| Voice | serif (`ui-serif`) headline | heavy sans + mono readouts | rounded sans |
| Focal moment | the large serif status line | one big full-width switch that fills with the accent when on | status lamp + live preview swatches on each Look preset |
| Popup structure | hairline sections, no cards, mode as row list with hints | switch, then 2×2 mode tiles, site segment, slider rails | grouped inset lists, segmented mode, preset previews |
| Settings structure | single editorial column | sidebar nav + sectioned panels (desktop) | iOS-style inset grouped list |
| Risk | most reading, least tap-fast | closest to a generic "toggle app" if the switch is not owned | most cards; matches iOS app best, least distinctive on Mac |

Files: `design/concepts/{a,b,c}/{index.html,style.css,view.js}` + shared
`design/concepts/state.js`.

## What is not done (honest status)

- **Screenshots:** `e2e/design-shots.test.js` writes
  `design/screenshots/{a,b,c}-{1440x900,390x844}.png` (+ `-off`, `-restricted`
  at 390). WebKit cannot launch in the Builder sandbox, so none exist yet; the
  runner's `npm run e2e` produces them.
- **Critique and audit:** need those renders. Only the static detector has run
  (`docs/design/logs/detect-*-pre.txt`: A 0, B 0, C 1 finding `dark-glow`,
  fixed: neutral shadow). Real critique/audit text is not written, to avoid
  inventing visual judgment of unseen pages. See `critique.md`.
- **`comparison.md`:** Opus writes it after critique.
