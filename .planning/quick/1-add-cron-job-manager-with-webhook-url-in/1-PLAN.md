---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/background/service-worker.js
  - src/popup/popup.html
  - src/popup/popup.js
  - src/popup/popup.css
autonomous: true
requirements: [CRON-01, CRON-02, CRON-03]

must_haves:
  truths:
    - "User can create a named cron job with a webhook URL and interval (minutes)"
    - "Cron jobs are stored in chrome.storage.local under key 'cronJobs' as an array"
    - "Each cron job fires a chrome.alarm on its interval, alarm name is 'cron-{id}'"
    - "When alarm fires, SW POSTs to the cron's webhookUrl and receives an array of Upwork job IDs"
    - "SW scrapes each returned job ID via its Upwork detail page (reusing scrapeJobDetails)"
    - "User sees all saved crons in a list with a Delete button per cron"
    - "Windows notifications fire when a cron alarm triggers and when scraping for that cron completes"
  artifacts:
    - path: "src/background/service-worker.js"
      provides: "Cron alarm handling, cron webhook POST, cron scrape orchestration"
    - path: "src/popup/popup.html"
      provides: "Cron manager section: form + list view"
    - path: "src/popup/popup.js"
      provides: "Save cron, load list, delete cron, message SW to register/cancel alarm"
    - path: "src/popup/popup.css"
      provides: "Styles for cron list, form inputs, delete buttons"
  key_links:
    - from: "popup.js (saveCron)"
      to: "chrome.storage.local cronJobs array"
      via: "chrome.storage.local.get/set"
    - from: "popup.js (saveCron)"
      to: "service-worker.js (REGISTER_CRON_ALARM)"
      via: "chrome.runtime.sendMessage"
    - from: "service-worker.js chrome.alarms.onAlarm"
      to: "runCronJob(cronId)"
      via: "alarm.name startsWith 'cron-'"
    - from: "runCronJob"
      to: "cron.webhookUrl POST"
      via: "fetch, expects JSON array of job ID strings"
    - from: "runCronJob job IDs"
      to: "scrapeJobDetails(searchJobs)"
      via: "construct job stubs {job_id, url} from IDs"
---

<objective>
Add a cron job manager to the extension: a form in the popup to create named cron jobs (webhook URL + interval), persistent storage, chrome.alarm-based firing, webhook-driven job ID scraping, list/delete UI, and notifications.

Purpose: Let users configure multiple independent scrape schedules driven by external webhooks that return which Upwork job IDs to scrape.
Output: New "Cron Jobs" section in popup, cron alarm handling in SW, full scrape + notify cycle per cron.
</objective>

<execution_context>
@C:/Users/Glorvax/.claude/get-shit-right/workflows/execute-plan.md
</execution_context>

<context>
@src/background/service-worker.js
@src/popup/popup.html
@src/popup/popup.js
@src/popup/popup.css
</context>

<tasks>

<task type="auto">
  <name>Task 1: Service worker — cron alarm registration, firing, and scrape orchestration</name>
  <files>src/background/service-worker.js</files>
  <action>
Add cron job support to service-worker.js. All changes are additive — do not touch existing ALARM_NAME or runScheduledScrape logic.

**Storage schema** (chrome.storage.local key `cronJobs`):
```js
// Array of:
{
  id: string,          // crypto.randomUUID() or Date.now().toString()
  name: string,
  webhookUrl: string,
  intervalMinutes: number,
  createdAt: string,   // ISO timestamp
}
```

**1. Restore cron alarms on startup/install.**
After the existing `registerAlarmFromStorage()` call in `chrome.runtime.onInstalled` and `onStartup` listeners, also call `registerAllCronAlarms()`.

Add function:
```js
async function registerAllCronAlarms() {
  const { cronJobs = [] } = await chrome.storage.local.get({ cronJobs: [] });
  for (const cron of cronJobs) {
    const alarmName = 'cron-' + cron.id;
    await chrome.alarms.clear(alarmName);
    chrome.alarms.create(alarmName, {
      delayInMinutes: cron.intervalMinutes,
      periodInMinutes: cron.intervalMinutes,
    });
  }
}
```

