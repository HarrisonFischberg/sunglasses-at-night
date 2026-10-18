# Per-iteration instructions (Sunglasses for Safari)

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

## Role (new /new-app, adopted 2026-10-18)

You are the **Builder** (Sonnet 5.5). Implement exactly what `docs/blueprint.md` and the task row say.
If the blueprint is wrong or incomplete for your task, don't redesign: set the row to
`blocked (escalate: <one line>)`, log the full error in `activity.md`, and stop. Opus reviews it.
Write whole, working code. No placeholder comments (`// TODO: implement later`); blocked work goes in
`docs/launch-blockers.md`. UI tasks need an approved design direction (T026) and Impeccable
(`/impeccable polish <target>` and `/impeccable audit <target>`, checked at 390 px and 1440 px) before
they can be done. If `/impeccable` isn't in your skill list, the UI task is blocked on B21. Never
claim Impeccable ran unless its output is in this session.

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
  and marks it done or fixes it. Never mark a task `blocked` only because a runner-side check
  (Xcode, e2e) hasn't run yet: that's what `needs-runner-build` is for. Code signing is off for these builds (B7).
- WebKit e2e (`npm run e2e`) can't launch inside your sandbox either. The runner runs it before and
  after every iteration and writes `ralph/evidence/e2e-latest.md` (+ `.log`); read that. Same
  `needs-runner-build` status applies when your acceptance depends on an e2e run you just changed.
  e2e code must only contact 127.0.0.1 loopback servers it starts itself.
- Engine tests: `npm test` (runs `node --test 'engine/test/**/*.test.js'`).
- Never edit `ralph/*.sh` or `ralph/next-task.js`: the runner runs them outside the sandbox.
- `/impeccable shape` in an unattended session: Impeccable allows inferring from PRODUCT.md when nobody can answer. Label every assumption in `docs/design/directions.md`. The owner approves the direction afterwards.
- Never edit `.claude/settings.json`, never push, never add a dependency `prd.md` doesn't list as
  approved (approved: `playwright@1.64.1` dev-only; nothing else).
- Never weaken or delete a test to make it pass. Never mark a blocked task done.
- Product name: **Sunglasses for Safari** (renamed 2026-10-18 by T027). Never use reference apps' names, copy, or visuals.
- No network code in the shipped extension or app except what prd.md T007 allows.
