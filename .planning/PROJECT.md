# Upwork Chrome Extension

## What This Is

A Chrome extension (Manifest V3, JavaScript) that enhances the Upwork browsing experience by scraping job data on-demand and on schedule, pushing results to n8n webhooks or saving as CSV, and overlaying color-coded status icons on search results to show which jobs match, don't match, or have been applied to — all based on real-time n8n webhook responses.

## Core Value

Instantly see which Upwork jobs match your criteria and have proposal-ready workflows — without leaving the Upwork page.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Scrape job data from Upwork search results and detail pages (same fields as reference project)
- [ ] On-demand scraping via extension popup/button
- [ ] Scheduled scraping via background service worker
- [ ] Push scraped job data to configurable n8n webhook
- [ ] Save scraped data as CSV to downloads folder
- [ ] Inject color-coded icons on search results (green=match, red=no match, blue=applied) based on n8n webhook response
- [ ] On job detail page: button to scrape current job and push to webhook or save CSV
- [ ] On job detail page: load AI-generated proposal from n8n webhook
- [ ] Paste loaded proposal into Upwork's apply description field
- [ ] Copy loaded proposal to clipboard as fallback
- [ ] Windows notifications summarizing actions performed

### Out of Scope

- Python-based scraping (this is a pure JS Chrome extension) — reference project handles that
- Cloudflare bypass logic (extension reads pages already loaded in browser, no anti-bot needed)
- GUI desktop app (extension popup is the UI)
- Database/SQLite storage (extension uses chrome.storage + webhooks)

## Context

- **Reference project:** `C:\Users\Glorvax\Documents\upwork job scrapper` — Python desktop scraper with PyQt6 GUI, Patchright browser automation, SQLite, webhook push to n8n. Extracts: job ID, title, URL, description, budget, skills, experience level, duration, posted date, proposals count, client info (payment verified, location, rating, total spent).
- **Webhook system:** n8n automation platform receives job data, returns match status for icons, and generates proposals on request.
- **Key advantage over reference project:** Extension reads the already-loaded Upwork page (user is logged in, no Cloudflare bypass needed). DOM scraping is simpler and more reliable.
- **Data fields to extract:** Job ID, title, URL, description, budget/payment type, skills, experience level, project duration, posted date, proposals count, client info (payment verified, location, rating, total spent).

## Constraints

- **Platform:** Chrome Extension, Manifest V3, JavaScript (no TypeScript)
- **Browser API:** Must use service workers (MV3), not background pages (MV2)
- **Storage:** chrome.storage.local for settings, no SQLite
- **Permissions:** Needs activeTab, storage, notifications, downloads, host permissions for Upwork domains
- **Content Scripts:** Must inject into upwork.com pages for DOM reading and icon overlay
- **Webhook dependency:** n8n must be running for match status icons and proposal loading

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| JavaScript over TypeScript | User preference, simpler build pipeline for extension | — Pending |
| Manifest V3 over V2 | MV2 deprecated, Chrome Web Store requires V3 | — Pending |
| Service worker for scheduling | MV3 requirement, chrome.alarms for periodic tasks | — Pending |
| n8n for backend logic | User's existing automation platform, handles matching + proposal generation | — Pending |
| DOM scraping (not API) | Extension reads pages user already has open, no anti-bot needed | — Pending |
| CSV to downloads folder | Simple, user-accessible, no complex storage needed | — Pending |

---
*Last updated: 2026-02-17 after initialization*