**2. Handle cron alarms in chrome.alarms.onAlarm.**
In the existing `chrome.alarms.onAlarm.addListener` callback, add a branch after the ALARM_NAME check:
```js
if (alarm.name.startsWith('cron-')) {
  const cronId = alarm.name.slice(5);
  await runCronJob(cronId);
  return;
}
```

**3. Add `runCronJob(cronId)` function.**
```js
async function runCronJob(cronId) {
  const { cronJobs = [] } = await chrome.storage.local.get({ cronJobs: [] });
  const cron = cronJobs.find(c => c.id === cronId);
  if (!cron) {
    console.warn('[SW] runCronJob: cron not found', cronId);
    return;
  }
  await fireNotification('scrapeComplete', `Cron "${cron.name}" fired — fetching job IDs`);

  // POST to cron webhook, expect JSON array of job ID strings
  let jobIds = [];
  try {
    const res = await fetch(cron.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cronId: cron.id, name: cron.name }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    jobIds = await res.json();
    if (!Array.isArray(jobIds)) throw new Error('Response is not an array');
  } catch (err) {
    console.error('[SW] runCronJob: webhook failed', err.message);
    await fireNotification('errors', `Cron "${cron.name}": webhook failed — ${err.message}`);
    return;
  }

  if (jobIds.length === 0) {
    await fireNotification('scrapeComplete', `Cron "${cron.name}": webhook returned 0 job IDs`);
    return;
  }

  // Build job stubs for scrapeJobDetails (needs {url} at minimum; job_id is bonus)
  const searchJobs = jobIds.map(id => ({
    job_id: id,
    url: `https://www.upwork.com/jobs/~${id}`,
    title: '',
  }));

  const detailedJobs = await scrapeJobDetails(searchJobs);
  if (detailedJobs.length > 0) {
    await chrome.storage.local.set({ lastScrapedJobs: detailedJobs, lastScrapeTime: new Date().toISOString() });
    await dispatchJobsBatch(detailedJobs);
  }
  await fireNotification('scrapeComplete', `Cron "${cron.name}": scraped ${detailedJobs.length} jobs`);
}
```

**4. Add message handlers in chrome.runtime.onMessage for:**

`REGISTER_CRON_ALARM` — called by popup when user saves a new cron:
```js
if (message.action === 'REGISTER_CRON_ALARM') {
  const { cron } = message;
  const alarmName = 'cron-' + cron.id;
  await chrome.alarms.clear(alarmName);
  chrome.alarms.create(alarmName, {
    delayInMinutes: cron.intervalMinutes,
    periodInMinutes: cron.intervalMinutes,
  });
  sendResponse({ success: true });
  return true;
}
```

`DELETE_CRON_ALARM` — called by popup when user deletes a cron:
```js
if (message.action === 'DELETE_CRON_ALARM') {
  await chrome.alarms.clear('cron-' + message.cronId);
  sendResponse({ success: true });
  return true;
}
```

Each handler must `return true` to keep the message channel open for async responses. Add them before the final `return false` in the message router.
  </action>
  <wiring_checks>
    - file: src/background/service-worker.js
      pattern: "registerAllCronAlarms"
      description: "registerAllCronAlarms function defined and called"
    - file: src/background/service-worker.js
      pattern: "alarm\.name\.startsWith\('cron-'\)"
      description: "cron alarm branch in onAlarm listener"
    - file: src/background/service-worker.js
      pattern: "runCronJob"
      description: "runCronJob function defined"
    - file: src/background/service-worker.js
      pattern: "REGISTER_CRON_ALARM"
      description: "REGISTER_CRON_ALARM message handler"
    - file: src/background/service-worker.js
      pattern: "DELETE_CRON_ALARM"
      description: "DELETE_CRON_ALARM message handler"
  </wiring_checks>
  <verify>Load the extension in chrome://extensions, open SW DevTools console. Run: chrome.storage.local.set({cronJobs:[{id:'test1',name:'Test',webhookUrl:'https://httpbin.org/post',intervalMinutes:1,createdAt:new Date().toISOString()}]}) then registerAllCronAlarms(). Check chrome.alarms.getAll() shows 'cron-test1'.</verify>
  <done>SW registers cron alarms on startup, fires runCronJob when alarm triggers, handles REGISTER_CRON_ALARM and DELETE_CRON_ALARM messages from popup.</done>
</task>

<task type="auto">
  <name>Task 2: Popup UI — cron manager form and list (HTML + JS + CSS)</name>
  <files>src/popup/popup.html, src/popup/popup.js, src/popup/popup.css</files>
  <action>
**popup.html** — Add a new section after the existing footer (before the closing `</div>` of `#app`):

