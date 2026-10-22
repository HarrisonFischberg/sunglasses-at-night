#!/bin/bash
# Archive the Release build for macOS and iOS and upload both to App Store
# Connect for TestFlight. Run on the owner's Mac, with Xcode signed in to the
# Apple ID of the team (Xcode ▸ Settings ▸ Accounts) and the App Store Connect
# app record for app.rarecreatures.sunglassesatnight already created (one
# record covers both platforms). Uploads go to Apple: owner's approval only.
# Usage: scripts/archive-testflight.sh [--no-upload]
# Build number: SAN_BUILD_NUMBER, default a UTC timestamp, so every upload is
# higher. Version: MARKETING_VERSION in the project. SAN_PLATFORMS="macOS iOS"
# (default both) picks platforms; --no-upload stops after the archive.
# Team: SAN_TEAM (default KTV2G3Z883).
# App Group: like scripts/build-ios.sh and build-mac.sh, the archive leaves
# the App Group entitlement out by default (the team's profiles don't carry
# it; settings still work, they live in Safari's extension store). Once the
# group is registered for both App IDs in the developer account, set
# SAN_APP_GROUP=1 to sign with Config/*.entitlements as they are.
set -euo pipefail
cd "$(dirname "$0")/.."
TEAM="${SAN_TEAM:-KTV2G3Z883}"
BUILD="${SAN_BUILD_NUMBER:-$(date -u +%Y%m%d.%H%M)}"
UPLOAD=1; [ "${1:-}" = "--no-upload" ] && UPLOAD=0
npm run --silent privacy-check
node engine/scripts/site-data.js
node engine/scripts/bundle.js
node engine/scripts/base-css.js
tmp="$(mktemp -d -t san-archive)"
trap 'rm -rf "$tmp"' EXIT
for platform in ${SAN_PLATFORMS:-macOS iOS}; do
  case "$platform" in
    macOS) dest='generic/platform=macOS'
      body='<key>com.apple.security.app-sandbox</key><true/>' ;;
    iOS) dest='generic/platform=iOS'
      body='' ;;
    *) echo "unknown platform $platform" >&2; exit 1 ;;
  esac
  ent=()
  if [ "${SAN_APP_GROUP:-0}" != 1 ]; then
    # App and extension carry the same entitlements on each platform.
    printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' \
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
      "<plist version=\"1.0\"><dict>$body</dict></plist>" > "$tmp/$platform.entitlements"
    ent=(CODE_SIGN_ENTITLEMENTS="$tmp/$platform.entitlements")
  fi
  archive="build/archives/SunglassesAtNight-$platform-$BUILD.xcarchive"
  echo "archiving $platform build $BUILD"
  xcodebuild -project SunglassesAtNight.xcodeproj -scheme "Sunglasses at Night ($platform)" \
    -configuration Release -destination "$dest" -archivePath "$archive" \
    -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
    CODE_SIGN_IDENTITY="Apple Development" ${ent[@]+"${ent[@]}"} \
    CURRENT_PROJECT_VERSION="$BUILD" archive > "$tmp/archive.log" 2>&1 || {
    grep -E ' error:' "$tmp/archive.log" >&2 || tail -n 30 "$tmp/archive.log" >&2
    echo "$platform archive failed. If the error names the App Group, run with SAN_APP_GROUP=0." >&2
    exit 1
  }
  echo "archived: $archive"
  if [ "$UPLOAD" = 1 ]; then
    echo "uploading $platform build $BUILD"
    xcodebuild -exportArchive -archivePath "$archive" -exportPath "build/archives/export-$platform-$BUILD" \
      -exportOptionsPlist scripts/ExportOptions-testflight.plist -allowProvisioningUpdates \
      > "$tmp/export.log" 2>&1 || {
      grep -E ' error:|Error' "$tmp/export.log" >&2 || tail -n 30 "$tmp/export.log" >&2
      echo "$platform upload failed." >&2
      exit 1
    }
    echo "uploaded: $platform build $BUILD"
  fi
done
echo "Done: build $BUILD. App Store Connect ▸ TestFlight shows it after Apple's processing (usually 5–30 minutes)."
