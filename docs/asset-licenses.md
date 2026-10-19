# Asset and code licenses

| Asset / package | Type | Source | License | Permitted uses | Attribution required | Where used |
| --- | --- | --- | --- | --- | --- | --- |
| SF Symbols | icons | Apple | Apple SF Symbols license (Apple-platform UI only; not in logos/app icon) | in-app UI glyphs | no | container app |
| System fonts (SF) | font | Apple, via OS | OS-provided, not bundled | rendering only | no | app, popup |
| App icon (sunglasses mark) | image | Original, drawn in code by `design/icons/generate.js` (T017); coral `#ff9a76` glasses on warm charcoal, no moon, no purple (R15) | owner-owned original, no third-party art | all | no | `App/Assets.xcassets/AppIcon.appiconset` (macOS + iOS), `Extension/Resources/images/icon-*.png` (Safari extension list, App Store listing) |
| Toolbar icons (sunglasses glyph) | image | Original, same generator and geometry; single-colour transparent glyph, `toolbar-dark-*` (dark ink, light toolbars) and `toolbar-light-*` (light ink, dark toolbars); `toolbar-*-off-*` are the same glyph at 38% opacity for the off state | owner-owned original, no third-party art | all | no | `Extension/Resources/images/toolbar-*.png`, manifest `action.default_icon` |
| Playwright (if approved) | dev dependency | npm `playwright` | Apache-2.0 | dev/test only, not shipped | notice not shipped | e2e |

"Publicly downloadable" is not a license. No code from Noir, Dark Reader, or
Midnight is used. Dark Reader's MIT repo was viewed only at directory-name level.