```html
<!-- CRON-01: Cron job manager -->
<section class="setting-group cron-manager">
  <span class="label">Cron Jobs</span>

  <div class="cron-form">
    <input
      type="text"
      id="cron-name"
      placeholder="Job name (e.g. Frontend jobs)"
      autocomplete="off"
    >
    <input
      type="url"
      id="cron-webhook"
      placeholder="Webhook URL (returns job ID array)"
      autocomplete="off"
      spellcheck="false"
    >
    <input
      type="number"
      id="cron-interval"
      placeholder="Interval (minutes)"
      min="1"
      max="1440"
      value="30"
    >
    <button id="cron-add-btn" type="button">Add Cron</button>
    <div id="cron-status" class="save-status" aria-live="polite"></div>
  </div>

  <ul id="cron-list" class="cron-list" aria-label="Saved cron jobs"></ul>
</section>
```

Place this inside `<main>` after the last existing `<section>` and before `</main>`.

---

**popup.js** — Add cron manager logic at the bottom of the file, after all existing code:

```js
// ─── Cron Job Manager (CRON-01) ───────────────────────────────────────────────

function showCronStatus(message, isError = false) {
  const el = document.getElementById('cron-status');
  if (!el) return;
  el.textContent = message;
  el.className = 'save-status' + (isError ? ' error' : '');
  setTimeout(() => { if (el.textContent === message) { el.textContent = ''; el.className = 'save-status'; } }, 3000);
}

async function loadCronList() {
  const { cronJobs = [] } = await chrome.storage.local.get({ cronJobs: [] });
  const list = document.getElementById('cron-list');
  if (!list) return;
  list.innerHTML = '';
  if (cronJobs.length === 0) {
    list.innerHTML = '<li class="cron-empty">No cron jobs saved.</li>';
    return;
  }
  for (const cron of cronJobs) {
    const li = document.createElement('li');
    li.className = 'cron-item';
    li.dataset.cronId = cron.id;
    li.innerHTML = `
      <div class="cron-info">
        <strong class="cron-name">${escapeHtml(cron.name)}</strong>
        <span class="cron-interval">every ${cron.intervalMinutes} min</span>
        <span class="cron-url" title="${escapeHtml(cron.webhookUrl)}">${escapeHtml(truncate(cron.webhookUrl, 40))}</span>
      </div>
      <button class="cron-delete-btn" data-id="${cron.id}" type="button" aria-label="Delete ${escapeHtml(cron.name)}">Delete</button>
    `;
    list.appendChild(li);
  }
  // Wire delete buttons
  list.querySelectorAll('.cron-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteCron(btn.dataset.id));
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

async function addCron() {
  const name = document.getElementById('cron-name')?.value.trim();
  const webhookUrl = document.getElementById('cron-webhook')?.value.trim();
  const intervalMinutes = parseInt(document.getElementById('cron-interval')?.value, 10);

  if (!name) { showCronStatus('Name is required', true); return; }
  if (!webhookUrl || !webhookUrl.startsWith('http')) { showCronStatus('Valid webhook URL required', true); return; }
  if (!intervalMinutes || intervalMinutes < 1) { showCronStatus('Interval must be >= 1 minute', true); return; }

  const cron = {
    id: Date.now().toString(),
    name,
    webhookUrl,
    intervalMinutes,
    createdAt: new Date().toISOString(),
  };

  const { cronJobs = [] } = await chrome.storage.local.get({ cronJobs: [] });
  cronJobs.push(cron);
  await chrome.storage.local.set({ cronJobs });

  // Ask SW to register the alarm
  chrome.runtime.sendMessage({ action: 'REGISTER_CRON_ALARM', cron });

  // Reset form
  document.getElementById('cron-name').value = '';
  document.getElementById('cron-webhook').value = '';
  document.getElementById('cron-interval').value = '30';

  showCronStatus(`Cron "${name}" saved`);
  await loadCronList();
}

async function deleteCron(cronId) {
  const { cronJobs = [] } = await chrome.storage.local.get({ cronJobs: [] });
  const updated = cronJobs.filter(c => c.id !== cronId);
  await chrome.storage.local.set({ cronJobs: updated });
  chrome.runtime.sendMessage({ action: 'DELETE_CRON_ALARM', cronId });
  await loadCronList();
}

// Wire up on DOMContentLoaded (add listener; existing DOMContentLoaded wires other things)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cron-add-btn')?.addEventListener('click', addCron);
  loadCronList();
});
```

