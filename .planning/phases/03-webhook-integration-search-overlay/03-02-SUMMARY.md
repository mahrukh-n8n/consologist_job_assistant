---
phase: 03-webhook-integration-search-overlay
plan: 02
subsystem: ui
tags: [chrome-extension, content-script, dom-injection, mutation-observer, spa-navigation, webhook, n8n, mv3]

# Dependency graph
requires:
  - phase: 03-webhook-integration-search-overlay
    plan: 01
    provides: PUSH_JOBS handler in service worker and WebhookClient for webhook dispatch
  - phase: 02-scraping-engine
    provides: scrapeSearchPage() and scrapeDetailPage() inlined into upwork-content.js, extractJobId() helper
provides:
  - initSearchPage(): collects job IDs from search results DOM, sends GET_MATCH_STATUS to SW, injects colored circle icons
  - initDetailPage(): injects "Scrape Job" button on job detail pages, calls PUSH_JOBS on click
  - GET_MATCH_STATUS handler in service worker: POSTs job_ids to n8n match endpoint, returns status map
  - SPA navigation router (routePage + MutationObserver) re-triggers both inits on URL change
  - job-transformer.js: maps Phase 2 scraper output to reference schema for n8n compatibility
affects:
  - 03-03 (CSV export — shares upwork-content.js SPA routing; transformer now in place)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Retry loop with setTimeout: up to 5 attempts every 800ms for slow SPA DOM render
    - MutationObserver on document.body tracking full href (not just pathname) for SPA navigation
    - Inline CSS on injected elements (no external CSS to avoid CSP issues)
    - handleMatchStatus() extracted as named async function called from onMessage with return true
    - statuscheck:true flag in GET_MATCH_STATUS POST body for n8n routing disambiguation

key-files:
  created:
    - src/utils/job-transformer.js
  modified:
    - src/content/upwork-content.js
    - src/background/service-worker.js

key-decisions:
  - "GET_MATCH_STATUS posts to same webhookUrl as PUSH_JOBS (not a separate matchWebhookUrl) with statuscheck:true flag for n8n routing disambiguation"
  - "SPA observer tracks full location.href instead of pathname — search-to-search navigation (same path, different ?q=) must also re-trigger"
  - "initSearchPage() retries card detection up to 5x at 800ms intervals — Upwork SPA render is variable, single 1500ms shot was insufficient"
  - "Initial search page delay set to 5s (not 1s) for first SPA render after page load"
  - "job-transformer.js added to map Phase 2 scraper keys to reference schema before PUSH_JOBS dispatch"
  - "qualifications_country defaults to null (not undefined) in transformer for strict n8n field contract"
  - "postedAt defaults to today's ISO date when posted_date is missing — downstream consumer expects a date string"

patterns-established:
  - "Retry-with-setTimeout pattern: up to N attempts at X ms interval, log on all-fail, no error throw"
  - "SPA navigator: MutationObserver tracks location.href (not pathname) to catch query-string-only navigation"
  - "Duplicate injection guard: check for existing element by ID or class before inserting"

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 3 Plan 02: Search Overlay and Detail Page Scrape Button Summary

**Colored match-status circle icons injected on Upwork search results via GET_MATCH_STATUS round-trip to n8n, green "Scrape Job" button injected on detail pages with PUSH_JOBS on click, SPA navigation handled via MutationObserver**

## Performance

- **Duration:** ~15 min (including deviation fixes across multiple sessions)
- **Started:** 2026-02-18T07:00:00Z
- **Completed:** 2026-02-18T08:53:51Z
- **Tasks:** 2 (plus checkpoint pending human verification)
- **Files modified:** 3 (upwork-content.js, service-worker.js, manifest.json) + 1 created (job-transformer.js)

## Accomplishments

- `initSearchPage()` collects all visible job card IDs from Upwork search DOM using cascading selectors, sends `GET_MATCH_STATUS` to service worker, and injects 10px colored circle spans (`#22c55e` green / `#ef4444` red / `#3b82f6` blue) next to each title link — no icons when n8n is down (graceful degradation)
- `initDetailPage()` injects a green `#14a800` "Scrape Job" button after the job title `<h1>`, calls `scrapeDetailPage()` on click, sends `PUSH_JOBS`, and shows transient "Sent!" / "Failed" feedback with 2s reset
- `GET_MATCH_STATUS` handler added to service worker: reads `webhookUrl` from storage, POSTs `{ job_ids: [...], statuscheck: true }` to same endpoint as PUSH_JOBS (n8n routes via `statuscheck` flag), parses response as status map
- SPA navigation router (`routePage()` + MutationObserver on `location.href`) re-inits both search and detail behaviors on URL change without full page reload
- `job-transformer.js` created to map Phase 2 scraper output fields to the reference n8n schema before PUSH_JOBS dispatch

## Task Commits

