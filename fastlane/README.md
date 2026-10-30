# fastlane

Lanes for the iPhone, iPad and Mac apps. Normally run through `./release.sh ios`
(see [release/README.md](../release/README.md) for env vars and setup).

| Lane | Command | Does |
| --- | --- | --- |
| beta | `bundle exec fastlane ios beta` | archive iOS + macOS, upload to TestFlight, commit the bumped `BUILD_NUMBER` |
| release | `bundle exec fastlane ios release` | beta, then upload listing, age rating and screenshots from `store/ios/` and submit both platforms for review |

Add `dry_run:true` to archive only, without uploading anything.
