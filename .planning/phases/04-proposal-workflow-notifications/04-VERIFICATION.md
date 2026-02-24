---
phase: 04-proposal-workflow-notifications
verified: 2026-02-18T00:00:00Z
status: gaps_found
score: 8/10 must-haves verified
re_verification: false
gaps:
  - truth: "After a scheduled or on-demand scrape, a Windows toast notification appears summarizing how many jobs were scraped and where data was sent"
    status: failed
    reason: "runScheduledScrape() completes without calling fireNotification. fireNotification('scrapeComplete') is only wired inside the EXPORT_CSV handler (for CSV downloads), not in the alarm-triggered scrape path. The plan noted 'placeholder comments' for SCRAPE_SEARCH/SCRAPE_DETAIL but runScheduledScrape() has neither the call nor a placeholder comment. ROADMAP success criterion 4 requires the toast on scheduled scrapes."
    artifacts:
      - path: "src/background/service-worker.js"
        issue: "runScheduledScrape() (lines 260-304) has no fireNotification call after jobs are stored. The existing scrapeComplete call-site is in the EXPORT_CSV handler only."
    missing:
      - "Add await fireNotification('scrapeComplete', `Scraped ${jobs.length} jobs from search`); inside runScheduledScrape() after the jobs array is populated and stored (after line 303)"

  - truth: "Status feedback appears in the popup for webhook sends, proposal loads, and errors so the user always knows what the extension is doing"
    status: partial
    reason: "showExtStatus() is defined and styled, but is not called from any popup action handler. The scrape button (triggerScrape) uses showScrapeStatus() (separate element), the export CSV button (sendExportCsv) uses showStatus(), and the save button uses showStatus(). No popup action calls showExtStatus() — it exists only as a pattern comment for 'future phases'. The user never sees #ext-status feedback from any current action. ROADMAP success criterion 5 requires this feedback."
    artifacts:
      - path: "src/popup/popup.js"
        issue: "showExtStatus() defined at line 72 but never called by any event handler. Only a comment block at line 256 documents the intended wiring. triggerScrape() calls showScrapeStatus(), sendExportCsv() calls showStatus() — neither uses showExtStatus()."
    missing:
      - "Wire showExtStatus() to at least one current popup action. The most impactful: call showExtStatus() in sendExportCsv() for success/error (in addition to or replacing showStatus() calls) and in triggerScrape() for the scrape result — OR add a popup 'Load Proposal' status path that calls showExtStatus() when a proposal action completes."
human_verification:
  - test: "Toast notification on scheduled scrape"
    expected: "Trigger the alarm (or wait for it) — a Windows toast 'Scraped N jobs from search' should appear if both notifications.master and notifications.scrapeComplete are true in storage"
    why_human: "Cannot programmatically trigger chrome.alarms in a sandbox; runScheduledScrape() requires a real Chrome environment with a live Upwork tab"
  - test: "Load Proposal full end-to-end"
    expected: "On an Upwork /jobs/*/apply page: button appears above cover letter textarea; clicking it sends to n8n; returned proposal text renders in panel; Paste fills textarea with React events (character count updates); Copy writes to clipboard"
    why_human: "Requires live Upwork apply page, running n8n instance, and observing DOM mutations and React synthetic event propagation"
  - test: "Master notification toggle suppresses toasts"
    expected: "Unchecking 'Enable notifications' in popup and saving — then triggering a webhook push — should produce no Windows toast. Re-enabling should restore toasts."
    why_human: "Requires live Chrome environment to observe Windows toast behavior"
---

# Phase 4: Proposal Workflow and Notifications Verification Report