Each task was committed atomically:

1. **Task 1: GET_MATCH_STATUS handler in service worker + search icon injection** - `671dbf0` (feat)
2. **Task 2: Detail page scrape button INJC-02** - `261d7f4` (feat)

**Deviation fix commits (auto-applied):**
- `0502839` - Track full href in SPA observer (not just pathname)
- `19f8cf4` - Retry card detection up to 5x every 800ms
- `4835b0e` - Increase initial search page delay to 5s
- `dd8064f` - Default postedAt to today's ISO date when posted_date missing
- `dd60beb` - Add statuscheck:true to GET_MATCH_STATUS POST body
- `c538917` - Send GET_MATCH_STATUS to same webhookUrl as PUSH_JOBS
- `f291936` - Default qualifications_country to null in transformer
- `80fd590` - Add job-transformer to map Phase 2 output to reference schema
- `c46ebc7` - Add https://* host_permissions for user-configured webhook URLs

## Files Created/Modified

- `src/content/upwork-content.js` - Added `initSearchPage()` (icon overlay), `initDetailPage()` (scrape button), `routePage()` (SPA router), `MutationObserver` on `location.href`; all Phase 2 scraper code remains inlined
- `src/background/service-worker.js` - Added `GET_MATCH_STATUS` case in `onMessage` listener (return true, calls `handleMatchStatus()`); added `handleMatchStatus()` async function; added `import { transformJob }` and applies transformer before PUSH_JOBS dispatch
- `src/utils/job-transformer.js` - Maps Phase 2 scraper field names to reference n8n schema (postedAt, budgetAmount, paymentType, etc.); handles defaults for null/missing fields
- `manifest.json` - Added `https://*/*` to `host_permissions` so fetch() to user-configured webhook URLs is permitted

## DOM Selectors Actually Used

**Search page card detection (cascading fallbacks):**
1. `[data-test="job-tile"]` — primary (current Upwork DOM)
2. `section.air3-card-section` — fallback
3. `article.job-tile` — fallback
4. `.job-tile` — fallback

**Title link detection within card (cascading fallbacks):**
1. `[data-test="job-title"] a` — primary
2. `h2.job-title a` — fallback
3. `h2 a[href*="/jobs/"]` — fallback
4. `a[href*="/jobs/"]` — broad fallback

**Job ID extraction:** `href.match(/[/_]~([a-zA-Z0-9]+)/)` handles both `/jobs/~ID` and `_~ID` formats

**Detail page button injection:** `document.querySelector('h1')` → `insertAdjacentElement('afterend', btn)`; fallback: `document.body.prepend(btn)`

## Message Round-Trip Contract: GET_MATCH_STATUS

**Content script sends:**
```js
chrome.runtime.sendMessage({ action: 'GET_MATCH_STATUS', jobIds: ['id1', 'id2', ...] }, callback)
```

**Service worker POSTs to n8n:**
```js
fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ job_ids: ['id1', 'id2', ...], statuscheck: true })
})
```

**n8n responds with status map:**
```js
{ "id1": "match", "id2": "no_match", "id3": "applied" }
```

**Service worker relays to content script:**
```js
{ success: true, statuses: { id1: 'match', ... } }
// or on failure:
{ success: false, error: 'error message', statuses: {} }
```

**Icon colors applied by content script:**
- `match` → `#22c55e` (green circle)
- `no_match` → `#ef4444` (red circle)
- `applied` → `#3b82f6` (blue circle)
- anything else → no icon

## Manifest Changes Note

`host_permissions` now includes `https://*/*` to allow the service worker to `fetch()` user-configured n8n webhook URLs (which are not on `*.upwork.com`). Without this, the GET_MATCH_STATUS POST and PUSH_JOBS POST both fail with a CORS/permissions error.

The manifest uses a single content_scripts entry (`src/content/upwork-content.js`) with all Phase 2 scrapers inlined — no manifest ordering issue. `detail-scraper.js` functions are available in the same script context.

## Decisions Made

- GET_MATCH_STATUS POSTs to the same `webhookUrl` as PUSH_JOBS rather than a separate `matchWebhookUrl`. The `statuscheck: true` flag in the POST body allows n8n to route the two request types to different workflow branches. This avoids a second settings field and keeps configuration minimal.
- SPA observer tracks `location.href` (including query string) rather than `location.pathname` alone — Upwork search-to-search navigation changes the `?q=` param but not the path, so pathname-only tracking missed re-scrapes.
- Card detection retries up to 5 times at 800ms intervals. A single fixed delay was insufficient for Upwork's variable SPA render time.
- Initial delay on search page set to 5s to allow first-paint SPA content to fully render before the first card detection attempt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SPA observer tracking pathname only — missed search-to-search navigation**
- **Found during:** Task 1 verification
- **Issue:** `location.pathname` does not change when only the `?q=` search query changes; re-scrape was skipped on subsequent searches
- **Fix:** Changed observer to track `location.href` (full URL including query string)
- **Files modified:** src/content/upwork-content.js
- **Commit:** `0502839`

