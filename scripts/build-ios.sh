#!/bin/bash
# Build Sunglasses at Night and install it on a connected iPhone or iPad.
# Usage: scripts/build-ios.sh
# Regenerates the extension bundles from engine/src, builds the iOS app with
# Xcode automatic signing and your "Apple Development" certificate (the
# project's default identity is ad-hoc "-", which a device build can't use) (-allowProvisioningUpdates fetches or renews the
# development profile) and installs it. Does not launch the app.
# Like scripts/build-mac.sh, this build leaves out the App Group entitlement:
# the development profiles don't carry it, so App Group sync with the app is
# off in this build. Settings still work; they live in Safari's extension store.
# Team: SAN_TEAM (default KTV2G3Z883). Device: SAN_IOS_DEVICE (UDID or name),
# else the first paired physical iOS device, preferring one already connected.
# Afterwards: Settings ▸ Apps ▸ Safari ▸ Extensions → Sunglasses at Night on,
# allowed on all websites.
set -euo pipefail
cd "$(dirname "$0")/.."
D=build/iOS
TEAM="${SAN_TEAM:-KTV2G3Z883}"
ENT=$(mktemp -t san-ios-entitlements).plist
cat > "$ENT" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict/></plist>
PLIST
node engine/scripts/site-data.js
node engine/scripts/bundle.js
DEVICE="${SAN_IOS_DEVICE:-}"
if [ -z "$DEVICE" ]; then
  json="$(mktemp)"
  xcrun devicectl list devices --json-output "$json" >/dev/null
  DEVICE="$(node -e '
    const out = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const ds = out.result.devices.filter(d =>
      d.hardwareProperties?.reality === "physical" &&
      d.hardwareProperties?.platform === "iOS" &&
      d.connectionProperties?.pairingState === "paired");
    const d = ds.find(x => x.connectionProperties.tunnelState === "connected") ?? ds[0];
    if (d) console.log(d.hardwareProperties.udid);
  ' "$json")"
  rm -f "$json"
fi
[ -n "$DEVICE" ] || { echo "No paired iPhone or iPad found. Connect it, unlock it, and try again." >&2; exit 1; }
echo "device: $DEVICE"
xcodebuild -scheme "Sunglasses at Night (iOS)" -destination "id=$DEVICE" -derivedDataPath "$D" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY="Apple Development" \
  CODE_SIGN_ENTITLEMENTS="$ENT" build -quiet
APP="$D/Build/Products/Debug-iphoneos/Sunglasses at Night.app"
xcrun devicectl device install app --device "$DEVICE" "$APP"
echo "Installed: $APP (team $TEAM, no App Group)."
echo "Now: Settings ▸ Apps ▸ Safari ▸ Extensions → turn on Sunglasses at Night and allow it on all websites."
