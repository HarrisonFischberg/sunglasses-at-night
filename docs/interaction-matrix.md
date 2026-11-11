# Interaction matrix

Interaction, motion, gesture and haptics pass of 2026-11-11 on the "Two Lenses"
popup, the settings page and the container app. Status: **done** (this pass),
**there** (already in place, checked), **n/a** (with the reason), **device**
(built, but only a real iPhone or real Safari can confirm it).

Web pages cannot fire haptics, so the popup and settings page have none. The
container app uses the system's feedback. The app has no sound and gets none.

## Tokens (`Extension/Resources/ui/ui.css :root`)

| Token | Value | Used for |
| --- | --- | --- |
| `--ease` | cubic-bezier(0.16, 1, 0.3, 1) | every transition: enter promptly, settle gently, no bounce |
| `--dur` | 180 ms | state changes, the toast and dialog entering |
| `--dur-press` | 100 ms | pressed feedback |
| `--dur-exit` | 140 ms | the toast leaving (about 20% shorter than entering) |
| `--stagger` | 30 ms | the three "More settings" sections (240 ms in all) |
| `--press` | 0.97 | pressed button and preset scale |
| `--pop` | 0.95 | the reset dialog's starting scale |
| `--stretch` | 4 px | the held switch thumb (about 12% of its width) |

Reduce Motion: every transition and animation is off, pseudo-elements and the
dialog backdrop included; nothing scales or stretches; states change at once.

## Popup and settings page

| Component or journey | Trigger and intent | Visual response | Gesture + accessible alternative | Haptic | States, reduced motion | Pri | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Popup opens | Toolbar button: "is it on, for this site?" | No entrance animation; first paint is the final layout | n/a | none (web) | "Loading…" status, load error text | P0 | there (e2e asserts nothing animates at open) |
| Dark mode switch | Tap or Space: turn everything on or off | Thumb grows 4 px toward its travel while held, slides 180 ms, track and lens frames fade to teal, mark fills | Native checkbox; label is the target (56 px) | none (web) | focus ring, disabled; RM: instant | P0 | done (stretch); slide there |
| Lens options (When, This site) | Tap: choose one | Pressed fill at once, selected fill at once (no tween, by design) | Native radios, arrow keys | none (web) | hover only with a pointer; RM: same | P0 | done (pressed, hover no longer sticks on touch) |
| Schedule times | Pick a time | Native picker; invalid time outlined, hint explains, input kept | Native time input | none | invalid, saved | P1 | there |
| Look presets | Tap a preview | Preview sinks to 0.97 while pressed, frame turns teal | Native radios | none | RM: no scale | P1 | done |
| Look sliders | Drag | Native range tracks the finger; value updates live; saved on release | Native range, arrow keys | none | n/a | P0 | there (thumb stretch n/a: native control stays native) |
| Checkboxes | Tap row | Tick scales in 180 ms | Native checkbox, whole row is the label | none | RM: instant (was still animating before this pass) | P1 | done (RM fix) |
| Buttons | Press | 0.97 scale in 100 ms, hover fill with a pointer only | Native button | none | disabled does not scale; RM: no scale | P0 | done |
| Fix something on this page | Tap: start the picker | Button disables while the picker loads, popup closes | Native button | none | failure: hint says reload, button comes back | P0 | done (no double start) |
| Remove a fix / a site rule | Trash button on the row | Row goes, toast "Removed … / Undo" fades in for 6 s (stays under a pointer or focus), leaves in 140 ms | Visible trash button; Undo button 44 px; Cmd/Ctrl+Z; toast text is a live region | none | focus moves to a neighbouring row, and to the restored row after Undo; a later change withdraws the offer | P0 | done (was: gone at once, no undo) |
| Row swipe to delete, long-press menu | n/a | n/a | n/a | n/a | n/a | n/a | n/a: one action per row with a visible button; a custom swipe inside Safari's popover would fight its scroll and dismiss gestures |
| Reorder | n/a | n/a | n/a | n/a | n/a | n/a | n/a: lists are sorted by name |
| Row removal animation | Row leaves | Rows are re-rendered, the gap closes at once | n/a | none | n/a | P2 | not done: needs keyed rows; the toast carries the confirmation |
| More settings | Tap the row | Chevron turns; the three sections fade in 30 ms apart | Native details/summary | none | pressed fill; RM: instant | P1 | done |
| Reset all (popup) | Reset…, then Reset all | Inline confirm fades in; while pending both buttons are disabled; result line says done or failed | Native buttons, focus returns to Reset | none | idle, confirm, pending, done, failed | P0 | done (pending state); confirm kept: it also erases the app's copy, so no undo |
| Reset all (settings page) | Reset…, dialog | Native modal dialog starts at 0.95 and fades in with its backdrop; Reset disabled while pending | Escape cancels, focus trapped and returned | none | RM: instant | P0 | done (entrance, pending) |
| Send Debug Logs | Type, press Send | Button enables with text; status line says what happened | Native | none | disabled until text; repeat press allowed on purpose | P1 | there |
| Popup scrolling | Scroll | One native scroll container, overscroll contained | Native | none | no layout shift on re-render | P0 | there (t033) |
| Pull to refresh, pagination, search | n/a | n/a | n/a | n/a | n/a | n/a | n/a: local data, short lists (the app's Sites list has search) |
| Pressed states on iPhone | Touch | `:active` fills and scales | n/a | n/a | n/a | P0 | device: needs a real iPhone to confirm Safari shows them in the popover |

## Container app (SwiftUI, native lists and controls)

| Component or journey | Trigger and intent | Visual response | Gesture + accessible alternative | Haptic | States, reduced motion | Pri | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Setup check | App opens or returns | Spinner, then check and "Found it" cross-fade 200 ms | n/a | none | VoiceOver reads the stage; RM: no animation | P0 | there |
| Setup finished | First time the extension is found | Symbol bounce once, check springs in | n/a | success, once | RM: plain fade | P0 | there |
| Mirror shades (iPhone hero) | Tap: try it on a white page | Lenses dim and sink to 0.97 while pressed (Liquid Glass answers on iOS 26); fill springs when dark mode flips | Button with a VoiceOver label | none (opens Safari) | RM: no scale, fill changes at once (the spring ignored Reduce Motion before) | P1 | done |
| Navigation, back swipe, lists, search | System | System | System | system | system | P0 | there |
| Sites list | Read-only mirror | n/a | n/a | n/a | empty and no-match states | n/a | n/a: nothing to delete, reorder or refresh here; rules change in Safari |
| Reset all settings | Reset…, confirm | System confirmation dialog, result text under the button | System | success when erased, error when storage could not be reached (iPhone) | result is written on screen, not only felt | P0 | done (haptic); device: feel |
