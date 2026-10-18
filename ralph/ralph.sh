#!/bin/bash
# Fresh-context Ralph loop, adapted from coleam00/ralph-loop-quickstart @ f6a7781.
# Changes vs upstream: hard cap 10, stop after 2 no-progress iterations, logs to
# ralph/logs/, --dry-run, runs from repo root. Do not run before prd.md approval.
set -euo pipefail
cd "$(dirname "$0")/.."
MAX="${1:-10}"
if [ "$MAX" = "--dry-run" ]; then echo "dry run: would run up to 10 iterations of: claude -p \"\$(cat PROMPT.md)\""; exit 0; fi
if [ "$MAX" -gt 10 ]; then echo "cap is 10 iterations per approved run" >&2; exit 2; fi
for f in PROMPT.md prd.md activity.md; do [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }; done
grep -q "Status: \*\*APPROVED" prd.md || { echo "prd.md not approved" >&2; exit 1; }
mkdir -p ralph/logs ralph/evidence
NOPROG=0
for ((i=1; i<=MAX; i++)); do
  log="ralph/logs/iter-$(date +%Y%m%d-%H%M%S)-$i.log"
  echo "=== iteration $i/$MAX → $log"
  result=$(claude -p "$(cat PROMPT.md)" --output-format text 2>&1) || true
  printf '%s\n' "$result" > "$log"
  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then echo "COMPLETE after $i"; exit 0; fi
  if [[ "$result" == *"<progress>NONE</progress>"* ]]; then NOPROG=$((NOPROG+1)); else NOPROG=0; fi
  if [ "$NOPROG" -ge 2 ]; then echo "stopped: 2 iterations without progress"; exit 3; fi
  sleep 2
done
echo "iteration limit reached; not complete"; exit 1
