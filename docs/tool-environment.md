# Tool environment

Verified: 2026-10-17 (Phase 0). Re-verify at the start of each Ralph run.

| Tool | Available | Version | How verified |
| --- | --- | --- | --- |
| Replica | YES | replica-skill 1.0.0 (git 77c9436) | `~/.claude/plugins/installed_plugins.json`; skill dirs present incl. `replica-design/contrast.py`, `replica-recon/features.csv` |
| REA (MCP tools answer, not just skill installed) | PARTIAL | rea MCP server (connected) | `mcp__rea__list_browser_targets` answered with a structured `provider_unavailable / endpoint_unreachable` error, so the server is alive. **No CDP browser available**: Google Chrome / Chromium not installed, Playwright not installed. Web-observation tools are BLOCKED until a CDP browser exists. Static tools usable once an authorized local artifact exists (none of the 3 reference apps is installed on this Mac). |
| Claude Code `/goal` | YES | Claude Code 2.1.301 | Command registration `name:"goal"`, `supportsNonInteractive:!0` found in the installed CLI binary. Not yet exercised in a `claude -p` run; T000 smoke-tests it. |
| Ralph fresh-context shell loop | YES (cloned, not yet installed) | coleam00/ralph-loop-quickstart @ f6a7781 (2026-01-20) | Cloned to scratchpad and reviewed `ralph.sh` + `.claude/settings.json`. Upstream permissions too broad (`WebFetch(domain:*)`, `Bash(npx:*)`, `autoAllowBashIfSandboxed`); a narrowed project config is proposed in `prd.md` "Permission changes" and is **not written until approved**. The `ralph-loop@claude-plugins-official` 1.0.0 plugin is also installed but is a same-context loop and is NOT used as a substitute. |
| Caveman | **BLOCKED** | not installed | Not in `installed_plugins.json`, no `~/.claude/skills/caveman`. Status chatter written terse by hand; installing it from https://github.com/juliusbrussee/caveman needs owner approval (skill only, no proxy/telemetry). |

## Section F — design, accessibility, quality layer

| Skill | Available | Version / source | How verified |
| --- | --- | --- | --- |
| ui-ux-pro-max (design decisions) | YES | nextlevelbuilder/ui-ux-pro-max-skill, MIT, vendored 2026-10-15 | Ran `scripts/search.py ... --design-system` and `--stack swiftui`; output recorded in `replica/design-direction.md` |
| fixing-accessibility (edit-time a11y) | YES (present) | ibelick/ui-skills, MIT | `PROVENANCE.txt` present; applied from Phase 4 |
| web-quality-audit + siblings (evidence) | PARTIAL | addyosmani/web-quality-skills, MIT | Present. No Chrome DevTools MCP / Lighthouse. Popup and options pages are HTML, so audits degrade to manual + WebKit checks |
| ios-accessibility (native a11y) | YES (present) | see `PROVENANCE.txt` | Used for SwiftUI container app |

## Platform toolchain

| Tool | Version |
| --- | --- |
| Xcode | 27.0 (27A266a) |
| Node | v24.22.0 (built-in `node:test`, no test framework dependency) |
| Python | 3.9.6 (Replica contrast tool) |
| gh | logged in as HarrisonFischberg |

Missing tool or credential = BLOCKED, never PASS.

Opt-in only, needs owner approval as a permission change: pbakaus/impeccable
downloads and runs a checksum-verified binary on first run and installs
SessionStart / PostToolUse / Stop hooks. Not adopted.
