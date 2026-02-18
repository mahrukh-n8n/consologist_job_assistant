# Roadmap: Upwork Chrome Extension

## Overview

Build a Chrome extension (Manifest V3, JavaScript) that scrapes Upwork job data, pushes it to n8n webhooks, overlays color-coded match icons on search results, and delivers AI-generated proposals on job detail pages — all within the browser, without any external tooling. Four phases take the project from an installable extension shell to a fully working proposal workflow.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Installable extension with settings UI and all required permissions wired up
- [x] **Phase 2: Scraping Engine** - DOM scraping works on search and detail pages, on-demand and on schedule (completed 2026-02-18)
- [x] **Phase 3: Webhook Integration and Search Overlay** - Job data flows to n8n, match icons appear, CSV export works (completed 2026-02-18)
- [x] **Phase 4: Proposal Workflow and Notifications** - Proposals load on detail pages, paste and clipboard work, notifications fire (completed 2026-02-18)

## Phase Details

### Phase 1: Foundation
**Goal**: The extension is installable, all permissions are granted, and the user can configure webhook URL, schedule interval, and output format before any scraping begins
**Depends on**: Nothing (first phase)
**Requirements**: SETT-01, SETT-02, SETT-03, SETT-04
**Success Criteria** (what must be TRUE):
  1. User can install the extension in Chrome without errors and see it in the toolbar
  2. User can open the popup and enter an n8n webhook URL that persists after closing
  3. User can set a scrape schedule interval (e.g., every 30 minutes) that saves to storage
  4. User can select output format (webhook, CSV, or both) and the preference is saved
  5. Extension requests correct permissions (activeTab, storage, notifications, downloads, Upwork host permissions) at install
  6. User can enable/disable notifications and select which types to show (scrape complete, webhook sent, proposal loaded, errors) via checkboxes
**Plans**: TBD

Plans:
- [x] 01-01: Manifest V3 scaffold — manifest.json, service worker registration, content script declarations, permission set
- [ ] 01-02: Settings UI — popup HTML/JS with webhook URL input, schedule interval selector, output format toggle backed by chrome.storage.local

### Phase 2: Scraping Engine
**Goal**: The extension can extract complete job data from Upwork search and detail pages, both on user demand and on a configurable timer, with field names matching the reference project exactly
**Depends on**: Phase 1
**Requirements**: SCRP-01, SCRP-02, SCRP-03, SCRP-04
**Success Criteria** (what must be TRUE):
  1. User clicks the scrape button in the popup and the extension returns job IDs, titles, and URLs from the current search results page
  2. On a job detail page, the extension extracts description, budget, skills, experience level, duration, posted date, proposals count, and full client info
  3. All extracted field names match the reference project exactly (case-sensitive): job_id, title, url, description, budget, payment_type, skills, experience_level, project_duration, posted_date, proposals_count, client_payment_verified, client_location, client_rating, client_total_spent
  4. Extension runs a background scrape automatically at the user-configured interval without the popup being open
**Plans**: 4 plans (3 original + 1 gap closure)

Plans:
- [x] 02-01: Search page scraper — content script that extracts job list data (IDs, titles, URLs) from search result DOM
- [x] 02-02: Detail page scraper — content script that extracts full job fields from job detail page DOM
- [x] 02-03: Scheduled scraping — service worker with chrome.alarms wired to trigger scrape at configured interval
- [ ] 02-04: Gap closure — popup scrape button (SCRP-03) and detail scraper wiring into content script (SCRP-02)

### Phase 3: Webhook Integration and Search Overlay
**Goal**: Scraped job data reaches n8n and the user sees color-coded match icons on search results without leaving Upwork; scraped data can also be saved as a CSV file
**Depends on**: Phase 2
**Requirements**: WEHK-01, WEHK-02, INJC-01, INJC-02, EXPT-01, EXPT-02
**Success Criteria** (what must be TRUE):
  1. After a scrape, job data is posted to the configured n8n webhook URL with field names matching the reference project exactly (case-sensitive)
  2. On search page load, job IDs are sent to n8n and green/red/blue icons appear on each job card within a visible delay based on n8n's match/applied response
  3. User can save scraped data as a CSV file to the downloads folder with column headers matching the reference project exactly (case-sensitive)
  4. User can choose webhook-only, CSV-only, or both output modes and both behave correctly for their selection
  5. A scrape button appears on job detail pages so the user can push a single job directly from the detail view
**Plans**: TBD

Plans:
- [x] 03-01: Webhook push — service worker sends scraped payload to configured n8n URL; handles response and routes match/applied status back to content script
- [x] 03-02: Search page icon overlay — content script injects green/red/blue status icons on job cards based on webhook response
- [x] 03-03: CSV export — generates CSV with reference-matching headers and triggers chrome.downloads to save to downloads folder

### Phase 4: Proposal Workflow and Notifications
**Goal**: The user can load an AI-generated proposal from n8n on a job apply page, paste it directly into the Upwork form or copy it to clipboard, and receive Windows toast notifications summarizing what the extension has done
**Depends on**: Phase 3
**Requirements**: WEHK-03, WEHK-04, INJC-03, NOTF-01, NOTF-02
**Success Criteria** (what must be TRUE):
  1. A "Load Proposal" button appears on Upwork job apply pages and clicking it sends a request to n8n and displays the returned proposal text
  2. User can click a "Paste" button to insert the loaded proposal directly into the Upwork apply description field
  3. User can click a "Copy" button to copy the proposal text to the clipboard as a fallback
  4. After each scheduled or on-demand scrape, a Windows toast notification appears summarizing how many jobs were scraped and where data was sent
  5. Status feedback appears in the popup for webhook sends, proposal loads, and errors so the user always knows what the extension is doing
**Plans**: TBD

Plans:
- [x] 04-01: Proposal loading — content script on apply pages adds Load Proposal button, fetches from n8n, renders result with Paste and Copy actions
- [x] 04-02: Notifications and status — service worker fires chrome.notifications for scrape summaries; popup shows inline status messages for webhook and proposal actions

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-02-18 |
| 2. Scraping Engine | 4/4 | Complete | 2026-02-18 |
| 3. Webhook Integration and Search Overlay | 3/3 | Complete | 2026-02-18 |
| 4. Proposal Workflow and Notifications | 2/2 | Complete | 2026-02-18 |
