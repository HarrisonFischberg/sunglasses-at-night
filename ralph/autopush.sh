#!/bin/bash
# Pushes build/v1 to origin whenever its HEAD changes (owner approved 2026-10-18).
# Runs beside ralph.sh; the loop itself still cannot push. Only pushes build/v1.
cd "$(dirname "$0")/.."
last=""
while true; do
  head=$(git rev-parse build/v1 2>/dev/null)
  if [ -n "$head" ] && [ "$head" != "$last" ]; then
    for d in 2 4 8 16; do git push -q origin build/v1 2>/dev/null && { echo "$(date '+%H:%M:%S') pushed $(git log -1 --format='%h %s' build/v1)"; last=$head; break; }; sleep $d; done
  fi
  pgrep -f "ralph/ralph.sh" >/dev/null || [ -n "${KEEP:-}" ] || { echo "ralph not running; autopush exiting"; exit 0; }
  sleep 30
done
