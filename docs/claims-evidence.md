# Claims and evidence

Every material claim (UI, landing page, store listing, metadata, email) needs
a row before launch.

| Claim | Where it appears | Evidence | Verified by | Status |
| --- | --- | --- | --- | --- |
| "Free, no in-app purchases" | listing, About | no StoreKit code; App Store price tier | T019 grep | PENDING |
| "Doesn't collect data" / App Privacy "Data Not Collected" | listing, privacy policy | no network APIs in bundle; manifest permissions; mailto is user-sent | T019 test + legal review of label answer (voluntary email may count as "collected" for the label) | PENDING, NEEDS REVIEW |
| "Keeps text readable (WCAG AA 4.5:1 contrast on darkened pages)" | listing, onboarding | T012 fixture contrast measurements | T012 | PENDING, do not use until measured, scope it to "on our test pages" |
| "No white flash" | listing | T012 first-paint fixture check | T012 | PENDING |
| "Works on iPhone, iPad and Mac" | listing | builds + manual runs on each | T002, T016 | PENDING |
