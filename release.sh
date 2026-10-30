#!/bin/bash
# One-command release for Sunglasses at Night. Dry run unless --live.
# Usage: ./release.sh [ios|chrome|firefox|all] [--live]
# ios covers the iPhone, iPad and Mac apps (one App Store Connect record) and
# needs a Mac with Xcode. No Android app exists in this repo.
# Env vars, one-time setup and manual steps: release/README.md.
set -euo pipefail
cd "$(dirname "$0")"
target=all live=0
for a in "$@"; do
  case "$a" in
    --live) live=1 ;;
    ios|chrome|firefox|all) target=$a ;;
    android) echo "This repo has no Android app." >&2; exit 1 ;;
    *) echo "usage: ./release.sh [ios|chrome|firefox|all] [--live]" >&2; exit 1 ;;
  esac
done
need() { for v; do [ -n "${!v:-}" ] || { echo "missing env var $v (see release/README.md)" >&2; exit 1; }; done; }
version=$(node -p "require('./Extension/Resources/manifest.json').version")

ios() {
  if [ "$(uname)" != Darwin ]; then
    [ "$target" = ios ] && { echo "ios needs a Mac with Xcode" >&2; exit 1; }
    echo "ios: skipped (needs a Mac with Xcode)"; return
  fi
  if [ $live = 1 ]; then
    need ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH
    bundle exec fastlane ios release
  else
    bundle exec fastlane ios release dry_run:true
  fi
}

chrome() {
  local zip=dist/sunglasses-at-night-chrome-$version.zip
  if [ $live = 1 ]; then
    need CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_PUBLISHER_ID CWS_EXTENSION_ID
    CLIENT_ID=$CWS_CLIENT_ID CLIENT_SECRET=$CWS_CLIENT_SECRET REFRESH_TOKEN=$CWS_REFRESH_TOKEN \
      PUBLISHER_ID=$CWS_PUBLISHER_ID npx -y chrome-webstore-upload-cli@4.0.2 \
      --source "$zip" --extension-id "$CWS_EXTENSION_ID"
  else
    echo "chrome: dry run, would upload and publish $zip"
  fi
}

firefox() {
  if [ $live = 1 ]; then
    need AMO_JWT_ISSUER AMO_JWT_SECRET
    npx -y web-ext@10.7.0 sign --source-dir dist/firefox --artifacts-dir dist/amo --channel listed \
      --amo-metadata store/firefox/amo-metadata.json --approval-timeout 0 \
      --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
  else
    npx -y web-ext@10.7.0 lint --source-dir dist/firefox
    echo "firefox: dry run, would submit dist/firefox ($version) to addons.mozilla.org for review"
  fi
}

[ "$target" = ios ] || npm run --silent package:web
case "$target" in
  all) ios; chrome; firefox ;;
  *) "$target" ;;
esac