Note: The existing code already has a `DOMContentLoaded` listener. Add a SECOND listener — multiple DOMContentLoaded listeners are supported and all fire. Do NOT merge into the existing listener to minimize diff risk.

---

**popup.css** — Append at the bottom of the file:

```css
/* ─── Cron Job Manager ─────────────────────────────────────────────────── */
.cron-manager {
  margin-top: 16px;
}

.cron-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.cron-form input {
  padding: 6px 8px;
  border: 1px solid var(--border, #ccc);
  border-radius: 4px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}

#cron-add-btn {
  align-self: flex-start;
  padding: 6px 14px;
  background: var(--accent, #14a800);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

#cron-add-btn:hover {
  opacity: 0.85;
}

.cron-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cron-empty {
  color: var(--muted, #888);
  font-size: 12px;
}

.cron-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--surface, #f8f8f8);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 4px;
  gap: 8px;
}

.cron-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cron-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cron-interval {
  font-size: 11px;
  color: var(--muted, #666);
}

.cron-url {
  font-size: 11px;
  color: var(--muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.cron-delete-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--danger, #c00);
  color: var(--danger, #c00);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.cron-delete-btn:hover {
  background: var(--danger, #c00);
  color: #fff;
}
```
  </action>
  <wiring_checks>
    - file: src/popup/popup.html
      pattern: "cron-add-btn"
      description: "Add Cron button in HTML"
    - file: src/popup/popup.html
      pattern: "cron-list"
      description: "cron-list ul element"
    - file: src/popup/popup.js
      pattern: "REGISTER_CRON_ALARM"
      description: "popup.js sends REGISTER_CRON_ALARM to SW"
    - file: src/popup/popup.js
      pattern: "DELETE_CRON_ALARM"
      description: "popup.js sends DELETE_CRON_ALARM to SW"
    - file: src/popup/popup.js
      pattern: "loadCronList"
      description: "loadCronList function defined and wired"
    - file: src/popup/popup.css
      pattern: "cron-item"
      description: "cron-item CSS class defined"
  </wiring_checks>
  <verify>
1. Load extension. Open popup. Confirm "Cron Jobs" section is visible with form fields and "Add Cron" button.
2. Fill in name="Test", webhookUrl="https://example.com/hook", interval=5. Click "Add Cron". Confirm item appears in list below.
3. Click Delete on the item. Confirm it disappears from list.
4. In SW DevTools: chrome.alarms.getAll() should show/not show 'cron-{id}' matching created/deleted crons.
  </verify>
  <done>User can add named cron jobs via popup form, see them listed, delete them. Each add/delete syncs chrome.alarms via SW messages.</done>
</task>

</tasks>

<verification>
- chrome.alarms.getAll() in SW DevTools shows 'cron-{id}' for each saved cron and the existing 'upwork-scrape-alarm'
- Manually triggering a cron alarm (chrome.alarms.create('cron-test', {delayInMinutes:0.1}) with a matching cronJobs entry) calls runCronJob, POSTs to webhook, scrapes returned IDs, fires notifications
- Popup list renders all cronJobs from storage on open
- Delete removes from storage and cancels alarm
- No regression to existing scheduled scrape (ALARM_NAME path untouched)
</verification>

<success_criteria>
- Named cron jobs persist across extension restarts (alarms re-registered on onInstalled/onStartup)
- SW correctly branches on alarm.name.startsWith('cron-') vs the existing ALARM_NAME constant
- runCronJob: POSTs to webhook URL, parses job ID array, constructs Upwork detail URLs, calls scrapeJobDetails, dispatches via dispatchJobsBatch, fires two notifications (fired + complete)
- Popup list/delete UI functional with no JS errors
</success_criteria>

<output>
After completion, create `.planning/quick/1-add-cron-job-manager-with-webhook-url-in/1-SUMMARY.md`
</output>
