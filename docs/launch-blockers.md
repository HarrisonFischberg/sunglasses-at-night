# Launch blockers

| # | Blocker | Type (missing fact / failed check / legal review / approval) | Owner | Needed for | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | Legal entity / trading name that publishes on the App Store (seller name) | missing fact | Harold | safeguard 16, privacy policy, listing | OPEN |
| B2 | Business location (country/state) for policy "who we are" | missing fact | Harold | 1, 16 | OPEN |
| B3 | "Youngest age allowed": interpreted as App Store 4+ rating with no data collection, NOT the Kids Category (Kids Category adds Apple review rules). Confirm | approval + legal review | Harold + counsel | 17 | OPEN |
| B4 | Children's privacy review for global launch (COPPA, GDPR Art. 8, UK AADC, etc.) given 4+ and the mailto report flow | legal review | counsel | 17, 1 | OPEN |
| B5 | Public URL to host the privacy policy and support page (App Store requires one). Hosting = deployment | approval | Harold | 1, listing | OPEN |
| B6 | Retention policy for report emails at hello@rarecreatures.app and the email provider used | missing fact | Harold | 1, data inventory | OPEN |
| B7 | Apple Developer Program team / signing identity for archive + TestFlight | approval (account) | Harold | release | OPEN |
| B8 | Privacy policy + terms drafts need qualified legal review before publishing | legal review | counsel | 1, 2 | OPEN (drafts not written yet) |
| B9 | Trademark / name clearance for "Sunglasses at Night" (also a well-known song title) | legal review | Harold + counsel | brand, listing | OPEN |
| B10 | REA web capture | tool | Harold | discovery evidence | CLOSED 2026-10-18: headless Comet, isolated profile |
| B11 | Caveman skill | tool | Harold | comms rule | CLOSED 2026-10-18: owner said never use it; removed from skill |
| B12 | Playwright (WebKit) dev dependency for e2e fixtures | approval | Harold | T012 evidence for safeguards 14 + contrast claim | CLOSED 2026-10-18: approved |
| B13 | Ralph session can't run any verification command: `npm test`, `npm test`, `node engine/scripts/check.js` and `rtk proxy npm test` all return "This command requires approval" despite the `Bash(node --test:*)` / `Bash(npm test:*)` / `Bash(node engine/scripts/:*)` allow rules. Likely cause: the global RTK hook rewrites commands (e.g. to `rtk …`) so they no longer match the project allowlist. Agents may not edit `.claude/settings.json` | failed check / approval (permissions) | Harold | T001 and every later task's verification | RESOLVED 2026-10-18: real cause is the untrusted workspace (Claude Code printed 'Ignoring 22 permissions.allow entries… workspace has not been trusted'). The runner now passes `--settings .claude/settings.json`, and `npm test` runs. Also `node --test <dir>` fails on Node 24; now uses a glob |
| B14 | Ralph session can't build with Xcode. `xcodebuild … build` runs but fails at Build Preparation: `Couldn't create workspace arena folder '…': Unable to write to info file '…/info.plist'` (EPERM). Same failure with DerivedData in `build/` (inside the project) and in `$TMPDIR`, both nominally writable, so the Seatbelt sandbox is blocking Xcode's own file writes. CoreSimulatorService is also unreachable (`Simulator device support disabled`), so the iOS Simulator build can't run either. `plutil -lint`, `xcrun swiftc -parse` and `safari-web-extension-packager` all need approval. Separately, "extension loads in Safari" needs a human: Safari ▸ Develop ▸ Allow Unsigned Extensions, then enable it in Settings ▸ Extensions. Agents can't open apps (`open`/`osascript` are blocked). Fix options (owner's call): exclude `xcodebuild` from the sandbox in `.claude/settings.json`, or run the two CLAUDE.md build rows by hand and paste the output into `activity.md` | failed check / approval (sandbox) + manual check | Harold | T002, and every Swift build/test row (T007, T009, T014–T017) | WORKAROUND 2026-10-18: the RTK hook rewrites `xcodebuild` to `rtk xcodebuild`, so sandbox `excludedCommands` doesn't match. The runner runs `ralph/verify-swift.sh` outside the sandbox around each iteration (both builds SUCCEEDED). Signing still needs B7. Loading the unsigned extension in Safari needs the owner (T016) |
| B15 | Ralph session can't run the WebKit e2e suite. `npm run e2e` (Playwright 1.64.1 WebKit, `webkit-2370`) fails at `browserType.launch: Timeout 180000ms exceeded` because WebKit can't start inside the agent's Seatbelt sandbox: `sandbox_extension_issue_file_to_process failed for …/ms-playwright/webkit-2370/Playwright.app: 1 (Operation not permitted)` and `Connection Invalid error for service com.apple.hiservices-xpcservice`. No other browser is installed (Chromium headless shell missing), and downloading one isn't approved. The suite itself (`e2e/dynamic.test.js`, 7 fixtures) has never run, so its own bugs are unknown. Same class of problem as B14. Fix options (owner's call): (a) run `npm run e2e` yourself in a normal terminal and paste the summary into `activity.md`; it writes `ralph/evidence/t007-e2e.json` and `t007-<fixture>-{before,after}.png`; or (b) approve adding `npm run e2e` to the runner's out-of-sandbox step (next to `ralph/verify-swift.sh`), writing `ralph/evidence/e2e-latest.md`. Agents must not wire that in themselves because it runs agent-written code outside the sandbox | failed check / approval (sandbox) | Harold | T007 verification, and T008, T012, T013 (same WebKit run) | OPEN 2026-10-17 |

## Unknown business and legal inputs

Never infer these from a reference app. Never invent them.

- Legal entity and trading name: UNKNOWN (B1). The contact domain rarecreatures.app is not proof of the entity.
- Business location: UNKNOWN (B2)
- Launch countries/states: **all App Store storefronts (owner: "global")**
- Public business contact: **hello@rarecreatures.app (owner)**
- Privacy contact: **hello@rarecreatures.app (owner)**
- Minimum user age / children may use: **owner: "youngest age allowed"** → planned 4+, children may use; needs B3/B4
- Pricing, billing, trials, renewal: **free, no in-app purchases (owner)**
- Refund and cancellation terms: NOT APPLICABLE (free, no purchases)
- Data types and sensitive data: see `docs/data-inventory.md` (planned: settings + hostnames, on device)
- Vendors, SDKs, analytics, AI providers, processors: **none planned**
- Retention or deletion exceptions: UNKNOWN for report emails (B6)
