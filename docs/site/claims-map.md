# T018 cross-check: every data statement → data-inventory row

Inventory rows (`docs/data-inventory.md`): R1 settings · R2 per-site rules · R3 settings mirror + reset generation · R4 page content/URL in memory · R5 cross-origin stylesheet re-fetch · R6 diagnostic report. "Not collected" = section "Not collected". "Vendors" = section "Vendors / processors".

| # | Statement (file) | Maps to | Match |
| --- | --- | --- | --- |
| 1 | No account, analytics, ads, crash reporting, tracking; no location, cookies, remote config, iCloud sync, advertising ID, purchases (privacy, in-app, terms) | Not collected; PRD "Free, no IAP" | exact |
| 2 | Never sends pages, addresses or settings to us or anyone else (privacy) | Header principle; R4 "never transmitted"; R5 sends only a stylesheet URL to its own server (disclosed separately, statement 8) | exact |
| 3 | Settings (mode, schedule, sliders, image options) stored in Safari extension storage and shared app storage; kept until changed/reset/uninstall; Reset all erases (privacy) | R1 | exact |
| 4 | Per-site hostname + choice (+ own look) stored on device; delete in Sites, Reset all, or uninstall (privacy, support) | R2 | exact |
| 5 | Extension keeps a copy of settings incl. hostnames in storage shared with the app; stays on device; replaced on change, removed on reset/uninstall (privacy) | R3 | exact |
| 6 | Extension runs on all websites; reads page styles and address in memory only; nothing stored except a hostname when a rule is created; nothing sent (privacy, in-app) | R4; "Not collected" para (host access disclosed) | exact |
| 7 | User can restrict extension to chosen sites in Safari settings (privacy) | Apple platform feature, not our data flow; no inventory row needed | n/a |
| 8 | Cross-origin sheets re-requested from the same address the page used; goes to the site's own server, not us/third party; no cookies, no referrer; usually from cache; only the stylesheet address sent; text held in memory, not saved by us (privacy) | R5 | exact |
| 9 | Report a problem opens a draft in the user's Mail app to support@rarecreatures.app with hostname, app version, OS version, settings; nothing sent unless user presses Send (privacy, support, in-app, terms) | R6; PRD F9 | exact |
| 10 | We receive the sender's email address and draft contents only if sent; used only to investigate and reply (privacy) | R6 "owner's mailbox"; Vendors (email provider receives voluntary emails) | exact |
| 11 | Report email retention "[pending]"; deletion on request by email (privacy) | R6 retention UNKNOWN (B6), deletion mechanism | placeholder, not invented |
| 12 | No third-party services; Apple provides Safari/App Store; email service receives only emails users send (privacy) | Vendors | exact |
| 13 | Children: no personal information collected (privacy) | Not collected + R1–R6; legal wording pending B3/B4 | placeholder for legal part |
| 14 | Delete single sites, Reset all, uninstall removes everything; nothing on any server (support) | R1, R2, R3 deletion column; "Not collected" | exact |
| 15 | Contact hello@rarecreatures.app (all files) | prd.md Intake; launch-blockers "Unknown inputs" | exact |
| 16 | Publisher name, location, dates, liability, governing law, rights by jurisdiction | no inventory row: B1, B2, B8 placeholders, not invented | placeholder |

Statements with no data content (setup steps, "page may look wrong", try Never dark / other engine) describe features F2, F3, F9, F10 in prd.md and make no data claim.

Result: 0 data statements without an inventory row or a named blocker placeholder.
