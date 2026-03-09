---
description: Chrome extension architecture rules — content scripts, service worker, manifest
---

# Chrome Extension Rules

## Content Script vs Module Files

**Rule:** Chrome content scripts cannot use ES module imports. This project inlines scraper logic inside `upwork-content.js`.

- `src/content/upwork-content.js` — **LIVE** file, registered in manifest.json, actually runs in tabs
- `src/content/detail-scraper.js` — **REFERENCE** file, never loaded by the browser directly

**When updating scraping logic (selectors, field extraction):**
1. Edit `src/content/upwork-content.js` — this is what runs
2. Mirror the same change to `src/content/detail-scraper.js` to keep reference in sync
3. Never edit only `detail-scraper.js` — changes there have zero runtime effect

## Service Worker

- `src/background/service-worker.js` — MV3 service worker, no persistent memory, all state in `chrome.storage.local`
- Alarm names: `upwork-scrape-alarm` (scheduled scrape) and `cron-{id}` (user crons)
- Cron jobs are independent of `scheduledScrapeEnabled` toggle

## Manifest Permissions

Required permissions for this extension:
- `"scripting"` — needed for `chrome.scripting.executeScript` from popup
- `"activeTab"` — needed to target the current tab
- `"alarms"` — cron scheduling
- `"notifications"` — Windows notifications
- `"storage"` — all persistence

## CSP Rules

MV3 enforces `script-src 'self'` — **never** use:
- `new Function(codeString)`
- `eval()`
- Dynamic string-based script injection

For `executeScript`, always pass a real named function: `func: myFunction` not `func: new Function(...)`.
