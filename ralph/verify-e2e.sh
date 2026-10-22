#!/bin/bash
# Run by ralph.sh outside the Claude sandbox (owner approved 2026-10-18).
# Runs the WebKit e2e suite (loopback-only servers) and writes
# ralph/evidence/e2e-latest.md for the next iteration to read.
cd "$(dirname "$0")/.."
[ -d e2e ] || exit 0
log=ralph/evidence/e2e-latest.log
out=ralph/evidence/e2e-latest.md
# Hard time cap so a hung browser can't stall the loop.
( npm run e2e > "$log" 2>&1 ) & pid=$!
( sleep 900; kill -TERM $pid 2>/dev/null ) & killer=$!
wait $pid; rc=$?; kill $killer 2>/dev/null
{
  echo "# Runner e2e ($(date -u +%Y-%m-%dT%H:%M:%SZ), HEAD $(git rev-parse --short HEAD)): exit $rc"
  echo "Full log: $log"
  echo
  grep -E "^ℹ (tests|pass|fail)|^✖ |^✔ " "$log" | sort -u | head -40
  echo
  echo "## First failure details"
  grep -m1 -A25 "^not ok\|failing tests" "$log" | head -40
} > "$out"
echo "e2e verify → $out"
