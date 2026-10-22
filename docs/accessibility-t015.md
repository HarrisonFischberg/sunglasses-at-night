# T015 accessibility checklist (S01–S04)

Status: **code review only.** Nothing below was run on a device or simulator; the Builder sandbox cannot launch the app, Accessibility Inspector, VoiceOver or Full Keyboard Access. Rows marked "owner" need a manual pass before T015 can be marked done.

| Item | How the code handles it | Verified |
| --- | --- | --- |
| VoiceOver labels | Every control is a native `Button`, `Link`, `LabeledContent` or `Text`, so the visible text is the label. Decorative sunglasses image is `.accessibilityHidden(true)`. Site rows use `.accessibilityElement(children: .combine)` so a host and its rule read as one item. Titles and section headings carry `.isHeader`. | code review; owner VoiceOver pass pending |
| Dynamic Type up to XXXL | Only system text styles (`.largeTitle`, `.title3`, `.headline`, `.subheadline`, `.footnote`); no fixed font sizes or fixed heights. Welcome and About scroll; Settings and Sites use `Form`/`List`. | code review; owner Simulator check at XXXL pending |
| Full Keyboard Access | Native controls only, so Tab/Space work. macOS default action is `.keyboardShortcut(.defaultAction)` on "Open Safari Extension Settings" / "Done". Reset uses a `confirmationDialog` with an explicit Cancel. | code review; owner check pending |
| Reduce Motion | No custom animation or transition in the app; only system tab and dialog motion, which the OS adapts. | code review |
| Contrast / color | System colors and `.secondary` only; no color-only meaning (rules are written out). | code review |
| Neutral wording (checklist 9) | Reset confirmation is neutral: "Reset all settings" / "Cancel". No nags or rating prompts. | code review |
| Popup keyboard pass | Covered by the existing e2e popup tests (native controls, 44 px targets); not a Swift concern. A manual keyboard pass in real Safari is still owner-run. | e2e (T030); owner pending |

## Design notes for the reviewer

- **S02 and S03 are read-only.** The extension owns the settings. The only app-to-extension channel in the bridge is the reset generation, so editing sliders or deleting a site in the app would change a mirror the extension never reads. The screens show what the extension last synced and point to the toolbar popup. If the owner wants editing in the app, the bridge needs a new app-to-extension message (a blueprint change, not a Builder one).
- S04 uses the copy in `docs/site/in-app-copy.md`. The "Report a problem" paragraph adds one sentence pointing to the popup link, because the mailto draft is built there, not in the app.
- Mirror parsing is `Shared/MirrorSummary.swift`, tested by `Tests/MirrorSummaryTests.swift` (4 cases).