**Phase Goal:** The user can load an AI-generated proposal from n8n on a job apply page, paste it directly into the Upwork form or copy it to clipboard, and receive Windows toast notifications summarizing what the extension has done
**Verified:** 2026-02-18T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "Load Proposal" button appears on Upwork job apply pages and clicking it sends a request to n8n and displays the returned proposal text | VERIFIED | `ProposalManager.isApplyPage()` uses regex `/\/jobs\/[^/]+\/apply/`; `injectButton()` creates `#ext-load-proposal-btn`; `loadProposal()` sends `chrome.runtime.sendMessage({ action: 'LOAD_PROPOSAL', jobData })`; `renderPanel()` displays result |
| 2 | User can click "Paste" to insert the loaded proposal into the Upwork apply description field | VERIFIED | `pasteProposal()` sets `textarea.value = text` then dispatches `new Event('input', { bubbles: true })` and `new Event('change', { bubbles: true })` for React compatibility |
| 3 | User can click "Copy" to copy the proposal text to the clipboard | VERIFIED | `copyProposal()` calls `navigator.clipboard.writeText(text)`; failure is caught and logged, never thrown |
| 4 | After each scheduled or on-demand scrape, a Windows toast notification appears summarizing how many jobs were scraped and where data was sent | FAILED | `fireNotification('scrapeComplete', ...)` exists and is called in EXPORT_CSV success path, but `runScheduledScrape()` (the alarm handler) stores jobs without calling `fireNotification`. No toast fires after a scheduled scrape. |
| 5 | Status feedback appears in the popup for webhook sends, proposal loads, and errors so the user always knows what the extension is doing | PARTIAL | `showExtStatus()` and `#ext-status` div exist and are styled correctly. However `showExtStatus()` is never called by any current popup event handler — it is documented only as a pattern comment for future use. No current user action produces feedback in `#ext-status`. |

**Score:** 3/5 ROADMAP truths fully verified; 1 partial; 1 failed

### Plan 04-01 Must-Have Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "Load Proposal" button appears on apply pages (URL matching /jobs/*/apply) | VERIFIED | `isApplyPage()`: `/\/jobs\/[^/]+\/apply/.test(window.location.href)` — correct regex, returns false on non-apply pages |
| 2 | Clicking sends job context (job ID, title, description) to service worker via LOAD_PROPOSAL | VERIFIED | `loadProposal()` L131: `chrome.runtime.sendMessage({ action: 'LOAD_PROPOSAL', jobData: context }, callback)` |
| 3 | Returned proposal text renders in panel with Paste and Copy buttons visible | VERIFIED | `renderPanel()` builds `#ext-proposal-panel` with `<pre id="ext-proposal-text">`, `#ext-paste-btn`, `#ext-copy-btn` |
| 4 | Paste inserts proposal into Upwork apply textarea | VERIFIED | `pasteProposal()` L266-277: finds textarea, sets `.value`, dispatches `input` + `change` events |
| 5 | Copy writes to clipboard via navigator.clipboard.writeText | VERIFIED | `copyProposal()` L302: `navigator.clipboard.writeText(text).then(...).catch(...)` |
| 6 | All operations fail silently — no uncaught exceptions | VERIFIED | Every method (`isApplyPage`, `getJobContext`, `injectButton`, `loadProposal`, `renderPanel`, `_attachPanelHandlers`, `pasteProposal`, `copyProposal`, `init`) is wrapped in try/catch |

**Score:** 6/6 plan 04-01 truths verified

