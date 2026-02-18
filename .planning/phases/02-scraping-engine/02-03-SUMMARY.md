---
phase: 02-scraping-engine
plan: 03
subsystem: scraping
tags: [chrome-extension, chrome-alarms, service-worker, content-script, scheduled-scraping, mv3]

# Dependency graph
requires:
  - phase: 02-01
    provides: scrapeSearchPage() from src/content/search-scraper.js
  - phase: 02-02
    provides: scrapeDetailPage() from src/content/detail-scraper.js (available for future detail-page scrape cycles)
  - phase: 01-foundation
    provides: manifest.json with alarms permission, service-worker shell with onMessage handler
provides:
  - Scheduled scrape cycle driven by chrome.alarms firing at user-configured interval
  - runScheduledScrape() in service-worker — finds or opens Upwork search tab, sends scrapeSearch, stores results
  - waitForTabLoad() helper — waits for tab load + 2s SPA settle delay
  - updateAlarm message handler in service-worker — re-registers alarm when popup saves new interval
  - scrapeSearch message handler in upwork-content.js — calls scrapeSearchPage() and responds with jobs array
  - lastScrapeJobs and lastScrapeTime written to chrome.storage.local after each successful scrape cycle
affects:
  - 03-01 (webhook integration reads lastScrapeJobs from storage or can receive jobs from scrape cycle)
  - 03-02 (notifications: scrapeComplete fires after runScheduledScrape stores results)
  - 03-03 (CSV export reads lastScrapeJobs from storage)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Alarm idempotency: always clear then create — prevents duplicate alarms on reinstall or interval change
    - Tab reuse guard: query existing search tabs before opening new one — avoids duplicate tab proliferation
    - Background tab open with waitForTabLoad: opens tab with active:false, waits for status:complete + 2s SPA delay
    - Safe-fail alarm update in popup: sendMessage for updateAlarm is wrapped in try/catch — storage write always succeeds regardless
    - Storage key alignment: service worker reads scheduleInterval (not scrapeInterval) to match popup.js write key

key-files:
  created: []
  modified:
    - src/background/service-worker.js
    - src/popup/popup.js
    - src/content/upwork-content.js
    - manifest.json

key-decisions:
  - "scheduleInterval used as storage key (not scrapeInterval from plan) — popup.js already writes this key; using scrapeInterval would always fall back to default 30min"
  - "manifest.json content_scripts type:module added — enables upwork-content.js to import scrapeSearchPage from search-scraper.js using ES import syntax"
  - "updateAlarm handler uses chrome.alarms.clear().then() chain inside onMessage — service worker context requires explicit async handling inside message listener"
  - "Alarm update in popup wrapped in nested try/catch — storage save succeeds even if service worker is not running at save time"
  - "runScheduledScrape placed in service-worker.js (not a separate module) — single file simplicity; no new imports needed for Phase 2"

patterns-established:
  - "Alarm idempotency: clear-then-create pattern prevents duplicate alarms on repeated calls"
  - "Tab lifecycle: query -> reuse-or-open -> scrape -> conditional-close — clean tab management with no leaks"
  - "Scrape result storage: always write lastScrapeJobs + lastScrapeTime together as atomic set — downstream readers always see consistent pair"

# Metrics
duration: 12min
completed: 2026-02-18
---

# Phase 2 Plan 03: Scheduled Scraping via chrome.alarms Summary

**chrome.alarms scheduled scrape cycle wiring service-worker to search-scraper — auto-opens/reuses Upwork tabs, stores lastScrapeJobs + lastScrapeTime in chrome.storage.local on each alarm fire**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-02-18T04:18:59Z
- **Completed:** 2026-02-18
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Wired `chrome.alarms` into service-worker.js so scrape cycles run at the user's configured interval without any popup interaction
- `runScheduledScrape()` reuses an existing Upwork search tab if one is open, or opens a background tab, waits for SPA render, scrapes, and closes the tab
- Results (`lastScrapeJobs` array, `lastScrapeTime` ISO string) written to `chrome.storage.local` for downstream Phase 3 consumers
- `upwork-content.js` upgraded to ES module with `scrapeSearch` message handler that calls `scrapeSearchPage()` and responds with jobs array
- Popup `saveSettings` now sends `updateAlarm` message to service worker after storing new interval so alarm re-registers immediately without waiting for next browser restart

## Task Commits

