---
phase: 02-scraping-engine
plan: "04"
subsystem: ui
tags: [chrome-extension, popup, content-script, message-passing, scraping]

# Dependency graph
requires:
  - phase: 02-scraping-engine
    provides: scrapeSearchPage in search-scraper.js and scrapeDetailPage in detail-scraper.js (both implemented but unreachable)
provides:
  - Popup "Scrape Now" button (#scrape-btn) with inline status feedback (#scrape-status)
  - triggerScrape() in popup.js sending { action: 'scrapeSearch' } via chrome.tabs.sendMessage
  - scrapeDetailPage() wired into content script message handler for { action: 'scrapeDetail' }
  - All four Phase 2 requirements (SCRP-01, SCRP-02, SCRP-03, SCRP-04) satisfied
affects: [03-webhook-integration, 04-search-overlay, 05-csv-export]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - showScrapeStatus() mirrors showStatus() pattern — same 2500ms auto-clear, same class toggle logic, separate DOM target
    - Popup-to-content-script message pattern: chrome.tabs.query then chrome.tabs.sendMessage with safe-fail try/catch
    - Content script message handler extended by adding new if-block before final return false

key-files:
  created: []
  modified:
    - src/popup/popup.html
    - src/popup/popup.js
    - src/content/upwork-content.js

key-decisions:
  - "Scrape Now button placed in <main> as its own setting-group section, not inside <footer> — keeps it visually separate from Save Settings"
  - "showScrapeStatus() is a separate function from showStatus() rather than a shared helper — avoids coupling scrape feedback to settings feedback, each with its own DOM target"
  - "triggerScrape() safe-fail: chrome.tabs.sendMessage errors shown as user-friendly message (not raw Error) — consistent with existing popup error pattern"

patterns-established:
  - "Separate status display functions per action area — showStatus() for settings, showScrapeStatus() for scraping"
  - "Content script message handler: extend with new if-block before return false — maintains PING/scrapeSearch/scrapeDetail ordering"

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 2 Plan 04: Gap Closure — Popup Trigger and Detail Scraper Wiring Summary

**Popup "Scrape Now" button wired to chrome.tabs.sendMessage({ action: 'scrapeSearch' }) and scrapeDetailPage() exposed via content script 'scrapeDetail' message handler — all four Phase 2 scraping requirements now satisfied**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T09:42:18Z
- **Completed:** 2026-02-18T09:44:37Z
- **Tasks:** 2 of 2
- **Files modified:** 3

## Accomplishments

- Added `#scrape-btn` and `#scrape-status` section to popup.html above the footer, using existing `.setting-group` CSS class for consistent styling
- Added `triggerScrape()` to popup.js that queries the active tab and sends `{ action: 'scrapeSearch' }` via `chrome.tabs.sendMessage`, displaying job count or error in `#scrape-status` with 2500ms auto-clear
- Added `import { scrapeDetailPage }` and `scrapeDetail` message handler to `upwork-content.js` — detail scraper is no longer orphaned and is reachable at runtime

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Scrape Now button to popup** - `1e9cfc7` (feat)
2. **Task 2: Wire detail scraper into content script** - `2b3951d` (feat)

## Files Created/Modified

- `src/popup/popup.html` - Added SCRP-03 section with `#scrape-btn` button and `#scrape-status` feedback div inside `<main>`
- `src/popup/popup.js` - Added `scrapeBtn`/`scrapeStatus` DOM refs, `showScrapeStatus()`, `triggerScrape()`, and DOMContentLoaded click binding
- `src/content/upwork-content.js` - Added `import { scrapeDetailPage }` and `scrapeDetail` message handler block

## Decisions Made

- Scrape Now button placed in `<main>` as its own `setting-group` section, not inside `<footer>` — keeps it visually separate from Save Settings and avoids conflating the two actions
- `showScrapeStatus()` is a dedicated function mirroring `showStatus()` rather than a shared helper — each feedback area has its own function and DOM target, preventing cross-contamination of status messages
- `triggerScrape()` uses safe-fail try/catch with user-friendly error message ("Scrape failed — open an Upwork search page") — consistent with existing popup safe-fail pattern established in prior plans

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 2 complete: all four requirements (SCRP-01, SCRP-02, SCRP-03, SCRP-04) are now satisfied
- The extension can scrape search results pages on demand via popup button and scrape detail pages via message
- Ready for Phase 3: Webhook Integration — scraped job data can now be forwarded to n8n webhook endpoint
- Concern: Field name compatibility with reference project should be verified before Phase 3 ships (already noted as blocker in STATE.md)

---
*Phase: 02-scraping-engine*
*Completed: 2026-02-18*
