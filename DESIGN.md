---
name: Sunglasses at Night (Dusk, Two Lenses)
description: A calm, blue-black, mirror-teal control surface for a dark-mode Safari extension, used one-handed in a dim room.
colors:
  bg: "#0a1014"
  group: "#111b21"
  raised: "#18262e"
  line: "#2b3f49"
  edge: "#6d8b95"
  fg: "#e7f2f3"
  muted: "#9fb6bc"
  accent: "#5fd7c9"
  on-accent: "#04201d"
  warning: "#f2c36b"
  danger: "#ffa192"
  focus: "#e7f2f3"
  lens-lit: "#192e32"
typography:
  title:
    fontFamily: "ui-rounded, SF Pro Rounded, -apple-system, Helvetica Neue, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.1
  heading:
    fontFamily: "ui-rounded, SF Pro Rounded, -apple-system, Helvetica Neue, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.4
  body:
    fontFamily: "ui-rounded, SF Pro Rounded, -apple-system, Helvetica Neue, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "ui-rounded, SF Pro Rounded, -apple-system, Helvetica Neue, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "10px"
  md: "14px"
  lg: "22px"
  full: "999px"
  lens: "14px 14px 34px 34px"
  lens-sm: "8px 8px 16px 16px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
components:
  switch-track-off:
    backgroundColor: "{colors.bg}"
    height: "44px"
    width: "76px"
    rounded: "{rounded.full}"
  switch-track-on:
    backgroundColor: "{colors.accent}"
    height: "44px"
    width: "76px"
    rounded: "{rounded.full}"
  lens:
    backgroundColor: "{colors.group}"
    rounded: "{rounded.lens}"
    padding: "12px 8px 16px"
  lens-option:
    textColor: "{colors.fg}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 12px"
  lens-option-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  group:
    backgroundColor: "{colors.group}"
    rounded: "{rounded.lens}"
    padding: "12px 16px 24px"
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 16px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
---

# Design System: Sunglasses at Night (Dusk)

## Overview

**Creative north star: "The lamp left on in the next room."** The surface is a
blue-black surface with one mirror-teal glint that says "on". Someone in bed or a
dim room opens the popup mid-browsing, one-handed, to answer "is it on, and for
this site?" and sometimes to make an exception. Nothing on screen is brighter
than it needs to be. The layout is "Two Lenses" (owner's choice, 2026-11-10):
the popup is the pair of sunglasses, with When (every site) in the left lens
and This site in the right, joined by a bridge. The colors are B's original palette (blue-black
surfaces, mirror-teal accent, monospace readouts), restored at the owner's
request 2026-10-19 (T034) after the 2026-10-18 coral "Dusk" look. The rounded
type and soft radii of the approved look stay (`docs/design/comparison.md`).

Dark only. The popup stays dusk even when Safari is in light appearance,
because the product exists for dim rooms and a bright popup would defeat it.
No moon, no purple (REA R15). No large bright block: "on" is the teal switch
fill plus the sunglasses mark, never a full-bleed fill. Wit lives only in the
status line; controls, consent and errors stay plain.

## Colors

Blue-black surfaces in three steps and one teal accent used for state, never
for decoration. Teal marks every selected or on state (coral is gone).