Each task was committed atomically:

1. **Task 1: Alarm registration and interval management** - `acdf60d` (feat)
2. **Task 2: Alarm listener, tab management, scrape orchestration** - `63c33de` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/background/service-worker.js` - Complete scrape orchestration: ALARM_NAME constant, registerAlarmFromStorage(), updateAlarm message handler, alarm listener, runScheduledScrape(), waitForTabLoad()
- `src/popup/popup.js` - Added updateAlarm sendMessage call in saveSettings after storage write; wrapped in try/catch to not block save confirmation
- `src/content/upwork-content.js` - Added ES module import of scrapeSearchPage, added scrapeSearch message handler that calls scrapeSearchPage() and sendResponse({ jobs })
- `manifest.json` - Added "type": "module" to content_scripts entry to enable ES import in upwork-content.js

## Decisions Made

- **scheduleInterval as storage key**: Plan specified `scrapeInterval` but popup.js (Phase 1) writes `scheduleInterval`. Using the plan's key would always read undefined and fall back to 30min default, breaking the user's configured interval. Fixed to use `scheduleInterval` throughout.
- **content_scripts type:module**: upwork-content.js needs to import scrapeSearchPage from search-scraper.js. Both files use ES module syntax. Setting "type": "module" in the manifest content_scripts entry is the correct MV3 approach — no bundler, no duplication.
- **Alarm update safe-fail in popup**: The `updateAlarm` message can fail if the service worker happens to be idle (MV3 service workers are ephemeral). Wrapping in try/catch means the storage write always completes and the user sees "Saved" — the alarm will be registered correctly on next browser startup via `onStartup`.
- **runScheduledScrape in same file**: No need for a separate module. Keeping scrape orchestration in service-worker.js keeps the dependency graph flat for Phase 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Storage key mismatch: scheduleInterval vs scrapeInterval**
- **Found during:** Task 1 (alarm registration)
- **Issue:** Plan specified `chrome.storage.local.get({ scrapeInterval: DEFAULT_INTERVAL_MINUTES })` but popup.js writes the key `scheduleInterval`. Reading `scrapeInterval` would always return undefined and fall back to 30 min default, ignoring the user's setting entirely.
- **Fix:** Changed storage key in service-worker.js to `scheduleInterval` to match what popup.js writes. Used destructuring `const { scheduleInterval }` throughout.
- **Files modified:** `src/background/service-worker.js`
- **Verification:** Service worker reads the value popup.js stores — consistent key across the full settings save/alarm register flow.
- **Committed in:** `acdf60d` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Enable ES modules for content scripts in manifest**
- **Found during:** Task 2 (content script message handler)
- **Issue:** `upwork-content.js` needed to import `scrapeSearchPage` from `search-scraper.js` but the manifest did not declare content_scripts as module type. Without this, ES `import` syntax in a content script fails with a syntax error.
- **Fix:** Added `"type": "module"` to the content_scripts entry in manifest.json.
- **Files modified:** `manifest.json`
- **Verification:** upwork-content.js can now use `import { scrapeSearchPage } from './search-scraper.js'` at the top of the file.
- **Committed in:** `63c33de` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug — wrong storage key, 1 missing critical — module type for imports)
**Impact on plan:** Both fixes required for the feature to function at all. No scope creep.

## Issues Encountered

None beyond the two auto-fixed deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `chrome.storage.local.lastScrapeJobs` (array of `{job_id, title, url}`) and `lastScrapeTime` (ISO string) are written after each successful alarm cycle — Phase 3 webhook integration and CSV export can read these keys directly
- `runScheduledScrape()` is available in the global service worker scope for manual testing via `chrome://extensions` service worker inspector
- Phase 3 notifications plan (02-04 or 03-02) can hook into the scrape cycle by reading `lastScrapeTime` to detect new results
- Alarm management is complete — no further alarm changes needed unless interval options expand beyond the four popup values

---
*Phase: 02-scraping-engine*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: src/background/service-worker.js
- FOUND: src/popup/popup.js
- FOUND: src/content/upwork-content.js
- FOUND: manifest.json
- FOUND: .planning/phases/02-scraping-engine/02-03-SUMMARY.md
- FOUND commit acdf60d (Task 1 - alarm registration and interval management)
- FOUND commit 63c33de (Task 2 - alarm listener, tab management, scrape orchestration)
