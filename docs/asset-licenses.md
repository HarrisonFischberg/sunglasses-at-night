# Asset and code licenses

| Asset / package | Type | Source | License | Permitted uses | Attribution required | Where used |
| --- | --- | --- | --- | --- | --- | --- |
| SF Symbols | icons | Apple | Apple SF Symbols license (Apple-platform UI only; not in logos/app icon) | in-app UI glyphs | no | container app |
| System fonts (SF) | font | Apple, via OS | OS-provided, not bundled | rendering only | no | app, popup |
| App icon (sunglasses mark) | image | Original, drawn in code by `design/icons/generate.js` (T017); teal `#5fd7c9` glasses on cool charcoal (recolored from coral by T037, owner 2026-10-19), no moon, no purple (R15) | owner-owned original, no third-party art | all | no | `App/Assets.xcassets/AppIcon.appiconset` (macOS + iOS), `Extension/Resources/images/icon-*.png` (Safari extension list, App Store listing) |
| Toolbar icons (sunglasses glyph) | image | Original, same generator and geometry; single-colour transparent glyph, `toolbar-dark-*` (dark ink, light toolbars) and `toolbar-light-*` (light ink, dark toolbars); `toolbar-*-off-*` are the same glyph at 38% opacity for the off state | owner-owned original, no third-party art | all | no | `Extension/Resources/images/toolbar-*.png`, manifest `action.default_icon` |
| Dark Reader site lists + config parser / URL matcher | data + code | github.com/darkreader/darkreader @ `fda0590` (`third_party/darkreader/`) | MIT, Copyright (c) Dark Reader Ltd. | all, with the notice | **yes**: license text shown in the app (About ▸ Licenses) and the options page (Licenses) | `engine/src/site-fixes.js`, `engine/src/generated/*`, content + background bundles |
| Playwright (if approved) | dev dependency | npm `playwright` | Apache-2.0 | dev/test only, not shipped | notice not shipped | e2e |

"Publicly downloadable" is not a license. No code from Noir or Midnight is
used. Dark Reader (MIT) code and site lists are used with the owner's approval
(2026-10-21) and its notice; see `third_party/darkreader/README.md`.
