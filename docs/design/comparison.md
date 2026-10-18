# Design directions: comparison and recommendation (Opus)

Written 2026-10-18 for the owner's choice (Phase 3B step 6). Inputs: the three
concepts in `design/concepts/{a,b,c}`, runner screenshots in
`design/screenshots/` (390×844 and 1440×900, plus off and restricted states,
WebKit via Playwright), `docs/design/directions.md`, `docs/design/critique.md`,
and `ralph/evidence/t026-e2e.json`. All three pass the measured checks: no
overflow, no text under 4.5:1, no target under 44 px.

What matters most for this product (from PRODUCT.md): someone in a dim room,
often one-handed on a phone, opens the popup to answer "is it on, and for this
site?" and occasionally makes an exception. The popup should be calm at night,
quick to read, and feel at home on iPhone, iPad and Mac. Wit lives only in the
status line.

## A: Tortoiseshell (warm black, amber, serif status line)

- **Personality:** the calmest and most "night reading". The serif "Lights low." status is the most memorable brand moment of the three.
- **Fit:** strong on readability and plain, explained choices (each mode has a one-line description).
- **Tradeoffs:** the longest popup. On a phone you scroll past four mode rows, presets and four sliders, so it's the slowest for the common "this site" exception. The editorial feel is more Mac/reading app than iOS-native.

## B: Polarized (blue-black, mirror-teal, instrument panel)

- **Personality:** decisive and techy. One big on/off switch, mono type for hostnames and times.
- **Fit:** the fastest one-handed on/off control, and the shortest popup.
- **Tradeoffs:** the bright teal status block is the loudest thing on screen. That works against "comfortable in a dark room", our main use case. Selected states are inconsistent (white tile vs teal), and it risks looking like a generic toggle app.

## C: Dusk (warm gray, coral, rounded, native grouped lists)

- **Personality:** soft, friendly, the most native-feeling on iPhone and iPad.
- **Fit:** compact segmented controls make both the mode and "this site" one tap each. The Look presets are shown as tiny page previews, so they need no explanation. It reads calmly at night, with no large bright surfaces.
- **Tradeoffs:** the coral status orb is decoration, not a control. The segment labels are abbreviated ("System", "Schedule"). It's the least distinctive on the Mac.

## Recommendation: **C, Dusk**

It fits the core scene best: night, phone, quick exception. It matches the
platform choice (`adaptive`, native-first), and it's the only direction where
the common actions are one tap each without a long scroll. Its weaknesses are
fixable within its own world:

1. Replace the decorative orb with a **status mark built from the minimalist sunglasses icon** (lenses filled when on, outlined when off). That ties the popup to the app icon (T017) and makes the mark meaningful.
2. Use full labels in the mode control ("Match system", "On a schedule"), wrapping to two lines at 390 px rather than abbreviating.
3. Give the Mac a little more presence: a slightly wider popup, and the Settings window as a two-column grouped list.

If the owner prefers the strongest brand voice over speed, **A** is the
runner-up. It would need the Look sliders moved behind a disclosure to shorten
the popup. B isn't recommended for a dark-room product as designed.

## Next after approval (Phase 3C)

Write `DESIGN.md` for the chosen direction, run `/impeccable extract` (tokens
and every component state), then `/impeccable polish`. Only then do the real
popup/options restyle (T010 follow-up), the app screens (T015), the icon (T017)
and Report a problem (T011).

## Owner decision (2026-10-18 19:33–19:37Z)

Owner: "I like B and C" … "i prefer the layout of B generally speaking".

**Approved direction: B's layout in C's visual language ("Polarized layout, Dusk skin").**
- **From B (structure):** the large full-width on/off switch at the top of the popup; mode as tiles; "This site" as a segmented control; compact slider rows with values on the right; Settings with a section rail (desktop) and sectioned panels.
- **From C (look):** warm-gray surfaces, coral accent, rounded system type, soft radii; Look presets as tiny page previews; grouped-list rhythm on iPhone.
- **Night rule (from the critique):** no large bright block. The status/switch area is a dark panel; "on" shows as the coral switch fill plus the sunglasses status mark, never a full-bleed bright fill. One consistent selected style (coral) everywhere.
- Full labels ("Match system", "On a schedule"); sunglasses mark beside the status line ("Lights low.").
This is one world, not a 50/50 mix: C's tokens and component styling applied to B's information architecture.
