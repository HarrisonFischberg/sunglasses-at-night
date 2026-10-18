# Launch blockers

| # | Blocker | Type (missing fact / failed check / legal review / approval) | Owner | Needed for | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | Legal entity / trading name that publishes on the App Store (seller name) | missing fact | Harold | safeguard 16, privacy policy, listing | OPEN |
| B2 | Business location (country/state) for policy "who we are" | missing fact | Harold | 1, 16 | OPEN |
| B3 | "Youngest age allowed": interpreted as App Store 4+ rating with no data collection, NOT the Kids Category (Kids Category adds Apple review rules). Confirm | approval + legal review | Harold + counsel | 17 | OPEN |
| B4 | Children's privacy review for global launch (COPPA, GDPR Art. 8, UK AADC, etc.) given 4+ and the mailto report flow | legal review | counsel | 17, 1 | OPEN |
| B5 | Public URL to host the privacy policy and support page (App Store requires one). Hosting = deployment | approval | Harold | 1, listing | OPEN |
| B6 | Retention policy for report emails at hello@rarecreatures.app and the email provider used | missing fact | Harold | 1, data inventory | OPEN |
| B7 | Apple Developer Program team / signing identity for archive + TestFlight | approval (account) | Harold | release | OPEN |
| B8 | Privacy policy + terms drafts need qualified legal review before publishing | legal review | counsel | 1, 2 | OPEN (drafts not written yet) |
| B9 | Trademark / name clearance for "Sunglasses at Night" (also a well-known song title) | legal review | Harold + counsel | brand, listing | OPEN |
| B10 | REA web capture blocked (no CDP browser) | tool | Harold (approve Chromium install) or accept | discovery evidence | OPEN, non-blocking for build |
| B11 | Caveman skill not installed | tool | Harold (approve install) | comms rule | OPEN, non-blocking |
| B12 | Playwright (WebKit) dev dependency for e2e fixtures not approved | approval | Harold | T012 evidence for safeguards 14 + contrast claim | OPEN |

## Unknown business and legal inputs

Never infer these from a reference app. Never invent them.

- Legal entity and trading name: UNKNOWN (B1). The contact domain rarecreatures.app is not proof of the entity.
- Business location: UNKNOWN (B2)
- Launch countries/states: **all App Store storefronts (owner: "global")**
- Public business contact: **hello@rarecreatures.app (owner)**
- Privacy contact: **hello@rarecreatures.app (owner)**
- Minimum user age / children may use: **owner: "youngest age allowed"** → planned 4+, children may use; needs B3/B4
- Pricing, billing, trials, renewal: **free, no in-app purchases (owner)**
- Refund and cancellation terms: NOT APPLICABLE (free, no purchases)
- Data types and sensitive data: see `docs/data-inventory.md` (planned: settings + hostnames, on device)
- Vendors, SDKs, analytics, AI providers, processors: **none planned**
- Retention or deletion exceptions: UNKNOWN for report emails (B6)
