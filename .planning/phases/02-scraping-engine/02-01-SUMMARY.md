---
phase: 02-scraping-engine
plan: 01
subsystem: scraping
tags: [dom-scraping, content-script, job-parsing, upwork, es-modules]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Extension manifest with content script registration and src/ directory structure
provides:
  - scrapeSearchPage() in src/content/search-scraper.js — reads Upwork search results DOM, returns [{job_id, title, url}]
  - extractJobId(url) in src/utils/job-parser.js — parses tilde-notation job ID from any Upwork job URL
affects:
  - 02-02 (job detail scraper may reuse extractJobId)
  - 03-webhook-integration (needs scrapeSearchPage output as webhook payload source)
  - 03-search-overlay (reads job arrays from scrapeSearchPage)
  - 03-csv-export (uses scrapeSearchPage output as data source)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cascading selector fallback — try multiple DOM selectors in priority order, use first match
    - Pure utility separation — extractJobId is a pure string function, no DOM or side effects
    - Absolute URL normalization — always resolve relative hrefs to https://www.upwork.com origin

key-files:
  created:
    - src/utils/job-parser.js
    - src/content/search-scraper.js
  modified: []

key-decisions:
  - "Cascading selector fallbacks for both card containers and title links — insulates against Upwork DOM changes"
  - "Skip cards missing job_id or title rather than returning partial objects — downstream consumers can trust all fields are populated"
  - "console.debug diagnostic line included for extension DevTools visibility during manual testing"
  - "Field names job_id, title, url use snake_case to match reference project exactly for n8n compatibility"

patterns-established:
  - "Selector fallback pattern: iterate selector array, querySelectorAll, break on first non-empty result"
  - "Guard-and-continue: skip malformed cards with continue rather than throwing or returning partial data"

# Metrics
duration: 5min
completed: 2026-02-18
---

# Phase 2 Plan 01: Search Page Scraper Summary

**DOM scraper and URL parser for Upwork search results — returns [{job_id, title, url}] arrays using cascading selector fallbacks and tilde-notation ID extraction**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-18
- **Completed:** 2026-02-18
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created pure-utility `extractJobId(url)` that parses `_~{id}` from any Upwork job URL using a single regex
- Created `scrapeSearchPage()` content-script module with cascading DOM selector fallbacks for both card containers and title links
- Guaranteed output shape: every returned object has populated `job_id`, `title`, and `url` — partial objects are skipped, empty pages return `[]` without throwing

## Task Commits

Each task was committed atomically:

1. **Task 1: URL parser utility** - `40c0e44` (feat)
2. **Task 2: Search page scraper module** - `00a56cf` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `src/utils/job-parser.js` - Pure string utility exporting `extractJobId(url)` — extracts tilde-notation job ID from Upwork URLs, returns null on no match
- `src/content/search-scraper.js` - Content script module exporting `scrapeSearchPage()` — reads current DOM, returns `[{job_id, title, url}]` with cascading selector fallbacks

## Decisions Made
- Cascading selector fallbacks chosen to insulate against Upwork DOM class/attribute changes without requiring code updates
- Cards missing `job_id` or `title` are silently skipped (guard-and-continue) rather than throwing or returning undefined fields — downstream consumers receive a clean, uniform array
- Field names `job_id`, `title`, `url` match the reference project exactly (snake_case) to ensure n8n webhook compatibility in Phase 3

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `scrapeSearchPage()` and `extractJobId()` are ready to be imported by Phase 3 webhook and CSV export modules
- `upwork-content.js` will need to import and call `scrapeSearchPage()` in Phase 3 when the SCRAPE_PAGE message handler is added
- Field name compatibility with reference project is confirmed — `job_id`, `title`, `url` are snake_case as required

---
*Phase: 02-scraping-engine*
*Completed: 2026-02-18*
