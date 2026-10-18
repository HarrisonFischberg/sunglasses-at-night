#!/bin/bash
# Run by ralph.sh (outside any Claude sandbox) after each iteration.
# Writes ralph/evidence/swift-build-latest.md for the next iteration to read.
cd "$(dirname "$0")/.."
out=ralph/evidence/swift-build-latest.md
{
  echo "# Runner Swift build ($(date -u +%Y-%m-%dT%H:%M:%SZ), HEAD $(git rev-parse --short HEAD), dirty files: $(git status --porcelain | wc -l | tr -d ' '))"
  for spec in "Sunglasses at Night (macOS)|platform=macOS" "Sunglasses at Night (iOS)|generic/platform=iOS Simulator"; do
    scheme="${spec%%|*}"; dest="${spec#*|}"
    log="ralph/evidence/build-$(echo "$scheme" | tr -cd 'A-Za-z').log"
    xcodebuild -scheme "$scheme" -destination "$dest" -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build > "$log" 2>&1
    rc=$?
    echo; echo "## $scheme: exit $rc ($log)"
    grep -E "error:|BUILD (SUCCEEDED|FAILED)" "$log" | sort -u | head -40
  done
  if xcodebuild -list 2>/dev/null | grep -q Tests; then
    log=ralph/evidence/test-macOS.log
    xcodebuild test -scheme "Sunglasses at Night (macOS)" -destination 'platform=macOS' -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO > "$log" 2>&1
    echo; echo "## Swift tests (macOS): exit $? ($log)"
    grep -E "error:|Test Suite .* (passed|failed)|Executed|TEST (SUCCEEDED|FAILED)" "$log" | tail -20
  fi
} > "$out"
# Keep the loop's unsigned builds out of LaunchServices so Safari only sees the owner's signed test copy (build/Manual).
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
for a in build/DerivedData/Build/Products/*/"Sunglasses at Night.app"; do [ -d "$a" ] && "$LSR" -u "$PWD/$a" 2>/dev/null; done
echo "swift verify → $out"
