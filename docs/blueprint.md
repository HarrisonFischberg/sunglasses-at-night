# Blueprint: Sunglasses for Safari

Written 2026-10-18 by Opus when the project moved to the new `/new-app`
version (owner decision). It records the architecture already approved in
`prd.md` v1 and built in runs 1–2, plus the run-3 fixes. Architecture only, no
routine code.

## Stack decision

| Choice | Picked | Rejected, and why |
| --- | --- | --- |
| Extension | Safari Web Extension, Manifest V3, plain JS, zero runtime dependencies, bundled by `engine/scripts/bundle.js` | Legacy Safari App Extension (macOS only, no iOS); a framework like React (bundle size and startup cost in every frame, a supply-chain surface for no gain) |
| Container app | SwiftUI multiplatform (iOS 16+ / macOS 13+), one Xcode project | Separate UIKit/AppKit apps (two codebases); Catalyst (weaker macOS fit) |
| Engine | Dynamic CSSOM rewrite (primary) + CSS-filter fallback per site | Filter-only (inverts images, washes out colors, the reference apps' known complaint); static per-site themes (unmaintainable) |
| Hosting | None for the app. Policy/support page host is still open (B5) | Any backend: nothing needs one, and having none is the privacy promise |
| Tests | `node:test` (unit), Playwright 1.64.1 WebKit (e2e/perf, dev-only), XCTest | Jest or Vitest (extra dependencies for no gain) |

## Data model (on device only)

There is no server and no account. Two stores hold the same JSON document:

- `browser.storage.local` key `settings` (source of truth for the extension)
- App Group `UserDefaults` suite `group.app.rarecreatures.sunglassesatnight`, key `settings` (the container app's mirror, synced over native messaging; needs signing, B7)

```
Settings v1 {
  version: 1
  mode: 'system' | 'always' | 'schedule' | 'off'
  schedule: { start: 'HH:MM', end: 'HH:MM' }          // may cross midnight; start == end means never
  look: { brightness, contrast, sepia, grayscale: int % (clamped) , preset?: string }
  images: 'leave' | 'dim' | 'noinvert'
  hideBackgroundImages: bool
  detectDark: bool
  engine: 'dynamic' | 'filter'
  sites: { [normalizedHostname]: { rule: 'default'|'always'|'never', look?: Partial<Look>, engine?, detectDark? } }
}
```

Access rules: only the extension (popup, options page, background) and the
container app write it. Content scripts read it. Nothing is ever transmitted.
Per-tab state (the last `TAB_STATE` report, and as of run 3 the tab's hostname)
lives in background memory only and is dropped when the tab closes.

## API spec (internal message protocol: no network API exists)

| Message | From → to | Request | Response | Errors |
| --- | --- | --- | --- | --- |
| `fetch-sheet` | content → background | `{ url }` (a stylesheet URL the page itself loaded) | `{ ok, text }` | non-2xx, non-CSS type, size cap → `{ ok:false }` |
| `settings-changed` | background → every tab | `{ settings }` | none | tab gone: ignored |
| `tab-state` | top frame → background | `{ on, reason, host }` (**`host` added in run 3**, T022) | none | — |
| `get-tab-state` | popup → background | `{ tabId }` | last report `{ on, reason, host }` or `null` | unknown tab → `null` |
| `reset-all` | options → background → native | `{}` | `{ ok }` | native bridge unavailable → extension store still reset; report it |
| native `settings.get/set/reset` | background → `SafariWebExtensionHandler` | JSON settings | JSON settings / ok | unsigned build: App Group unavailable → error, extension keeps working |

## Folder structure

```
engine/src/        pure logic + content/background/popup/options entry points (source of truth)
engine/test/       node:test unit tests
engine/scripts/    bundle.js, check.js, perf.js
e2e/               Playwright WebKit suites + fixtures (loopback servers only)
Extension/Resources/  bundled output + manifest, popup/, options/, ui/
App/               SwiftUI container app
SunglassesAtNight.xcodeproj, Config/ (entitlements, Info.plists)
ralph/             runner, verify scripts, logs, evidence
design/concepts/{a,b,c}  Phase 3B concept previews (not shipped)
docs/              blueprint, rea-findings, data-inventory, compliance, design/
```

## State management

- Persisted state: the Settings document (above), owned by the extension store and mirrored to the app.
- Page state: owned by each content script (decision, generated override sheets), rebuilt on every settings change.
- Tab state: background memory (`TAB_STATE` + host), the source the toolbar and popup read.
- Popup and options pages: stateless views over Settings + tab state. They never cache.

## Vendors and data flows

None. No SDK, analytics, crash reporting, AI provider or processor. The only
network requests are (1) the background re-fetching a stylesheet from the
same server the page already loaded it from, and (2) a user-initiated
`mailto:` draft (T011). See `docs/data-inventory.md`.

## Run-3 structural fixes (Opus analysis, for Sonnet to implement)

1. **Popup shows no "This site" section in real Safari (T022).** `popup.js`
   derives the host only from `tabs.query({active, currentWindow})[0].url`.
   Safari leaves `url` out of `Tab` objects unless the extension holds an
   explicit grant for that site at that moment. That depends on Safari's
   per-site permission state, not on our `<all_urls>` request. With no url,
   `popupView` treats the page as restricted and hides the section. Fix:
   content script includes `location.hostname` in `TAB_STATE`; background
   stores it per tab; popup uses `tab.url` first, then the report's `host`,
   then `tabs.query({active, lastFocusedWindow})`. The page counts as
   restricted only when every source is empty. **No new permission** (don't
   add `tabs`).
2. **White flash on first load in real Safari (T023).** Safari injects
   `document_start` content scripts after an async settings read, so the first
   frame can paint before the anti-flash sheet exists. Fix direction: paint a
   neutral dark `html{background:#…;color-scheme:dark}` sheet synchronously at
   script start, before any `await`, then remove it within the same task once
   settings say "off" or "already dark". Keep a synchronous last-known-decision
   cache per origin (sessionStorage is the page's store, so don't use it;
   use an in-script default plus a `storage.local` read). Measure in Safari via
   T016, and in WebKit with a throttled settings read.
3. **Remaining Amazon stutter (T024).** It's browser style-recalc cost over
   ~3,700 generated override rules on DOM inserts, not engine JS. Fix
   direction: dedupe identical declarations, drop rules whose selectors match
   nothing at generation time and re-check lazily, coalesce per-color rules
   into custom properties, avoid universal/descendant-heavy selectors in
   generated CSS, and measure recalc cost in WebKit (with vs without the
   override sheet during an insert storm).
4. **Already-dark islands and palettes (T025).** An authored dark box on a
   light page gets lightened, and a saturated palette collapses to near-black.
   Fix direction: when an element's authored background is already dark (L ≤
   threshold), keep it as authored (only lift text contrast if needed). Map
   background lightness with a curve that keeps chroma and relative lightness
   order, so swatches stay distinct.

5. **White pop-in on heavy sites (T029, owner report 2026-10-18).** Real
   Safari on amazon.com shows white for 0.5–2 s before the page turns dark.
   Cause: the base sheet only darkens `html`/`body`; the site's own white
   containers stay white until the dynamic engine runs, which waits for full
   HTML parse and then cross-origin sheet re-fetches. Fix: an interim
   "neutralize backgrounds while loading" rule gated by
   `:not([data-sunglasses-ready])`, removed atomically when the first override
   sheet lands; start the engine on sheets as they arrive; cache rewritten CSS
   per sheet URL in the background. Interim state is flat dark (dark → dark),
   never white, and never touches media.

6. **amazon.com homepage defects (T031, owner screenshot 2026-10-18).**
   (a) `mix-blend-mode: multiply` product images over a tile we darkened go
   near-black: force `normal` blend for media over darkened backdrops. (b) Text
   over a photo (url() background or an img behind it) keeps its authored
   color; contrast enforcement only applies against solid colors we control.
   (c) Content inserted after load must never paint white: tag inserted
   subtrees `data-sunglasses-pending` in the MutationObserver callback (before
   paint), neutralize their backgrounds with a CSS rule, and untag when the
   sliced processor finishes.
