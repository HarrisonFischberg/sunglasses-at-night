#!/bin/bash
# Fresh-context Ralph loop, adapted from coleam00/ralph-loop-quickstart @ f6a7781.
# Changes vs upstream:
#   - hard cap 10 iterations per approved run; stop after 2 iterations without progress
#   - the runner (not the model) picks the next dependency-ready task from prd.md
#   - each iteration is a fresh `claude -p` whose prompt is a bounded /goal for that one task;
#     PROMPT.md is appended to the system prompt
#   - progress = git HEAD or working tree changed; logs in ralph/logs/
#   - refuses to run unless prd.md is APPROVED; --dry-run prints the next goal
#   - passes --settings explicitly (untrusted workspace otherwise ignores project allow rules)
#   - Xcode can't run inside the Claude sandbox (RTK rewrites xcodebuild → rtk xcodebuild, so
#     excludedCommands doesn't match): the runner runs ralph/verify-swift.sh around each iteration
set -euo pipefail
cd "$(dirname "$0")/.."
MODEL="${RALPH_MODEL:-claude-opus-5-5}"
MAX_TURNS="${RALPH_MAX_TURNS:-200}"   # safety bound on tool turns inside one iteration

goal_for() {
  node -e '
    const t = JSON.parse(process.argv[1]);
    process.stdout.write(`/goal Task ${t.id} in prd.md ("${t.task}") meets its acceptance criteria: ${t.criteria}. ` +
      `Proof is the real output of: ${t.verify}, recorded in activity.md, and the task row status set to "done" in prd.md with evidence paths. ` +
      `Alternatively the goal is met if a blocker needing human input is recorded in docs/launch-blockers.md and the task row status is set to "blocked". ` +
      `Give up and record a blocker after 5 failed attempts at the verification command.`);
  ' "$1"
}

if [ "${1:-}" = "--dry-run" ]; then
  t=$(node ralph/next-task.js) || { echo "next-task: $t"; exit 0; }
  goal_for "$t"; echo; exit 0
fi
MAX="${1:-10}"
if [ "$MAX" -gt 10 ]; then echo "cap is 10 iterations per approved run" >&2; exit 2; fi
for f in PROMPT.md prd.md activity.md; do [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }; done
grep -q "Status: \*\*APPROVED" prd.md || { echo "prd.md not approved" >&2; exit 1; }
mkdir -p ralph/logs ralph/evidence
ralph/verify-swift.sh || true
ralph/verify-e2e.sh || true
NOPROG=0
for ((i=1; i<=MAX; i++)); do
  set +e; t=$(node ralph/next-task.js); rc=$?; set -e
  if [ $rc -eq 10 ]; then echo "<promise>COMPLETE</promise> all tasks done"; exit 0; fi
  if [ $rc -eq 11 ]; then echo "stopped: pending tasks remain but none are dependency-ready (blocked)"; exit 4; fi
  id=$(node -e 'console.log(JSON.parse(process.argv[1]).id)' "$t")
  before="$(git rev-parse HEAD)$(git status --porcelain | shasum)"
  log="ralph/logs/$(date +%Y%m%d-%H%M%S)-iter$i-$id.json"
  echo "=== iteration $i/$MAX: $id → $log"
  claude -p "$(goal_for "$t")" --append-system-prompt "$(cat PROMPT.md)" --settings .claude/settings.json \
    --model "$MODEL" --max-turns "$MAX_TURNS" --output-format json > "$log" 2> "$log.err" || true
  node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(`  ${d.subtype} turns=${d.num_turns} cost=$${(d.total_cost_usd||0).toFixed(2)}`)}catch(e){console.log("  (no JSON result)")}' "$log"
  ralph/verify-swift.sh || true
  ralph/verify-e2e.sh || true
  after="$(git rev-parse HEAD)$(git status --porcelain | shasum)"
  if [ "$before" = "$after" ]; then NOPROG=$((NOPROG+1)); echo "  no progress ($NOPROG)"; else NOPROG=0; fi
  if [ "$NOPROG" -ge 2 ]; then echo "stopped: 2 iterations without progress"; exit 3; fi
  sleep 2
done
echo "iteration limit reached; not complete"; exit 1
