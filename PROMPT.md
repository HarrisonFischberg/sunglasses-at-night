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

- Completion marker: print `<promise>COMPLETE</promise>` only when every approved
  task in `prd.md` is `done` with evidence. Blocked or review-dependent tasks
  never count as done.
- Print `<progress>NONE</progress>` if this iteration produced no meaningful
  progress; the runner stops after two in a row.
- Never edit `.claude/settings.json`, never `git push`, never add a dependency
  that `prd.md` doesn't list as approved.