### Plan 04-02 Must-Have Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After scrape completes, toast appears (gated by master + scrapeComplete) | FAILED | `fireNotification('scrapeComplete', ...)` is only in EXPORT_CSV handler. `runScheduledScrape()` never calls `fireNotification`. |
| 2 | After webhook push, toast appears (gated by master + webhookSent) | VERIFIED | service-worker.js L180: `await fireNotification('webhookSent', \`Webhook: sent ${sent} jobs\`)` inside PUSH_JOBS handler success path |
| 3 | After proposal loads, toast appears (gated by master + proposalLoaded) | VERIFIED | service-worker.js L353: `await fireNotification('proposalLoaded', 'Proposal loaded')` inside `handleLoadProposal` |
| 4 | Error toast appears (gated by master + errors) | VERIFIED | service-worker.js L137 (PUSH_JOBS empty-guard), L358 (handleLoadProposal catch): both call `fireNotification('errors', ...)` |
| 5 | Popup shows inline status message (#ext-status) | PARTIAL | `showExtStatus()` defined (popup.js L72-85), `#ext-status` div in popup.html (L99), CSS present. Never called from any active handler. |
| 6 | Status messages auto-clear after 5 seconds | VERIFIED (code-level) | `extStatusTimer = setTimeout(() => { el.textContent = ''; el.className = 'ext-status'; }, 5000)` — correct, but not exercised by any real action |
| 7 | Master toggle suppresses all toasts | VERIFIED | `fireNotification()` L96-97: returns early if `notifications.master` is false |

**Score:** 4/7 plan 04-02 truths verified (2 partial, 1 failed)

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `src/utils/proposal.js` | ProposalManager with 7 public methods | Yes | Yes — 354 lines, all methods implemented | Yes — in manifest.json content_scripts before upwork-content.js | VERIFIED |
| `src/content/upwork-content.js` | Calls ProposalManager.init() | Yes | Yes — full content script | Yes — L554-556: guard + init() call | VERIFIED |
| `src/background/service-worker.js` | LOAD_PROPOSAL handler + fireNotification | Yes | Yes — full SW with all handlers | Yes — LOAD_PROPOSAL at L216, fireNotification at L92 | VERIFIED |
| `src/popup/popup.html` | #ext-status div as last child of #app | Yes | Yes — L99, inside #app before closing div | Yes — linked to popup.js | VERIFIED |
| `src/popup/popup.js` | showExtStatus() + extStatus els entry | Yes | Yes — L72-85 showExtStatus, L36 extStatus in els | PARTIAL — defined but never called by handlers | PARTIAL |
| `src/popup/popup.css` | .ext-status styles (hidden by default, visible on .visible) | Yes | Yes — max-height:0 default, max-height:60px on .visible, error color | Yes — linked from popup.html | VERIFIED |

### Key Link Verification

#### Plan 04-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/content/upwork-content.js` | `src/utils/proposal.js` | manifest injection order | WIRED | manifest.json L29: `proposal.js` listed before `upwork-content.js` in content_scripts; `typeof ProposalManager !== 'undefined'` guard at L554 |
| `src/utils/proposal.js` | `src/background/service-worker.js` | `chrome.runtime.sendMessage({ action: 'LOAD_PROPOSAL', jobData })` | WIRED | proposal.js L131 sends message; service-worker.js L216-219 handles LOAD_PROPOSAL and routes to handleLoadProposal |
| `src/background/service-worker.js` | n8n proposal webhook endpoint | `fetch(settings.proposalWebhookUrl, { method: 'POST', body: JSON.stringify(jobData) })` | WIRED | service-worker.js L331-335: reads `proposalWebhookUrl` from storage, POSTs jobData |
| `src/utils/proposal.js` | Upwork apply textarea | `document.querySelector('[data-test="cover-letter-text"]')` | WIRED | proposal.js L266-268: 3-selector fallback chain for textarea; L275-277: value set + input/change events dispatched |

#### Plan 04-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `service-worker.js (SCRAPE_SEARCH/alarm handler)` | `chrome.notifications API` | `fireNotification('scrapeComplete', ...)` | NOT_WIRED | `runScheduledScrape()` (L260-304) never calls fireNotification. Only the EXPORT_CSV handler has a scrapeComplete call. |
| `service-worker.js (PUSH_JOBS handler)` | `chrome.notifications API` | `fireNotification('webhookSent', ...)` | WIRED | service-worker.js L180: call present inside PUSH_JOBS success path |
| `service-worker.js (LOAD_PROPOSAL handler)` | `chrome.notifications API` | `fireNotification('proposalLoaded', ...)` | WIRED | service-worker.js L353: call present inside handleLoadProposal after sendResponse |
| `src/popup/popup.js (response callbacks)` | `src/popup/popup.html #ext-status` | `showExtStatus(message, 'success'|'error')` | NOT_WIRED | `showExtStatus()` defined but zero call-sites in any active event handler. Pattern comment exists at L256-273 but no actual wiring. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WEHK-03 | 04-01 | Extension loads AI-generated proposal text from n8n webhook on job apply page | SATISFIED | ProposalManager.loadProposal() → LOAD_PROPOSAL → handleLoadProposal() → fetch(proposalWebhookUrl) → renderPanel() |
| WEHK-04 | 04-01 | Extension pastes loaded proposal into apply form and copies to clipboard | SATISFIED | pasteProposal() sets textarea.value + dispatches input/change; copyProposal() uses navigator.clipboard.writeText() |
| INJC-03 | 04-01 | Extension adds proposal load button on job apply pages | SATISFIED | ProposalManager.init() called from upwork-content.js; isApplyPage() guards injection; injectButton() creates #ext-load-proposal-btn |
| NOTF-01 | 04-02 | Extension shows Windows toast notifications summarizing scrape actions | BLOCKED (partial) | fireNotification() exists and fires for webhookSent, proposalLoaded, errors. scrapeComplete only fires on CSV export, NOT on scheduled/alarm-triggered scrapes. |
| NOTF-02 | 04-02 | Extension shows status popups for webhook sends, proposal loads, and errors | BLOCKED (partial) | showExtStatus() and #ext-status div exist. No current popup action calls showExtStatus() — the user never sees this feedback from any real interaction. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/background/service-worker.js` | 200-201 | Comment placeholder: "Placeholder for SCRAPE_SEARCH success" and "Placeholder for SCRAPE_DETAIL success" inside EXPORT_CSV handler | Warning | Correct location noted but runScheduledScrape() is also missing a fireNotification call — the alarm path is completely unwired |
| `src/background/service-worker.js` | 100 | `iconUrl: chrome.runtime.getURL('icons/icon48.png')` — referencing `.png` while manifest.json lists `icon48.svg` as the 48px icon | Info | `icon48.png` does exist in the icons/ directory so this works at runtime, but is inconsistent with manifest icon declarations |
| `src/popup/popup.js` | 256-273 | Pattern comment block for `showExtStatus()` wiring — describes future use but no actual call-sites exist | Warning | NOTF-02 requirement partially met: infrastructure exists but feedback never surfaces to user |

### Human Verification Required

#### 1. Load Proposal end-to-end on live Upwork apply page

**Test:** Install extension in Chrome, navigate to any Upwork job apply page (URL contains `/jobs/*/apply`). Set `proposalWebhookUrl` in DevTools console: `chrome.storage.local.set({ proposalWebhookUrl: 'https://your-n8n-host/webhook/proposal' })`. With n8n running, click "Load Proposal" button.
**Expected:** Button shows "Loading...", proposal panel appears below with formatted text, "Paste into form" and "Copy to clipboard" buttons visible. Clicking Paste fills the cover letter textarea and the Upwork character counter updates. Clicking Copy writes text to clipboard (verify by pasting into Notepad).
**Why human:** Requires live Upwork apply page DOM, running n8n instance, and observation of React synthetic event propagation.

#### 2. Toast notification on scheduled alarm scrape

**Test:** Open Service Worker DevTools (chrome://extensions -> Service Worker link). Run `chrome.storage.local.set({'notifications.master': true, 'notifications.scrapeComplete': true})`. Trigger the alarm manually: `chrome.alarms.create('upwork-scrape-alarm', { delayInMinutes: 0.1 })` and wait.
**Expected:** After the alarm fires and runScheduledScrape() completes, a Windows toast notification should appear. (NOTE: Based on code analysis, this will NOT appear — the gap verification should confirm the toast is absent.)
**Why human:** Requires live Chrome environment with Upwork tab; alarm behavior cannot be tested in sandboxed environment.

#### 3. showExtStatus popup feedback

**Test:** Open popup, right-click -> Inspect. In DevTools console run: `showExtStatus('Webhook: sent 3 jobs', 'success')`.
**Expected:** Green status message appears below footer, disappears after 5 seconds.
**Why human:** Visual verification of CSS animation (max-height transition) and timing; must confirm no layout jump.

---

## Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — Missing scrapeComplete notification on alarm scrapes (NOTF-01 partial)**

The `runScheduledScrape()` function is the primary path through which the extension performs "scheduled scrapes" as described in the phase goal. It collects jobs from an Upwork search tab and stores them in `chrome.storage.local`. It never calls `fireNotification('scrapeComplete', ...)`. The `scrapeComplete` toast only fires on the CSV export path (`handleExportCsv`), which is a different user action than a scrape.

The plan acknowledged placeholder comments for SCRAPE_SEARCH and SCRAPE_DETAIL, but `runScheduledScrape()` is the actual scheduled scrape function and it has neither a call nor a placeholder comment. This is a one-line fix inside `runScheduledScrape()`.

**Gap 2 — showExtStatus never called by any popup action (NOTF-02 partial)**

`showExtStatus()` is fully implemented with the correct DOM target (`#ext-status`), CSS transitions, and 5-second auto-clear timer. However, not a single current popup event handler calls it. The `triggerScrape()` function uses `showScrapeStatus()` (a separate `#scrape-status` element), and `sendExportCsv()` uses `showStatus()` (the `#save-status` element). The user never sees `#ext-status` feedback during any real interaction.

The plan describes this as infrastructure for future popup action buttons (phases 2-3), but the ROADMAP success criterion 5 states this feedback should exist for "webhook sends, proposal loads, and errors." The minimum fix is wiring `showExtStatus()` into at least one of: `triggerScrape()` (on scrape result), `sendExportCsv()` (on export result), or any handler that receives a service worker response.

---

_Verified: 2026-02-18T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
