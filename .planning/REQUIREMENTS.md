# Requirements: Upwork Chrome Extension

**Defined:** 2026-02-17
**Core Value:** Instantly see which Upwork jobs match your criteria and have proposal-ready workflows — without leaving the Upwork page.

## v1 Requirements

### Scraping

- [ ] **SCRP-01**: Extension can extract job IDs, titles, and URLs from Upwork search result pages
- [ ] **SCRP-02**: Extension can extract full job data from detail pages (description, budget, skills, experience level, duration, posted date, proposals count, client info)
- [ ] **SCRP-03**: User can trigger on-demand scrape via extension popup button
- [ ] **SCRP-04**: Extension runs scheduled scrapes via background service worker and chrome.alarms

### Webhook

- [ ] **WEHK-01**: Extension pushes scraped job data to configurable n8n webhook URL
- [ ] **WEHK-02**: Extension sends all job IDs on search page load to n8n and receives match/applied status
- [ ] **WEHK-03**: Extension loads AI-generated proposal text from n8n webhook on job detail/apply page
- [ ] **WEHK-04**: Extension pastes loaded proposal into Upwork apply description field and copies to clipboard

### Page Injection

- [ ] **INJC-01**: Extension injects green/red/blue icons on search result jobs based on n8n match response
- [ ] **INJC-02**: Extension adds scrape button on job detail pages
- [ ] **INJC-03**: Extension adds proposal load button on job apply pages

### Data Export

- [ ] **EXPT-01**: Extension saves scraped data as CSV file to downloads folder
- [ ] **EXPT-02**: User can choose output method (webhook, CSV, or both) in settings

### Notifications

- [ ] **NOTF-01**: Extension shows Windows toast notifications summarizing scrape actions
- [ ] **NOTF-02**: Extension shows status popups for webhook sends, proposal loads, and errors

### Settings

- [ ] **SETT-01**: User can configure n8n webhook URL in extension popup/options
- [ ] **SETT-02**: User can configure scraping schedule interval
- [ ] **SETT-03**: User can configure output format preference (webhook/CSV/both)
- [ ] **SETT-04**: User can enable/disable Windows notifications and select which notification types to show (scrape complete, webhook sent, proposal loaded, errors) via checkboxes

## v2 Requirements

### Advanced Scraping

- **SCRP-05**: Extension can scrape multiple search result pages (pagination)
- **SCRP-06**: Extension can filter jobs by criteria before pushing to webhook

### Advanced Integration

- **WEHK-05**: Extension supports multiple webhook endpoints
- **WEHK-06**: Extension caches proposal responses for offline access

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloudflare bypass | Extension reads already-loaded pages, no anti-bot needed |
| SQLite database | Chrome extension uses chrome.storage, not local DB |
| Desktop GUI (PyQt6) | Extension popup is the UI |
| Python backend | Pure JavaScript Chrome extension |
| OAuth/login management | User is already logged into Upwork in browser |
| Mobile support | Chrome desktop extension only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETT-01 | Phase 1 | Pending |
| SETT-02 | Phase 1 | Pending |
| SETT-03 | Phase 1 | Pending |
| SETT-04 | Phase 1 | Pending |
| SCRP-01 | Phase 2 | Pending |
| SCRP-02 | Phase 2 | Pending |
| SCRP-03 | Phase 2 | Pending |
| SCRP-04 | Phase 2 | Pending |
| WEHK-01 | Phase 3 | Pending |
| WEHK-02 | Phase 3 | Pending |
| INJC-01 | Phase 3 | Pending |
| INJC-02 | Phase 3 | Pending |
| EXPT-01 | Phase 3 | Pending |
| EXPT-02 | Phase 3 | Pending |
| WEHK-03 | Phase 4 | Pending |
| WEHK-04 | Phase 4 | Pending |
| INJC-03 | Phase 4 | Pending |
| NOTF-01 | Phase 4 | Pending |
| NOTF-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after roadmap creation*
