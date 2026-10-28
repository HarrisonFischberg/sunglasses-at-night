# Regression suite: forms, layers, picker

Added 2026-10-28 for three reports: dialogs and popovers blend into the
dark page; typed text in inputs becomes unreadable; a picker fix meant for
one field changes the whole page.

Two separate results, never mixed:

1. **WebKit harness** (`e2e/regression-*.test.js`): Playwright WebKit loads
   the fixture pages and the production content script (`engine/src/content.js`
   bundled, as in Safari) and picker (`engine/src/picker.js`), through the
   stand-in extension APIs in `e2e/harness.js`. Playwright WebKit is not
   Safari, and Playwright can't load a Safari extension.
2. **Real Safari** (`qa/safari-regression.mjs`): the same fixture pages in
   macOS Safari with the installed extension. It first proves the extension
   is enabled and affecting the page, and stops if not.

## Commands

| What | Command |
| --- | --- |
| WebKit harness, regression only | `npm run regression` |
| WebKit harness, whole e2e suite (includes these) | `npm run e2e` |
| one file | `node --test e2e/regression-picker.test.js` (after `npm run pree2e`) |
| real Safari (Mac, setup in `qa/README.md`) | `scripts/build-mac.sh`, re-tick the extension, then `node qa/safari-regression.mjs` |
| Chromium stand-in (only where WebKit can't be installed) | `E2E_BROWSER=chromium E2E_CHROMIUM_PATH=<chromium binary> npm run regression` |

Chromium results are labelled `chromium-…` and are not WebKit results.

## Artifacts

`e2e/regression-out/<browser>-<os>-1024x900/` (git-ignored; `REGRESSION_OUT`
moves it):

- `gallery/<page>-off.png`, `-on.png`: the fixture gallery, extension off and on.
- `picker-*-before.png`, `-after.png`, `-diff.png`: picker edits. In a diff,
  red = changed pixel outside the edited part, blue = the edited part (masked).
- `*.json`: per test, what was picked (element, shadow-root context), the
  stored selector, what it matches now, the CSS applied, computed-style
  changes, contrast lists.
- Safari: `e2e/regression-out/safari-macos/`.

Baselines: the picker pixel checks compare before/after in the same run,
browser and viewport, so they need no stored baseline. Gallery screenshots
are for review by eye; nothing in the suite writes or approves a baseline.

## Fixtures (`e2e/fixtures/regression/`)

| Page | Covers |
| --- | --- |
| `forms.html` | sign-in form, positional fields with floating labels (pointer-events: none), select, textarea, contenteditable, a web-component app (`<app-shell>`, open shadow root) |
| `inputs.html` | default, styled, `color: inherit`, `-webkit-text-fill-color`, CSS variables, `!important`, validation error, caret color, gradient, `color-scheme: light`, disabled, search; white on `:focus`, white once filled, inline style and class set by script while typing, a rich editor that wraps typed text in a black span |
| `layers.html` | native `<dialog>` with `::backdrop`, `popover`, custom modal with backdrop, dropdown menu, tooltip; inputs inside the dialog and modal |
| `css-cases.html` | transparent and inherited colors, variables, `!important`, `::before`/`::after`, gradient, patterned and photo-like background images, `:hover`, translucent tint, `::selection` |
| `embedded.html` | open shadow root, same-origin frame, cross-origin transparent frame (payment-field style), content inserted after load, SPA navigation (`pushState`) |
| `own-dark.html` | a site with its own dark theme |
| `media.html` | photo, dark logo picture, `currentColor`, black and brand-colored SVG icons |

## Tests

`regression-picker.test.js`: one input's background changed by Remove dark
mode (white) leaves the page and the other inputs alone (computed styles,
layout, and every pixel outside it); typed text on it readable; same after a
reload; positional pick resolves to exactly one element; Undo restores every
computed style and pixel; a field inside a web component is refused, never
widened silently; widening to the whole component on purpose works and the
resulting unreadable text is reported in the toast; a part that changed
before you chose a fix is not saved; a stored selector that now matches
several elements is applied to none.

`regression-layers.test.js`: each open menu, dialog, popover and custom
modal measured on the screenshot (edge of the surface vs. the page past its
shadow, ratio ≥ 1.15) with readable text; typing inside the dialog and modal.

`regression-pages.test.js`: every fixture page off vs on (contrast failures
present with the extension off are the site's, reported separately); typing
into every field, placeholder and caret; submit; hover and selection;
shadow root, both frames (measured on the screenshot: a transparent frame
shows the parent's paint), inserted content and SPA navigation; photo pixels
kept, icons visible and on-hue; on/off three times with no duplicate sheets
and off restoring every computed style; a site rule of "never" and another
site's fix change nothing.

## Manual checks (real Safari, Mac and iPhone)

The picker is opened from the toolbar popup, which automation can't press.

1. `regression/forms.html` → popup → Fix something on this page → click the
   Email field → Remove dark mode. Only that field turns white with dark text.
2. Click "Search" inside the lower box (a web component). The menu says it
   can't be fixed on its own; no fix button is offered. Bigger area picks
   the whole box; Remove dark mode there shows "Some text in it is hard to
   read now"; press Undo.
3. Reload: fix from step 1 still applies, nothing else changed.
4. Autofill: let Safari fill the Email field from a saved contact; the
   filled text must stay readable (autofill styling can't be triggered
   from automation).
5. On iPhone, the same with taps.

## Known gaps

- Closed shadow roots: unreachable for the picker and the engine.
- Fields inside a web component can't be fixed on their own (refused, see above).
- Elevation for floating surfaces only covers a plain light color declared in
  the same rule as the box-shadow, plus the browser's own dialog/popover;
  surfaces colored through `var()` stay flat.
- Typed-text failures were not reproduced in the WebKit harness; Safari
  autofill and real-site editors need the manual checks above.
