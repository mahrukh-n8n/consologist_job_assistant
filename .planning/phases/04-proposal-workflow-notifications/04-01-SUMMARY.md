---
phase: 04-proposal-workflow-notifications
plan: 01
subsystem: ui
tags: [content-script, service-worker, chrome-extension, n8n, manifest-v3, proposal]

# Dependency graph
requires:
  - phase: 03-webhook-integration-search-overlay
    provides: service worker message router, webhookUrl storage pattern, content script injection architecture

provides:
  - ProposalManager utility object (src/utils/proposal.js) with full apply page proposal workflow
  - LOAD_PROPOSAL service worker message handler fetching from proposalWebhookUrl
  - Content script entry point wired to call ProposalManager.init() on every Upwork page
  - manifest.json content_scripts multi-file injection: proposal.js loads before upwork-content.js

affects:
  - 04-02-notifications (popup status feedback for proposal load actions)
  - popup settings panel (must add proposalWebhookUrl input field)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ProposalManager as plain object literal (not class) — content scripts have no module scope, plain objects avoid ES module syntax
    - MutationObserver with 500ms debounce to re-inject UI on React re-renders
    - cloneNode/replaceChild pattern to re-attach event listeners on panel update (avoids stale closures)
    - input + change event dispatch pair for React synthetic event compatibility
    - handleLoadProposal uses direct callback pattern (not async .then) — keeps sendResponse channel open with return true

key-files:
  created:
    - src/utils/proposal.js
  modified:
    - src/background/service-worker.js
    - src/content/upwork-content.js
    - manifest.json

key-decisions:
  - "ProposalManager is a plain object literal, not a class — content scripts load as classic scripts, no ES module exports; consistent with existing inlined approach in upwork-content.js"
  - "proposalWebhookUrl storage key is distinct from webhookUrl (job data) — separate n8n workflow endpoints; documented in handleLoadProposal JSDoc and comment"
  - "manifest.json content_scripts multi-file injection: proposal.js before upwork-content.js — MV3 pattern for sharing globals across content script files without ES modules"
  - "handleLoadProposal registered with return true in onMessage (not .then) — keeps the async channel open per MV3 requirement"
  - "cloneNode/replaceChild for paste/copy button re-attachment on panel update — prevents stale closure over old proposalText on subsequent Load Proposal calls"

patterns-established:
  - "Content script global injection via manifest content_scripts[] ordering — lists utility before entry point so globals are available"
  - "All ProposalManager methods wrapped in try/catch — log errors, return gracefully, never throw into content script runtime"

# Metrics
duration: 12min
completed: 2026-02-18
---

# Phase 4 Plan 01: Proposal Loading Summary

**ProposalManager plain-object utility with Load/Paste/Copy buttons injected on Upwork apply pages, wired to a service worker LOAD_PROPOSAL handler that POSTs job context to a separate n8n proposalWebhookUrl**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-02-18
- **Completed:** 2026-02-18
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `ProposalManager` utility created with 7 public methods: `isApplyPage`, `injectButton`, `getJobContext`, `loadProposal`, `renderPanel`, `pasteProposal`, `copyProposal`, `init`
- "Load Proposal" button injects above cover-letter textarea on apply pages only (URL regex guard), styled in Upwork green (#14a800)
- Proposal panel renders below button with pre-formatted text, "Paste into form" and "Copy to clipboard" buttons
- Paste fires `input` + `change` events to trigger React synthetic event system (character counter updates)
- Service worker `LOAD_PROPOSAL` handler reads `proposalWebhookUrl` from storage, POSTs to n8n, handles both JSON and plain-text response formats
- MutationObserver (500ms debounce) re-injects button if React re-renders the cover letter section
- All failure paths are silent — try/catch on every method, errors logged to console only

## Task Commits

Each task was committed atomically:

1. **Task 1: ProposalManager utility** - `0ee0999` (feat)
2. **Task 2: Service worker LOAD_PROPOSAL handler + content script wiring** - `d68dcb4` (feat)

**Plan metadata:** (docs commit — this summary)

## Files Created/Modified

- `src/utils/proposal.js` - ProposalManager object: apply page detection, button injection, proposal fetch, panel render, paste/copy
- `src/background/service-worker.js` - Added LOAD_PROPOSAL message routing + `handleLoadProposal()` async function
- `src/content/upwork-content.js` - Added `ProposalManager.init()` call at bottom with undefined guard
- `manifest.json` - Added `src/utils/proposal.js` before `src/content/upwork-content.js` in content_scripts array

## Decisions Made

- **ProposalManager as plain object literal, not a class:** Content scripts run as classic scripts with no module scope. ES module `export` would break the content script context. Consistent with how existing helpers (scrapeSearchPage, scrapeDetailPage) are defined in the same file — here isolated in its own file and shared via manifest injection order.

- **`proposalWebhookUrl` storage key distinct from `webhookUrl`:** The proposal generation n8n workflow is a separate endpoint from the job-data webhook. Using the same URL would conflate two different workflows. Documented in handleLoadProposal JSDoc so the popup plan knows to add a second URL input field.

- **manifest.json multi-file content script injection:** MV3 content scripts don't support ES module imports by default (no `type: module` for content_scripts). The correct pattern is listing multiple JS files in the `js` array — Chrome injects them in order, so `proposal.js` runs first and `ProposalManager` is available as a global when `upwork-content.js` runs.

- **cloneNode/replaceChild for button re-attachment:** When `renderPanel()` is called a second time (user clicks Load Proposal again after initial load), the Paste/Copy buttons' event listeners need updating with the new `proposalText`. Using `removeEventListener` would require a named function reference. `cloneNode(true)` + `replaceChild` cleanly replaces the node and all stale listeners, then attaches fresh ones.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

`proposalWebhookUrl` must be set in `chrome.storage.local` before the Load Proposal button will work. Currently there is no UI input for this key — it must be set via DevTools Console:

```js
chrome.storage.local.set({ proposalWebhookUrl: 'https://your-n8n-host/webhook/proposal' });
```

The popup settings panel (04-02 or a future popup plan) must add a labeled input for this key. This is documented in the `handleLoadProposal` function JSDoc comment in service-worker.js.

## Next Phase Readiness

- Proposal loading workflow is fully functional end-to-end once `proposalWebhookUrl` is configured
- 04-02 (Notifications and status) can build on top of this plan without any changes here
- Popup plan should add `proposalWebhookUrl` input alongside the existing `webhookUrl` input

---
*Phase: 04-proposal-workflow-notifications*
*Completed: 2026-02-18*
