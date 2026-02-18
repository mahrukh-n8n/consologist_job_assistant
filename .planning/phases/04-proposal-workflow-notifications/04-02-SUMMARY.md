---
phase: 04-proposal-workflow-notifications
plan: 02
subsystem: ui
tags: [chrome-notifications, service-worker, popup, chrome-extension, manifest-v3, notifications]

# Dependency graph
requires:
  - phase: 04-proposal-workflow-notifications/04-01
    provides: handleLoadProposal service worker handler, LOAD_PROPOSAL message routing
  - phase: 01-foundation
    provides: notification preference storage keys (notifications.master, notifications.scrapeComplete, etc.)

provides:
  - fireNotification(type, message) helper in service worker — reads flat dot-notation storage keys, safe-fail
  - Toast notifications for proposalLoaded and errors in handleLoadProposal
  - Toast notifications for webhookSent in PUSH_JOBS handler
  - Toast notifications for scrapeComplete / errors in EXPORT_CSV handler
  - Commented SCRAPE_SEARCH and SCRAPE_DETAIL placeholder call-sites for future phases
  - #ext-status div in popup.html for inline action status feedback
  - showExtStatus(message, type) function in popup.js — 5s auto-clear, green success / red error
  - CSS transitions for .ext-status visible state in popup.css

affects:
  - future scrape/webhook popup action buttons (pattern comment in popup.js guides wiring)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - fireNotification safe-fail try/catch — notification failures never crash the service worker
    - Flat dot-notation storage key reads for per-type notification gating
    - Separate showExtStatus() from showStatus() — distinct DOM targets, no cross-contamination
    - max-height:0 CSS collapse with transition for hidden-by-default status divs
    - extStatusTimer module-level var for cancellable auto-clear timeouts

key-files:
  created: []
  modified:
    - src/background/service-worker.js
    - src/popup/popup.html
    - src/popup/popup.js
    - src/popup/popup.css

key-decisions:
  - "fireNotification placed after lifecycle listeners, before message router — initialization order keeps it available to all handlers declared later"
  - "showExtStatus uses direct document.getElementById (not els ref) — avoids capturing stale DOM reference in closure, consistent with how ext-status is a global-lifetime element"
  - "extStatusTimer is a module-level let, not a closure — allows any future caller to see and cancel the pending timer across multiple calls"
  - "EXPORT_CSV handler converted from .then(sendResponse) to .then(async (result) => { ... sendResponse(result) }) — needed to await fireNotification inside the then callback"
  - "Placeholder comments for SCRAPE_SEARCH/SCRAPE_DETAIL placed inside EXPORT_CSV handler block — co-located with first scrapeComplete notification so future devs see the pattern in context"

patterns-established:
  - "fireNotification safe-fail pattern: try/catch wraps all chrome.notifications.create calls — failures logged, never thrown"
  - "Separate status elements for separate concerns: #save-status for save-button, #scrape-status for scrape, #ext-status for SW action responses"

# Metrics
duration: ~10min
completed: 2026-02-18
---

# Phase 4 Plan 02: Notifications and Popup Status Summary

**fireNotification() helper with dual-toggle gating (master + per-type) wired into all service worker handlers, plus #ext-status popup inline status display with 5-second auto-clear and CSS height animation**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-18
- **Completed:** 2026-02-18 (Tasks 1-2 complete; Task 3 is checkpoint:human-verify pending)
- **Tasks:** 2 of 3 (Task 3 = human verification checkpoint)
- **Files modified:** 4

## Accomplishments

- `fireNotification(type, message)` async helper added to service worker — reads `notifications.master` and `notifications.{type}` storage keys, fires `chrome.notifications.create()` only when both are true, wrapped in try/catch for safe-fail
- Toast notifications wired into: `handleLoadProposal` (proposalLoaded on success, errors on catch), PUSH_JOBS (webhookSent on success, errors on empty-jobs guard), EXPORT_CSV (scrapeComplete on success, errors on failure)
- Commented placeholder call-sites for SCRAPE_SEARCH and SCRAPE_DETAIL documented inside EXPORT_CSV handler for future phases
- `#ext-status` div added to popup.html as last child of `#app` — hidden by default (max-height: 0), animated to visible via CSS transition
- `showExtStatus(message, type)` added to popup.js — green for success, red for error, 5-second auto-clear with cancellable timer
- `extStatus` entry added to `els` DOM ref object in popup.js
- Pattern comment block added at bottom of popup.js guiding Phases 2-3 popup action button wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: fireNotification helper and toast call-sites** - `6e721e0` (feat)
2. **Task 2: Popup inline status display** - `10344e7` (feat)

**Plan metadata:** (docs commit — this summary, pending after checkpoint approval)

## Files Created/Modified

- `src/background/service-worker.js` - Added fireNotification() helper; wired toast calls into handleLoadProposal, PUSH_JOBS, EXPORT_CSV handlers
- `src/popup/popup.html` - Added `<div id="ext-status">` as last child of #app
- `src/popup/popup.js` - Added showExtStatus(), extStatusTimer, extStatus els entry, pattern comment
- `src/popup/popup.css` - Added .ext-status, .ext-status.visible, .ext-status.error styles

## Decisions Made

- **fireNotification placed before message router:** Initialization order ensures the function is hoisted/defined before any handler references it. Placed immediately after CSV export handler and before the message router block.

- **showExtStatus uses direct document.getElementById:** Rather than `els.extStatus()`, the implementation uses `document.getElementById('ext-status')` directly inside the function. This avoids capturing a stale element reference if the function is ever called before DOMContentLoaded settles. The `if (!el) return` null-guard makes it safe.

- **extStatusTimer as module-level let:** Placing the timer variable at module scope (outside the function) allows the cancel logic `if (extStatusTimer) clearTimeout(extStatusTimer)` to work correctly across multiple rapid calls to `showExtStatus`.

- **EXPORT_CSV handler converted to async then-callback:** The handler was originally `.then(sendResponse)`. To `await fireNotification` inside the callback it was converted to `.then(async (result) => { await fireNotification(...); sendResponse(result); })`. This is equivalent behavior — `sendResponse` still fires after the handler resolves.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — toast notifications use the `notifications` permission already declared in manifest.json. Notification preferences are already stored by the Phase 1 settings UI. No new storage keys or external configuration required.

## Next Phase Readiness

- NOTF-01 and NOTF-02 are functionally complete pending human verification (Task 3 checkpoint)
- All storage keys read by fireNotification (`notifications.master`, `notifications.scrapeComplete`, `notifications.webhookSent`, `notifications.proposalLoaded`, `notifications.errors`) are set by the Phase 1 popup save flow
- showExtStatus() is ready for Phase 2-3 popup action buttons to wire into — pattern documented in popup.js comment block
- Phase 4 plan 02 is the final plan — project will be complete after checkpoint approval

---
*Phase: 04-proposal-workflow-notifications*
*Completed: 2026-02-18*
