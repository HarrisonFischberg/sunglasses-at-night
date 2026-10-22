#!/bin/bash
# Build Sunglasses at Night for this Mac and hand it to Safari.
# Usage: scripts/build-mac.sh
# Regenerates the extension bundles from engine/src, builds the macOS app,
# signs it with your "Apple Development" certificate (no provisioning profile,
# App Group sync with the app is off in this build), registers it as the only
# copy with macOS and opens it. Afterwards: Safari ▸ Settings ▸ Extensions →
# untick and re-tick "Sunglasses at Night".
set -euo pipefail
cd "$(dirname "$0")/.."
D=build/Manual
ID=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)
[ -n "$ID" ] || { echo "No 'Apple Development' signing certificate in your keychain." >&2; exit 1; }
ENT=$(mktemp -t san-entitlements).plist
cat > "$ENT" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.app-sandbox</key><true/></dict></plist>
PLIST
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
node engine/scripts/site-data.js
node engine/scripts/bundle.js
pkill -f "$D/Build/Products/Debug/Sunglasses at Night.app" || true
xcodebuild -scheme "Sunglasses at Night (macOS)" -destination 'platform=macOS,arch=arm64' \
  -derivedDataPath "$D" CODE_SIGNING_ALLOWED=NO build -quiet
APP="$D/Build/Products/Debug/Sunglasses at Night.app"
codesign --force --timestamp=none -s "$ID" --entitlements "$ENT" "$APP/Contents/PlugIns/Sunglasses at Night Extension.appex"
codesign --force --timestamp=none -s "$ID" --entitlements "$ENT" "$APP"
shopt -s nullglob
for a in build/DerivedData/Build/Products/*/*.app build/Signed/Build/Products/*/*.app; do "$LSR" -u "$PWD/$a" 2>/dev/null || true; done
"$LSR" -f -R "$PWD/$APP"
open "$APP"
echo "Built and opened: $APP (signed with $ID)."
echo "Now: Safari ▸ Settings ▸ Extensions → untick and re-tick \"Sunglasses at Night\"."
