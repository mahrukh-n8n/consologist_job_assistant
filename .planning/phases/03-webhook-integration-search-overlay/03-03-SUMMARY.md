---
phase: 03-webhook-integration-search-overlay
plan: 03
subsystem: ui
tags: [csv, chrome-extension, downloads, popup, service-worker, MV3]

# Dependency graph
requires:
  - phase: 03-webhook-integration-search-overlay
    provides: "03-01 WebhookClient + PUSH_JOBS handler; 03-02 job-transformer.js with reference schema mapping and lastScrapedJobs storage"
provides:
  - "CsvExporter class with generateCsv(jobs) using 44-field reference n8n schema (RFC 4180)"
  - "EXPORT_CSV service worker handler: reads outputFormat + lastScrapedJobs, guards on both, downloads via data: URI"
  - "Export CSV button in popup with transient feedback for success/csv_disabled/no_data/error"
affects:
  - "Phase 04 (if any) that reads exported CSV or adds more export formats"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MV3 data: URI download pattern — encodeURIComponent(csvString) avoids Blob/URL.createObjectURL (service worker restriction)"
    - "EXPORT_CSV follows same async handler pattern as GET_MATCH_STATUS: standalone async fn + .then(sendResponse) + return true"
    - "Popup button guard pattern: disable + label change during request, reset in finally block"

key-files:
  created:
    - src/utils/csv-exporter.js
  modified:
    - src/background/service-worker.js
    - src/popup/popup.html
    - src/popup/popup.js

key-decisions:
  - "CsvExporter uses 44-field FIELD_ORDER matching full reference n8n project schema (case-sensitive) — not the 15-field scraper output schema"
  - "outputFormat guard checks for 'webhook' specifically (not absence of 'csv') — 'both' and 'csv' both permit export"
  - "lastScrapedJobs guard checks: falsy OR not Array OR length 0 — all three cases return no_data"
  - "data: URI with encodeURIComponent — MV3 service worker cannot use Blob or URL.createObjectURL"
  - "sendExportCsv() uses Promise-wrapping of sendMessage callback to enable async/await with chrome.runtime.lastError handling"

patterns-established:
  - "CsvExporter.generateCsv(jobs): stateless class, no constructor required, FIELD_ORDER constant defines schema"
  - "RFC 4180 escaping: arrays join with semicolons first, then check for comma/quote/newline, wrap with double-quotes, double internal quotes"
  - "Service worker handler: standalone async function + .then(sendResponse) + return true (consistent with handleMatchStatus)"

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 3 Plan 03: CSV Export Summary

**RFC 4180 CSV export via 44-column n8n reference schema — CsvExporter utility, EXPORT_CSV service worker handler with outputFormat + data guards, popup Export CSV button with per-state feedback**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T09:09:35Z
- **Completed:** 2026-02-18T09:12:13Z
- **Tasks:** 2 of 3 (checkpoint:human-verify pending user approval)
- **Files modified:** 4

## Accomplishments

- CsvExporter class generates RFC 4180-compliant CSV from job arrays using 44-field FIELD_ORDER matching the reference n8n project schema exactly (case-sensitive field names)
- EXPORT_CSV service worker handler guards on outputFormat ('webhook' → csv_disabled) and lastScrapedJobs (missing/empty → no_data), then downloads via data: URI (MV3-safe)
- Popup Export CSV button wires the full message flow with transient status feedback for all four response states (success, csv_disabled, no_data, error) and disables during request to prevent double-clicks

## EXPORT_CSV Message Contract

**Input:** `{ action: 'EXPORT_CSV' }`

**Output (success):** `{ success: true, count: N }`

**Output (guard - webhook mode):** `{ success: false, reason: 'csv_disabled', message: 'CSV export is disabled for webhook-only mode' }`

**Output (guard - no data):** `{ success: false, reason: 'no_data', message: 'No scraped jobs to export' }`

## Storage Keys Used

| Key | Source | Purpose |
|-----|--------|---------|
| `outputFormat` | chrome.storage.local | 'webhook' disables CSV export; 'csv' or 'both' permits it |
| `lastScrapedJobs` | chrome.storage.local | Array of job objects stored by content script / PUSH_JOBS flow |

## CsvExporter Field Order (44 columns, reference n8n schema)

```
category, subcategory, postedAt, publishTime, createTime,
lastActivity, lastOnlineTime, currencyCode, hourlyMin, hourlyMax,
projectBudget, weeklyRetainerBudget, engagementDuration, engagementWeeks,
hourlyEngagementType, Project Payment Type, skills, contractorTier,
totalApplicants, totalInvitedToInterview, totalHired, unansweredInvites,
invitationsSent, numberOfPositionsToHire, hireRate, clientCountry,
clientCity, feedbackScore, feedbackCount, totalCharges,
totalJobsWithHires, openedJobs, isPaymentVerified, clientIndustry,
clientCompanySize, qualifications_regions, qualifications_worldRegion,
qualifications_country, minJobSuccessScore, englishLevel,
Title, URL, Description, Job ID
```

## Data: URI Download Pattern (MV3)

```js
const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString);
chrome.downloads.download({ url: dataUri, filename: 'upwork-jobs.csv', saveAs: false });
```

MV3 service workers cannot use `Blob` or `URL.createObjectURL`. Data URI with `encodeURIComponent` is the correct pattern.

## Task Commits

Each task was committed atomically:

1. **Task 1: CsvExporter utility and EXPORT_CSV service worker handler** - `5a29634` (feat)
2. **Task 2: Export CSV button in popup** - `53dec01` (feat)
3. **Task 3: checkpoint:human-verify** - pending user approval

**Plan metadata:** TBD (after checkpoint approval)

## Files Created/Modified

- `src/utils/csv-exporter.js` (NEW) - CsvExporter class with generateCsv(jobs) and RFC 4180 escaping
- `src/background/service-worker.js` - Added CsvExporter import, handleExportCsv() async function, EXPORT_CSV case in message listener
- `src/popup/popup.html` - Added #export-csv-btn button in footer before #save-btn
- `src/popup/popup.js` - Added exportCsvBtn to els, sendExportCsv() function, DOMContentLoaded binding

## Decisions Made

- CsvExporter uses 44-field FIELD_ORDER matching the full reference n8n project schema (not the 15-field Phase 2 scraper schema) — CsvExporter receives pre-transformed objects with these exact field names from lastScrapedJobs
- outputFormat guard checks specifically for 'webhook' (the string) — 'both' and 'csv' both permit CSV export
- data: URI download pattern used (not Blob) — MV3 service worker restriction
- sendExportCsv() wraps sendMessage in a Promise to enable async/await with proper chrome.runtime.lastError handling — consistent with popup pattern

## Deviations from Plan

None - plan executed exactly as written. The plan's internal discrepancy (verify step said "15 headers" but FIELD_ORDER and must_haves both specified 44) was resolved in favor of the 44-field FIELD_ORDER as defined in the task action and must_haves truth.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CSV export end-to-end is ready for human verification (checkpoint:human-verify)
- After checkpoint approval: Phase 3 complete, all three plans (03-01, 03-02, 03-03) delivered
- Phase 4 can consume `lastScrapedJobs` from storage or extend CsvExporter if additional fields are needed
- The `downloads` permission was already in manifest.json (added proactively in Phase 1)

---
*Phase: 03-webhook-integration-search-overlay*
*Completed: 2026-02-18*
