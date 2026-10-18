#!/bin/bash
# Run by ralph.sh (outside any Claude sandbox) after each iteration.
# Writes ralph/evidence/swift-build-latest.md for the next iteration to read.
cd "$(dirname "$0")/.."
out=ralph/evidence/swift-build-latest.md
{
  echo "# Runner Swift build ($(date -u +%Y-%m-%dT%H:%M:%SZ), HEAD $(git rev-parse --short HEAD), dirty files: $(git status --porcelain | wc -l | tr -d ' '))"
  # Schemes are discovered so a product rename (T027) can't break the runner.
  MAC_SCHEME=$(xcodebuild -list 2>/dev/null | sed -n '/Schemes:/,$p' | grep -E '\(macOS\)$' | head -1 | sed 's/^ *//')
  IOS_SCHEME=$(xcodebuild -list 2>/dev/null | sed -n '/Schemes:/,$p' | grep -E '\(iOS\)$' | head -1 | sed 's/^ *//')
  for spec in "$MAC_SCHEME|platform=macOS" "$IOS_SCHEME|generic/platform=iOS Simulator"; do
    scheme="${spec%%|*}"; dest="${spec#*|}"
    log="ralph/evidence/build-$(echo "$scheme" | tr -cd 'A-Za-z').log"
    xcodebuild -scheme "$scheme" -destination "$dest" -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build > "$log" 2>&1
    rc=$?
    echo; echo "## $scheme: exit $rc ($log)"
    grep -E "error:|BUILD (SUCCEEDED|FAILED)" "$log" | sort -u | head -40
  done
  if xcodebuild -list 2>/dev/null | grep -q Tests; then
    log=ralph/evidence/test-macOS.log
    xcodebuild test -scheme "$MAC_SCHEME" -destination 'platform=macOS' -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO > "$log" 2>&1
    echo; echo "## Swift tests (macOS): exit $? ($log)"
    grep -E "error:|Test Suite .* (passed|failed)|Executed|TEST (SUCCEEDED|FAILED)" "$log" | tail -20
  fi
  # Launch smoke test (added 2026-10-18 after a launch crash the unit tests missed):
  # start the built macOS app, require it to still be running after 6 s and
  # no new crash report for it.
  APP=$(ls -d build/DerivedData/Build/Products/Debug/*.app 2>/dev/null | head -1)
  if [ -n "$APP" ]; then
    name=$(basename "$APP" .app)
    before=$(ls ~/Library/Logs/DiagnosticReports 2>/dev/null | grep -c "$name")
    "$APP/Contents/MacOS/$name" > ralph/evidence/launch-smoke.log 2>&1 & pid=$!
    sleep 6
    if kill -0 $pid 2>/dev/null; then alive=yes; kill $pid 2>/dev/null; wait $pid 2>/dev/null; else alive=no; fi
    after=$(ls ~/Library/Logs/DiagnosticReports 2>/dev/null | grep -c "$name")
    echo
    if [ "$alive" = yes ] && [ "$after" -le "$before" ]; then
      echo "## Launch smoke (macOS): PASS (running after 6 s, no new crash report)"
    else
      echo "## Launch smoke (macOS): FAIL (alive=$alive, crash reports $before -> $after; newest: $(ls -t ~/Library/Logs/DiagnosticReports | grep "$name" | head -1))"
    fi
  fi
} > "$out"
# Keep the loop's unsigned builds out of LaunchServices so Safari only sees the owner's signed test copy (build/Manual).
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
for a in build/DerivedData/Build/Products/*/*.app; do [ -d "$a" ] && "$LSR" -u "$PWD/$a" 2>/dev/null; done
echo "swift verify → $out"
