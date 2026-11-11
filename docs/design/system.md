# Design system: Dusk (T030)

Direction approved 2026-10-18: B's layout in C's look (`docs/design/comparison.md`).
`DESIGN.md` at the repo root is the spec (tokens + prose). This file records how
it was produced, the component states, and the verification. The tokens live in
`Extension/Resources/ui/ui.css :root`; the popup and options page use nothing
else (enforced by `engine/test/ui.test.js`, "colors, type sizes, radii and
durations come from :root tokens only").

## Two Lenses (2026-11-10)

The owner chose the "Two Lenses" direction from a three-way exploration. `DESIGN.md` describes what ships. What changed against the tables below:

- Tokens added: `lens-lit #192e32`, `--text-xs` (max(0.8125rem, 12px)), `--r-lens` 14/14/34/34, `--r-lens-sm` 8/8/16/16, `--r-bridge`. Buttons and the More settings row use `--r-full`; panels use `--r-lens`.
- Mode tiles and the segmented control are now vertical option lists inside the two lenses (44 px rows, selected = filled `accent` pill, hover = `line` fill, focus ring unchanged). The schedule rows moved into the When lens.
- Lens frame: 2 px inset, `edge` when dark mode is off, `accent` when on, 180 ms fade; off under Reduce Motion.
- Slider row: label, track and value share one 52 px line.
- Status mark: 40 px, beside the status line; still outline when off, filled when on.
- Settings page: sections are lens panels (2 px `line` frame), two columns from 900 px.
- Contrast: `lens-lit` joined the surfaces checked by `engine/test/ui.test.js`.

## How it was made (Impeccable, this session)

- Skill loaded and `impeccable context` run (PRODUCT.md loaded; no DESIGN.md existed).
- `document` / new-work: `DESIGN.md` written from the approved concepts (`design/concepts/{b,c}`) and the shipped CSS.
- `extract`: the shared values of concepts B and C and of the old `ui.css` were consolidated into semantic tokens (color roles, type scale, 4 px spacing, radii, elevation, motion). One-offs were not tokenized.
- `polish`: `impeccable detect Extension/Resources/{popup,options,ui}` first reported 4 findings (checkmark drawn with `border-left`, flush `.field` rows); fixed; second run reports 0. Log: `docs/design/logs/detect-t030-post.txt`. The detector ran regex-only on CSS/JS and not on the `.html`, so it is an undercount.
- Not claimed: a rendered critique or audit of the real pages. WebKit cannot launch in the Builder sandbox; the runner e2e (`e2e/t030.test.js`) renders both pages at 390×844 and 1440×900, writes `design/screenshots/real-*.png`, and asserts overflow, 44 px targets and text contrast. Keyboard and VoiceOver passes are T015's.

## Tokens

| Group | Tokens |
| --- | --- |
| Color (T034, B's palette) | `bg #0a1014`, `group #111b21`, `raised #18262e`, `line #2b3f49`, `edge #6d8b95`, `fg #e7f2f3`, `muted #9fb6bc`, `accent #5fd7c9`, `on-accent #04201d`, `warning #f2c36b`, `danger #ffa192`, `focus #e7f2f3`, `scrim` |
| Type | `--font` (ui-rounded stack), `--mono` (ui-monospace, SF Mono) for `output`, `.host` and time inputs, `--text-sm` .9375rem, `--text-base` 1rem, `--text-lg` 1.25rem, `--text-xl` 1.5rem, `--text-2xl` clamp(1.75rem, 4vw, 2.5rem); weights 400/600/800; leading 1.4 |
| Spacing | `--s-1`…`--s-7` = 4, 8, 12, 16, 24, 32, 48 px; `--target` 44 px; `--row` 52 px |
| Radius | `--r-sm` 10, `--r-md` 14, `--r-lg` 22, `--r-full` pill |
| Elevation | `--lift` (1 px line + 6 px soft shadow), `--float` (24 px soft shadow, dialog only) |
| Motion | `--dur` 180 ms, `--ease` cubic-bezier(0.16, 1, 0.3, 1); all transitions off under `prefers-reduced-motion` |

### Contrast checks (asserted in `engine/test/ui.test.js`)

Text roles `fg`, `muted`, `accent`, `warning`, `danger` each ≥ 4.5:1 on `bg`, `group` and `raised`; `on-accent` on `accent` ≥ 4.5:1; `edge` and `focus` ≥ 3:1 on `bg` and `group`. The unit test prints the failing pair and ratio if any drops. The runner also measures every rendered text node (`ralph/evidence/t030-e2e.json`).

### T034: palette swap to B's original (2026-10-19 owner request)

Coral `#ff9a76` and the warm grays are replaced by B's blue-black surfaces and mirror-teal `#5fd7c9`; every "accent" cell below now reads teal. Layout, radii and the rounded type are unchanged. `edge` is new to B's set (B had no outline token): `#6d8b95`.

Contrast re-check, pairs required by the unit test (`engine/test/ui.test.js`, same WCAG formula as Replica's `contrast.py`): text roles fg, muted, accent, warning, danger on bg, group and raised ≥ 4.5:1; on-accent on accent ≥ 4.5:1; edge and focus ≥ 3:1 on bg and group. The pair list is in `docs/design/tokens-t034.json`. **`contrast.py` itself was not run in this session** (python3 needs an approval the unattended Builder cannot get), so the numbers come from the runner's `npm test` and e2e text-contrast measurements in `ralph/evidence/`, not from a `contrast.py` log.

## Component states

All components are native elements restyled. "Hover" applies to pointer devices; on iOS it never shows.

| Component | Default | Hover | Focus | Active | Disabled | Loading | Error | Empty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Switch** (checkbox, 76×44 track) | `bg` track, `edge` ring, `edge` thumb | none (state is the control) | 3 px `focus` ring, 3 px offset | thumb slides 180 ms | 50 % opacity | not shown (status line says "Loading…") | n/a | n/a |
| **Mode tile** (radio, 56 px) | `raised`, `fg` text | `line` fill | 3 px `focus` ring | n/a (selects on tap) | 50 % opacity | n/a | n/a | none selected when mode is Off |
| **Selected tile** | 2 px `accent` inset ring, `accent` text | same | same | same | same | n/a | n/a | n/a |
| **Segmented control** (radios, 44 px) | `bg` track, `fg` labels | `group` fill | 3 px `focus` ring | n/a | 50 % opacity | n/a | n/a | n/a |
| **Selected segment** | `accent` fill, `on-accent` text, `--lift` | same | same | same | same | n/a | n/a | n/a |
| **Slider row** (range 44 px + `output`) | label left, value right in `muted` tabular figures | none | 3 px `focus` ring | native thumb drag, value updates live | native dim | n/a | n/a | n/a |
| **Preset preview** (radio + 4:3 swatch) | `bg` swatch, `line` ring, name in `fg`; swatch is filtered by the preset's own brightness/contrast/sepia/grayscale | `edge` ring | 3 px `focus` ring | n/a | n/a | n/a | n/a | none selected when the look is Custom |
| **Grouped list row** (`.field`, `.check`, site `li`; 52 px) | `group` panel, `line` divider | none | control inside takes the ring | n/a | 50 % control | n/a | `aria-invalid` ring in `danger` + hint text | Sites: "No site rules yet…" in `muted` |
| **Sunglasses status mark** (56 px SVG) | outline only, `edge` (off / unknown) | n/a | not focusable | n/a | n/a | outline (page not reported yet) | n/a | n/a |
| **Status mark, on** | lenses filled `accent`, 180 ms fill | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| **Button** (44 px) | `raised` fill | `line` fill | 3 px `focus` ring | scale .98 | 50 % opacity, not-allowed | `.loading` 70 % opacity, progress cursor | n/a | n/a |
| **Primary / Danger button** | `accent`/`on-accent`; `danger` text with 1 px inset ring | primary brightens 8 %; danger gets `raised` fill | same | same | same | same | n/a | n/a |
| **Checkbox** (24 px, row 52 px) | `edge` 2 px outline | none | 3 px `focus` ring | n/a | 50 % | n/a | n/a | n/a |
| **Select / time** (44 px) | `raised` fill, no border | none | 3 px `focus` ring | native picker | 50 % | n/a | `aria-invalid` ring (time) | n/a |
| **Status line** | `fg` 1 rem | n/a | n/a | n/a | n/a | "Loading…" | load failure text (popup) / `warning` alert (options) | restricted-page explanation |

Where a cell says n/a, the state does not exist for that control; it is not an omission.

## Real-page evidence

- Unit: `npm test` 319 pass (HTML ARIA/label rules, bundle freshness, token contrast, tokens-only).
- Runner e2e: `e2e/ui.test.js` (T010 keyboard, rule saving, Reset dialog focus; selectors updated for the switch + mode tiles) and `e2e/t030.test.js` → `design/screenshots/real-{popup,options}-{390x844,1440x900}[-off|-already-dark|-restricted|-empty].png` and `ralph/evidence/t030-e2e.json`.

## Behavior change recorded here

The popup's mode `<select>` became a power switch plus three tiles (Match system, Always, On a schedule), as approved. Off is the switch's off state. Turning the switch back on restores the last non-off mode seen in that popup session, else "Match system". The options page keeps its mode select.
