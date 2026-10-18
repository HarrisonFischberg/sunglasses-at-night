#!/bin/bash
# Live view of the Ralph loop. Ctrl-C to quit (does not stop the loop).
cd "$(dirname "$0")/.."
while true; do
  clear
  echo "Sunglasses at Night: Ralph loop   $(date '+%H:%M:%S')"
  echo
  echo "Runner:"; tail -n 8 ralph/logs/run1b.out 2>/dev/null | sed 's/^/  /'
  echo
  echo "Tasks:"; grep -E '^\| T0' prd.md | awk -F'|' '{s=$7; gsub(/^ +| +$/,"",s); printf "  %s  %s\n", $2, substr(s,1,70)}'
  echo
  echo "Recent commits:"; git log --oneline -6 | sed 's/^/  /'
  echo
  echo "Files changing now:"; git status --short | head -8 | sed 's/^/  /'
  sleep 10
done
