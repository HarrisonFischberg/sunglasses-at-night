# Per-iteration instructions (Sunglasses at Night)

Each fresh session:

1. Read `CLAUDE.md`, `prd.md`, `activity.md`, and `docs/launch-blockers.md`.
2. Pick exactly one dependency-ready atomic task from `prd.md`.
3. Establish a bounded `/goal` quoting that task's acceptance criteria and the
   verification command whose real output will decide it. Max 5 turns.
4. Implement only that task.
5. Run the task's automated checks plus the relevant browser or runtime check.
6. Update the task status and record evidence paths.
7. Append progress, commands, results, and blockers to `activity.md`.
8. Commit only this task's changes, if commits are authorized.

Stop on verified completion, a documented blocker needing human input, or the
turn limit. Never mark a blocked task passing to end the loop. Emit the success
marker only when every approved task genuinely meets its acceptance criteria.

## Runner contract (ralph/ralph.sh, adapted from coleam00/ralph-loop-quickstart @ f6a7781)

- The runner already picked your one task and set its bounded `/goal` as the prompt
  (step 2–3 above are done for you). Work only on that task.
- When done: set its row status in `prd.md` to `done (<date>, evidence: <paths>)`;
  if blocked: `blocked (<B-id>)` plus a row in `docs/launch-blockers.md`.
- Append an `activity.md` entry with the exact verification command and its real output summary.
- Commit only this task's files: `git add <paths> && git commit -m "<id>: <summary>"` ending with
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Xcode builds/tests can't run inside your sandbox. The runner runs them before and after every
  iteration and writes `ralph/evidence/swift-build-latest.md`; read it instead of calling
  `xcodebuild`. If your task's acceptance needs a Swift build you just changed, set the row status to
  `needs-runner-build` and stop; the next iteration picks the same task first, reads the fresh log,
  and marks it done or fixes it. Code signing is off for these builds (B7).
- Engine tests: `npm test` (runs `node --test 'engine/test/**/*.test.js'`).
- Never edit `.claude/settings.json`, never push, never add a dependency `prd.md` doesn't list as
  approved (approved: `playwright@1.64.1` dev-only; nothing else).
- Never weaken or delete a test to make it pass. Never mark a blocked task done.
- Product name is "Sunglasses at Night". Never use reference apps' names, copy, or visuals.
- No network code in the shipped extension or app except what prd.md T007 allows.
