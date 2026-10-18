---
name: Sunglasses for Safari (Dusk)
description: A calm, warm-gray, coral-accented control surface for a dark-mode Safari extension, used one-handed in a dim room.
colors:
  bg: "#181415"
  group: "#241f21"
  raised: "#302a2c"
  line: "#463b3e"
  edge: "#8a7a76"
  fg: "#f7ede9"
  muted: "#c3b2ae"
  accent: "#ff9a76"
  on-accent: "#2a1208"
  warning: "#f2c36b"
  danger: "#ffa79a"
  focus: "#f7ede9"
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
  tile:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    height: "56px"
    padding: "8px 16px"
  tile-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.accent}"
  segment-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    height: "44px"
  group:
    backgroundColor: "{colors.group}"
    rounded: "{rounded.lg}"
    padding: "12px 16px 16px"
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
---

# Design System: Sunglasses for Safari (Dusk)

## Overview

**Creative north star: "The lamp left on in the next room."** The surface is a
warm, low-light gray with one coral glow that says "on". Someone in bed or a
dim room opens the popup mid-browsing, one-handed, to answer "is it on, and for
this site?" and sometimes to make an exception. Nothing on screen is brighter
than it needs to be. Layout is B's (big switch on top, tiles, segmented
control, compact slider rows); the look is C's (rounded system type, warm
grays, soft radii). Approved by the owner 2026-10-18 (`docs/design/comparison.md`).

Dark only. The popup stays dusk even when Safari is in light appearance,
because the product exists for dim rooms and a bright popup would defeat it.
No moon, no purple (REA R15). No large bright block: "on" is the coral switch
fill plus the sunglasses mark, never a full-bleed fill. Wit lives only in the
status line; controls, consent and errors stay plain.

## Colors

Warm-gray surfaces in three steps and one coral accent used for state, never
for decoration.

- **bg** `#181415`: page. **group** `#241f21`: grouped panel. **raised** `#302a2c`: tiles, inputs, buttons. **line** `#463b3e`: row dividers and pressed fill.
- **edge** `#8a7a76`: control outlines (switch track, checkbox, off mark). At least 3:1 on bg and group.
- **fg** `#f7ede9`: text. **muted** `#c3b2ae`: secondary text.
- **accent** `#ff9a76` with **on-accent** `#2a1208`: selected, on, primary action.
- **warning** `#f2c36b`: notices ("looks dark already"). **danger** `#ffa79a`: Reset and invalid input.
- **focus** `#f7ede9`: 3 px ring, 2 px offset, always visible.

All text pairs (fg, muted, accent, warning, danger on bg, group, raised; on-accent on accent) are at least 4.5:1, asserted by `engine/test/ui.test.js`.

## Typography

One family: the platform rounded system face (`ui-rounded`, SF Pro Rounded), sized from the platform body text style so Dynamic Type and larger-text settings apply. Four steps: title (Settings page), heading (switch label, dialogs), body, label (group titles, segment labels, hints). Weights 400 / 600 / 800. No monospace: numbers use tabular figures.

## Layout

Popup: a single column, 300 to 440 px wide. Order: header, status hero (mark, status line, power switch), When (tiles), This site (segmented rule), Look (preset previews, slider rows). Settings page: heading, then on 900 px and wider a 200 px section rail beside a 640 px column of grouped panels; below 900 px the rail becomes a row of links above the panels. 4 px spacing grid. Every control is at least 44 px tall (rows 52, tiles and the switch 56).

## Elevation & Depth

Flat by default; depth comes from the three surface steps. A selected segment lifts with `--lift` (1 px line plus a soft 6 px shadow). Only the reset dialog floats (`--float`, soft 24 px blur). No glows, no hard shadows.

## Shapes

Soft and rounded: 10 px for inner pieces (segments, selects), 14 px for tiles and buttons, 22 px for grouped panels, pill for the switch and round icon buttons.

## Components

Switch, mode tiles, segmented control, slider row, preset preview, grouped list row, sunglasses status mark, buttons, checkbox, select, dialog. Every state (default, hover, focus, active, disabled, loading, error, empty) is specified in `docs/design/system.md`. All are native elements (checkbox, radio, range, select, button) restyled; no ARIA widget roles.

## Do's and Don'ts

- Do keep one selected style (coral) everywhere. Don't mix white-tile and teal selection.
- Do show "on" with the coral switch and the filled lenses. Don't fill a large area with coral.
- Do use tokens from `ui.css :root`. Don't write a color, size, radius or duration literal below it.
- Do give every control at least 44 px. Don't shrink targets to fit more in the popup.
- Don't use side-stripe borders, gradient text, glows, or a moon.
