# Releasing Sunglasses at Night

One command, dry run by default:

```sh
./release.sh [ios|chrome|firefox|all]          # dry run: build and check, publish nothing
./release.sh [ios|chrome|firefox|all] --live   # publish
```

| Target | Store | Dry run | `--live` |
| --- | --- | --- | --- |
| `ios` | App Store (iPhone, iPad and Mac: one App Store Connect record) | archives both apps, lists what would be submitted | archives, uploads to TestFlight, commits the bumped `BUILD_NUMBER`, waits for processing, uploads listing, age rating and screenshots, submits both platforms for review (released automatically once approved) |
| `chrome` | Chrome Web Store | builds `dist/sunglasses-at-night-chrome-<version>.zip` | uploads and publishes it |
| `firefox` | Firefox Add-ons (AMO) | builds `dist/firefox`, runs `web-ext lint` | submits it as a listed add-on for review, with the listing in `store/firefox/amo-metadata.json` |
| `all` | all three | | |

Quit Safari before `./release.sh ios`: archiving registers a new copy of the
extension, and Safari has crashed reloading it while open.

There is no Android app in this repo, so there is no Android target. `ios`
needs a Mac with Xcode; the other targets run anywhere with Node.

TestFlight only: `bundle exec fastlane ios beta` (see `fastlane/README.md`).

## Store files

Everything a listing needs lives in `store/`, one folder per store:

- `store/ios/metadata/`: name, subtitle, description, keywords, promotional
  text, URLs, copyright, categories, App Review contact (name, phone, email;
  seen only by Apple's reviewers, not shown on the App Store) and review notes
  (fastlane `deliver` layout).
- `store/ios/age-rating.json`: age rating answers (all "None"/"No", 4+).
- `store/ios/screenshots/en-US/`: iPhone 6.9" (1320 × 2868), iPhone 6.3"
  (1206 × 2622) and iPad 13" (2064 × 2752). `store/ios/screenshots-mac/en-US/`:
  Mac (2880 × 1800). Re-render all 20 with `node store/ios/shots/render.mjs`;
  the captions are at the top of that file and the demo pages sit next to it.
- `store/chrome/listing.md` and `screenshots/` (1280 × 800): pasted by hand
  once; the Chrome Web Store API can't set listing text.
- `store/firefox/amo-metadata.json` (summary, description, categories, license,
  release notes, reviewer notes) and `screenshots/` (uploaded by hand).

Release notes: Firefox reads `version.release_notes` in `amo-metadata.json`.
For the App Store, add `store/ios/metadata/en-US/release_notes.txt` from the
second version on (Apple rejects "What's New" on a first version). Chrome has
no release-notes field.

## Environment variables

Keep them in your shell profile or a password manager, never in git. `.gitignore`
already ignores `.env*` and `*.p8`.

| Variable | Used by | What it is |
| --- | --- | --- |
| `ASC_KEY_ID` | ios | App Store Connect API key ID |
| `ASC_ISSUER_ID` | ios | App Store Connect issuer ID |
| `ASC_KEY_PATH` | ios | absolute path to the `AuthKey_<id>.p8` file, kept outside the repo |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` | chrome | Google OAuth client and refresh token for the Chrome Web Store API |
| `CWS_PUBLISHER_ID` | chrome | your Chrome Web Store publisher ID (the API's v2 needs it) |
| `CWS_EXTENSION_ID` | chrome | the item ID, shown after the first manual upload |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | firefox | addons.mozilla.org API key and secret |

## One-time setup

- [ ] `bundle install` (Ruby with Bundler; installs fastlane from `Gemfile.lock`).
- [ ] App Store Connect ▸ Users and Access ▸ Integrations ▸ App Store Connect API:
      create a key with **App Manager** access, download the `.p8` once, set
      the three `ASC_` variables.
- [ ] Register the App Group for both App IDs if you want it signed in
      (`SAN_APP_GROUP=1`, see `scripts/archive-testflight.sh`).
- [ ] Chrome: pay the one-time $5 developer fee, verify the contact email,
      create the item by uploading `dist/sunglasses-at-night-chrome-<version>.zip`
      in the Developer Dashboard, fill in the Store listing and Privacy tabs
      from `store/chrome/listing.md`, then set `CWS_EXTENSION_ID` and
      `CWS_PUBLISHER_ID`. Create OAuth credentials for the API
      (guide: github.com/fregante/chrome-webstore-upload-keys).
- [ ] Firefox: create an addons.mozilla.org account and an API key
      (Developer Hub ▸ Tools ▸ Manage API Keys). The first `--live` run creates
      the listing; upload `store/firefox/screenshots/` on the listing page.
- [ ] Host the privacy policy and support pages (drafts: `docs/site/`) at the
      URLs in `store/ios/metadata/en-US/` before the first submission. Every
      store checks them.

## Steps that can't be automated

- **Apple Developer Program** ($99/year) and the **Free Apps agreement**
  (App Store Connect ▸ Business): accept any updated agreements, or uploads and
  submissions fail.
- **EU trader status** (App Store Connect ▸ Business): declare it, or the app
  can't be offered in the EU. Apple's verification can take weeks: start early.
  If you are a trader, your address, phone and email are shown on the EU
  product page.
- **App Privacy answers** (App Store Connect ▸ App Privacy): choose "No, we do
  not collect data from this app", then Publish. The App Store Connect API
  can't set this. Done once (2026-10-30).
- **Pricing and Availability**: set the price to Free and Country or Region
  Availability to all countries before the first release. They are saved
  separately: if availability is never saved, a released app shows "Removed from
  App Store". (Price set 2026-10-30, availability 2026-11-08.)
- **Age rating**: the answers are uploaded from `store/ios/age-rating.json`;
  check the result reads 4+ the first time.
- **Content rights and export compliance** are answered by the lane: no
  third-party content, no non-exempt encryption (also set in the app's
  Info.plist as `ITSAppUsesNonExemptEncryption = NO`).
- **Release after approval**: the lane submits with automatic release, so each
  version goes live as soon as Apple approves it (1.1 was released by hand).
- **Chrome Web Store Privacy tab** (single purpose, permission reasons, data
  use certification): filled once by hand from `store/chrome/listing.md`.
- **Firefox data collection**: declared in the manifest
  (`data_collection_permissions: none`), nothing to fill in.
- **Google Play Data safety**: not needed (no Android app).

## Already checked

- Privacy manifest `App/PrivacyInfo.xcprivacy` ships in the app and the
  extension. The only required-reason API in the code is `UserDefaults`
  (app-only `CA92.1`, App Group `1C8F.1`); no file timestamp, boot time, disk
  space or keyboard APIs are used.
- Export compliance: `ITSAppUsesNonExemptEncryption = NO` in every app build
  configuration (iOS and macOS, Debug and Release).

## Before the first Chrome or Firefox release

The popup and options page still mention Safari in two places ("allow … in
Safari", reset "in Safari and in the app"). Fix those first.
