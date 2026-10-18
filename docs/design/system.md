# Design system: Dusk (T030)

Direction approved 2026-10-18: B's layout in C's look (`docs/design/comparison.md`).
`DESIGN.md` at the repo root is the spec (tokens + prose). This file records how
it was produced, the component states, and the verification. The tokens live in
`Extension/Resources/ui/ui.css :root`; the popup and options page use nothing
else (enforced by `engine/test/ui.test.js`, "colors, type sizes, radii and
durations come from :root tokens only").

## How it was made (Impeccable, this session)

- Skill loaded and `impeccable context` run (PRODUCT.md loaded; no DESIGN.md existed).
- `document` / new-work: `DESIGN.md` written from the approved concepts (`design/concepts/{b,c}`) and the shipped CSS.
- `extract`: the shared values of concepts B and C and of the old `ui.css` were consolidated into semantic tokens (color roles, type scale, 4 px spacing, radii, elevation, motion). One-offs were not tokenized.
- `polish`: `impeccable detect Extension/Resources/{popup,options,ui}` first reported 4 findings (checkmark drawn with `border-left`, flush `.field` rows); fixed; second run reports 0. Log: `docs/design/logs/detect-t030-post.txt`. The detector ran regex-only on CSS/JS and not on the `.html`, so it is an undercount.
- Not claimed: a rendered critique or audit of the real pages. WebKit cannot launch in the Builder sandbox; the runner e2e (`e2e/t030.test.js`) renders both pages at 390×844 and 1440×900, writes `design/screenshots/real-*.png`, and asserts overflow, 44 px targets and text contrast. Keyboard and VoiceOver passes are T015's.

## Tokens

| Group | Tokens |
| --- | --- |
| Color | `bg #181415`, `group #241f21`, `raised #302a2c`, `line #463b3e`, `edge #8a7a76`, `fg #f7ede9`, `muted #c3b2ae`, `accent #ff9a76`, `on-accent #2a1208`, `warning #f2c36b`, `danger #ffa79a`, `focus #f7ede9`, `scrim` |
| Type | `--font` (ui-rounded stack), `--text-sm` .9375rem, `--text-base` 1rem, `--text-lg` 1.25rem, `--text-xl` 1.5rem, `--text-2xl` clamp(1.75rem, 4vw, 2.5rem); weights 400/600/800; leading 1.4 |
| Spacing | `--s-1`…`--s-7` = 4, 8, 12, 16, 24, 32, 48 px; `--target` 44 px; `--row` 52 px |
| Radius | `--r-sm` 10, `--r-md` 14, `--r-lg` 22, `--r-full` pill |
| Elevation | `--lift` (1 px line + 6 px soft shadow), `--float` (24 px soft shadow, dialog only) |
| Motion | `--dur` 180 ms, `--ease` cubic-bezier(0.16, 1, 0.3, 1); all transitions off under `prefers-reduced-motion` |

### Contrast checks (asserted in `engine/test/ui.test.js`)

Text roles `fg`, `muted`, `accent`, `warning`, `danger` each ≥ 4.5:1 on `bg`, `group` and `raised`; `on-accent` on `accent` ≥ 4.5:1; `edge` and `focus` ≥ 3:1 on `bg` and `group`. The unit test prints the failing pair and ratio if any drops. The runner also measures every rendered text node (`ralph/evidence/t030-e2e.json`).

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