- **bg** `#0a1014`: page. **group** `#111b21`: grouped panel. **raised** `#18262e`: tiles, inputs, buttons. **line** `#2b3f49`: row dividers and pressed fill.
- **edge** `#6d8b95`: control outlines (switch track, checkbox, off mark). At least 3:1 on bg and group.
- **fg** `#e7f2f3`: text. **muted** `#9fb6bc`: secondary text.
- **accent** `#5fd7c9` with **on-accent** `#04201d`: selected, on, primary action. The status block may be teal, as in concept B (owner's choice, 2026-10-19).
- **warning** `#f2c36b`: notices ("looks dark already"). **danger** `#ffa192`: Reset and invalid input.
- **focus** `#e7f2f3`: 3 px ring, 2 px offset, always visible.
- **lens-lit** `#192e32`: the lit corner of a lens while dark mode is on (accent at 10% over group); it fades to group.

All text pairs (fg, muted, accent, warning, danger on bg, group, raised, lens-lit; on-accent on accent) are at least 4.5:1, asserted by `engine/test/ui.test.js`.

## Typography

One family: the platform rounded system face (`ui-rounded`, SF Pro Rounded), sized from the platform body text style so Dynamic Type and larger-text settings apply. Five steps: title (Settings page), heading (switch label, section titles, dialogs), body, label (group titles, option labels, hints), and a small step for the hostname in the lens (never under 12 px). Weights 400 / 600 / 800. Readouts (slider values, hostnames, schedule times) use `--mono` (`ui-monospace`, SF Mono) with tabular figures; everything else stays in the rounded face.

## Layout

Popup, 300 to 440 px wide, in this order (DOM order is the same as the visual order): header; the Dark mode switch with the status line and mark under it; the two lenses; the rest of this site's options (darken anyway, engine, fix something) as plain rows; Look (preset previews, one-line slider rows); More settings. Each lens is a real `fieldset` holding a vertical list of three options. The schedule hours appear inside the When lens under "On a schedule". The hostname sits under the options in the This site lens and is cut in the middle when it is too long (the full name is in its `title` and in the text screen readers get). Both lenses are always the same height. On a page the extension cannot change, the This site lens is hidden and the When lens takes the whole row.

Settings page: the app icon and heading, a row of section links, then lens panels: two columns at 900 px and wider, one column below. 4 px spacing grid. Every control is at least 44 px tall on every device (rows 52, the switch 44 by 76).

## Elevation & Depth

Flat by default; depth comes from the three surface steps. The two popup lenses have a 2 px frame: `edge` while dark mode is off, `accent` while it is on (with the lens-lit corner). Settings panels have a quiet 2 px `line` frame. Only the reset dialog floats (`--float`, soft 24 px blur). No glows, no hard shadows.

## Shapes

One rule: panels are lenses, actions are pills. A lens has a flat top and a round bottom (14 px top corners, 34 px bottom corners), like the lenses of the mark; preset previews are small lenses (8 / 16). Buttons, the switch, lens options and the More settings row are pills. Inputs inside a panel (select, time, text area) keep 10 px.

## Components

Switch, lens pair with bridge, lens option list (mode and site rule), slider row (label, track and value on one line), preset preview, grouped list row, sunglasses status mark, buttons, checkbox, select, dialog. Every state (default, hover, focus, active, disabled, loading, error, empty) is specified in `docs/design/system.md`. All are native elements (checkbox, radio, range, select, button) restyled; no ARIA widget roles.

## Motion

One ease (`--ease`, ease-out, no bounce) and three durations: `--dur` 180 ms for state changes, `--dur-press` 100 ms for pressed feedback, `--dur-exit` 140 ms for things leaving. The lens frames and bridge fade between `edge` and `accent` when dark mode flips; the switch thumb slides, and grows 4 px toward its travel while held; fills cross-fade. Nothing travels or scales besides the thumb, a pressed button or preset (0.97), and the reset dialog (from 0.95). Nothing animates when the popup opens; "More settings" fades in when the person opens it. Removing a row shows an Undo toast for 6 s. Hover fills apply only where a pointer can hover. With Reduce Motion every transition and animation is off and states change at once. The full list is `docs/interaction-matrix.md`.

## Host app

The app stays native (system lists and controls). It carries the motif in two places: the Mirror Shades hero on iPhone, and the setup steps, which sit in a lens-shaped panel (`LensPanel`, same 14 / 34 corners).

## Do's and Don'ts

- Do keep one selected style (a filled teal pill) everywhere. Don't mix white-tile and teal selection.
- Do keep both lenses real, labelled groups in reading order. Don't build the pair with `display: contents`, `:has()` or CSS reordering.
- Do show "on" with the teal switch and the filled lenses. Don't fill a large area with teal.
- Do use tokens from `ui.css :root`. Don't write a color, size, radius or duration literal below it.
- Do give every control at least 44 px. Don't shrink targets to fit more in the popup.
- Don't use side-stripe borders, gradient text, glows, or a moon.
