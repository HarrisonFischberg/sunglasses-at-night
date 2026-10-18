# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

The product is a Safari Web Extension with two kinds of surface: native
SwiftUI container apps on iOS/iPadOS 16+ and macOS 13+, which follow each
OS's conventions, and the extension's toolbar popup and options page, which
are HTML rendered inside Safari on each platform.

## Users

Everyone who browses in Safari and wants every website dark (owner,
2026-10-18). The situations that matter most are **reading at night** and
**landing on bright white pages**: someone in bed or in a dim room opens a
link and gets hit by a white page. Secondary: people who just prefer dark
mode everywhere, including on sites that don't offer one.

## Product Purpose

Make every website in Safari comfortable in the dark, automatically, without
breaking the page or making text hard to read. Success means the user turns
it on once and stops noticing it: pages arrive dark, text stays readable,
sites keep working, and Safari stays fast.

## Positioning

Owner-confirmed differentiators against Noir, Dark Reader and Midnight:
- **Free on every device** (iPhone, iPad, Mac), with no in-app purchases.
- **Nothing ever leaves the device:** no analytics, no account, no servers.
- **Text always stays readable:** rewritten colors meet at least 4.5:1 contrast.
- **Per-site look** (brightness, contrast, sepia, grayscale) **and a schedule.**
- **Fast on heavy sites** like Amazon product grids.

## Operating Context

Used inside Safari: the toolbar popup is the main control surface, opened
mid-browsing, often at night in a dim room, often on a phone held one-handed.
The container app is opened rarely: first-run setup (enabling the extension in
Safari Settings), reviewing per-site rules, schedule, privacy information,
Reset all. The Mac keyboard shortcut (Option+Shift+N) toggles it on and off.

## Capabilities and Constraints

- Activation modes: follow system appearance (default), always, schedule (fixed times, may cross midnight), off.
- Per-site rule: default, always dark, never dark, with optional per-site look and engine (dynamic or filter fallback).
- Image handling: leave, dim, don't invert. Option to hide background images. Leaves already-dark sites alone.
- Report a problem: a user-sent `mailto:` draft to hello@rarecreatures.app with the hostname only. Never automatic.
- No network code beyond re-fetching stylesheets a page already loaded. No new permissions without review.
- Undecided: publishing legal entity (B1), policy hosting (B5), App Store age rating confirmation (planned 4+, B3).

## Brand Commitments

- Name: **Sunglasses at Night**. Never "Dark Eyes" or any reference app's name or look.
- Voice: **witty.** The joke is the name itself: you put on sunglasses at night because the web keeps throwing white pages at you. Wit lives in small moments (empty states, first run, the popup's status line), never in controls, consent, privacy, or error copy, which stay plain.
- Avoid the reference apps' moon-on-purple look (REA R15).

## Evidence on Hand

- Real measurements: WebKit e2e and perf evidence in `ralph/evidence/` (contrast, first paint, product-grid timings). Owner Safari checks in `activity.md`.
- No reviews, testimonials, ratings, user counts or press exist. Never invent them.
- No app icon or brand assets exist yet (T017 creates an original one).

## Product Principles

1. **Invisible when it works.** Pages arrive dark and nothing else changes. Controls are for exceptions.
2. **Readability over fidelity.** Keep the site's character, but readable text wins every conflict.
3. **Never break the page.** Clicks, forms, images and media behave exactly as authored.
4. **Private by construction.** If a feature needs data to leave the device, it doesn't ship.
5. **Wit in the margins, clarity in the controls.**

## Accessibility & Inclusion

WCAG 2.2 AA for every surface (popup, options, app), including focus
visibility and keyboard operation in Safari (Option+Tab behavior), VoiceOver,
Dynamic Type, Reduce Motion. The engine's output on websites also targets
≥4.5:1 text contrast. App Store audience: all ages (planned 4+).
