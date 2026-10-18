# Tool environment

Verified: 2026-10-17 (Phase 0). Re-verify at the start of each Ralph run.

| Tool | Available | Version | How verified |
| --- | --- | --- | --- |
| Replica | YES | replica-skill 1.0.0 (git 77c9436) | `~/.claude/plugins/installed_plugins.json`; skill dirs present incl. `replica-design/contrast.py`, `replica-recon/features.csv` |
| REA (MCP tools answer, not just skill installed) | YES | rea MCP server, CDP provider v2 | 2026-10-18: `list_browser_targets` + `capture_web_screenshot` returned evidence (ev_f75c881f…, ev_f2900664…, ev_3577d1e1…) against **headless Comet** (Chrome/154.0.8037.179) launched with an isolated scratch profile on 127.0.0.1:9333, then stopped. Nothing new installed. |
| Claude Code `/goal` | YES | Claude Code 2.1.301 | Command registration `name:"goal"`, `supportsNonInteractive:!0` found in the installed CLI binary. 2026-10-18 smoke test: `claude -p "/goal The file …/out.txt exists and contains exactly the word sunglasses."` → `terminal_reason: completed`, file written, cost $0.008. The runner passes one bounded `/goal` per iteration. |
| Ralph fresh-context shell loop | YES | coleam00/ralph-loop-quickstart @ f6a7781 (2026-01-20) | Cloned to scratchpad and reviewed `ralph.sh` + `.claude/settings.json`. Upstream permissions too broad (`WebFetch(domain:*)`, `Bash(npx:*)`, `autoAllowBashIfSandboxed`); a narrowed project config was approved 2026-10-18 and written to `.claude/settings.json`. The `ralph-loop@claude-plugins-official` 1.0.0 plugin is also installed but is a same-context loop and is NOT used as a substitute. |
| Caveman | REMOVED | — | Owner decision 2026-10-18: never use; removed from the new-app skill (SKILL.md, references/tools.md, scripts/scaffold.sh). |

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