**2. [Rule 1 - Bug] Single-shot card detection failed on slow SPA renders**
- **Found during:** Task 1 verification
- **Issue:** A 1500ms fixed delay was insufficient; Upwork SPA sometimes renders cards after 2-4s
- **Fix:** Changed to retry loop — up to 5 attempts every 800ms, logging on exhaustion
- **Files modified:** src/content/upwork-content.js
- **Commit:** `19f8cf4`

**3. [Rule 1 - Bug] Initial search page delay too short (1s)**
- **Found during:** Task 1 follow-up
- **Issue:** First card detection attempt on cold page load was firing before SPA had rendered anything
- **Fix:** Increased initial delay to 5s before first detection attempt
- **Files modified:** src/content/upwork-content.js
- **Commit:** `4835b0e`

**4. [Rule 2 - Missing Critical] GET_MATCH_STATUS lacked n8n routing disambiguation**
- **Found during:** Task 1 integration
- **Issue:** GET_MATCH_STATUS and PUSH_JOBS both POST to the same URL; n8n needed a way to distinguish the two
- **Fix:** Added `statuscheck: true` to the GET_MATCH_STATUS POST body; n8n workflow branches on this flag
- **Files modified:** src/background/service-worker.js
- **Commits:** `dd60beb`, `c538917`

**5. [Rule 2 - Missing Critical] No job schema transformer for PUSH_JOBS dispatch**
- **Found during:** Task 2 integration
- **Issue:** Phase 2 scraper field names (snake_case) did not match the reference n8n schema (camelCase + different field names); jobs pushed via PUSH_JOBS were rejected or misrouted
- **Fix:** Created `src/utils/job-transformer.js` to map scraper output to reference schema; applied in service worker before WebhookClient dispatch
- **Files modified/created:** src/utils/job-transformer.js, src/background/service-worker.js
- **Commits:** `80fd590`, `f291936`, `dd8064f`

**6. [Rule 3 - Blocking] Missing host_permissions for webhook URLs**
- **Found during:** Task 1 integration
- **Issue:** `fetch()` to non-upwork.com webhook URLs was blocked by MV3 host permissions; GET_MATCH_STATUS and PUSH_JOBS both failed silently
- **Fix:** Added `https://*/*` to manifest.json `host_permissions`
- **Files modified:** manifest.json
- **Commit:** `c46ebc7`

---

**Total deviations:** 6 auto-fixed (2 bugs, 2 missing critical, 1 blocking + 1 schema contract fix)
**Impact on plan:** All auto-fixes necessary for correct operation. No scope creep — all fixes directly enable the core plan functionality (icon overlay and scrape button).

## Issues Encountered

- n8n routing: posting two different message types to the same webhook URL required a disambiguation mechanism. Resolved by adding `statuscheck: true` flag; this is a soft contract between the extension and the n8n workflow (documented above).
- Upwork SPA timing: card render delay is non-deterministic. Retry loop with 5 attempts at 800ms is a reasonable heuristic — may need further tuning based on real-world testing at the human verification checkpoint.

## User Setup Required

None beyond existing webhook URL configuration. The `https://*/*` host_permissions change is included in the extension manifest and applies automatically when the extension is loaded/reloaded.

The n8n workflow must handle `statuscheck: true` requests by returning a job_id-to-status map (not a standard push acknowledgement). This is an n8n workflow configuration step, not an extension code step.

## Next Phase Readiness

- INJC-01 (search overlay icons) and INJC-02 (detail page scrape button) implementations are complete — pending human verification at the checkpoint
- Phase 3 Plan 03 (CSV export) can proceed after checkpoint approval: `upwork-content.js` SPA router is in place and `job-transformer.js` schema mapping is established
- The `statuscheck: true` flag must be documented in any n8n workflow setup guide so users know to add a branch condition on this field

---
*Phase: 03-webhook-integration-search-overlay*
*Completed: 2026-02-18*

## Self-Check

- FOUND: src/content/upwork-content.js (verified via Node.js fs.existsSync)
- FOUND: src/background/service-worker.js (verified via Node.js fs.existsSync)
- FOUND: GET_MATCH_STATUS handler in service-worker.js (verified via grep)
- FOUND: upwork-ext-scrape-btn in upwork-content.js (verified via grep)
- FOUND: upwork-ext-status-icon in upwork-content.js (verified via grep)
- FOUND: MutationObserver / routePage / _spaObserver in upwork-content.js (verified via grep)
- FOUND commit: 671dbf0 (Task 1 — GET_MATCH_STATUS + search icons)
- FOUND commit: 261d7f4 (Task 2 — detail page scrape button)

## Self-Check: PASSED
