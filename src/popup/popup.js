// Upwork Job Scraper — Popup Settings
// Pattern: NotificationManager safe-fail (global class registry) adapted for chrome.storage
// All storage operations wrapped in try/catch — errors shown in UI, never crash popup

// ─── Default values ──────────────────────────────────────────────────────────
const DEFAULTS = {
  webhookUrl: '',
  proposalWebhookUrl: '',
  scheduleInterval: 30,
  scheduledScrapeEnabled: true,
  searchUrl: '',
  cfWaitSeconds: 5,
  webhookRetries: 0,
  outputFormat: 'both',
  notifications: {
    master: true,
    scrapeComplete: true,
    webhookSent: true,
    proposalLoaded: true,
    errors: true,
  },
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const els = {
  webhookUrl:          () => document.getElementById('webhook-url'),
  proposalWebhookUrl:  () => document.getElementById('proposal-webhook-url'),
  scheduleInterval:          () => document.getElementById('schedule-interval'),
  scheduledScrapeEnabled:    () => document.getElementById('scheduled-scrape-enabled'),
  searchUrl:                 () => document.getElementById('search-url'),
  cfWait:                    () => document.getElementById('cf-wait'),
  webhookRetries:            () => document.getElementById('webhook-retries'),
  outputFormat:        () => document.querySelector('input[name="outputFormat"]:checked'),
  outputFormatAll:     () => document.querySelectorAll('input[name="outputFormat"]'),
  notifMaster:         () => document.getElementById('notif-master'),
  notifSubtypes:       () => document.getElementById('notif-subtypes'),
  notifScrapeComplete: () => document.getElementById('notif-scrape-complete'),
  notifWebhookSent:    () => document.getElementById('notif-webhook-sent'),
  notifProposalLoaded: () => document.getElementById('notif-proposal-loaded'),
  notifErrors:         () => document.getElementById('notif-errors'),
  saveBtn:             () => document.getElementById('save-btn'),
  saveStatus:          () => document.getElementById('save-status'),
  scrapeBtn:           () => document.getElementById('scrape-btn'),
  scrapeStatus:        () => document.getElementById('scrape-status'),
  exportCsvBtn:        () => document.getElementById('export-csv-btn'),
  extStatus:           () => document.getElementById('ext-status'),
};

// ─── Status display ───────────────────────────────────────────────────────────
function showStatus(message, isError = false) {
  const el = els.saveStatus();
  el.textContent = message;
  el.className = 'save-status' + (isError ? ' error' : '');
  // Auto-clear after 2.5s
  setTimeout(() => {
    if (el.textContent === message) {
      el.textContent = '';
      el.className = 'save-status';
    }
  }, 2500);
}

// ─── Scrape status display ────────────────────────────────────────────────────
function showScrapeStatus(message, isError = false, persistent = false) {
  const el = els.scrapeStatus();
  el.textContent = message;
  el.className = 'save-status' + (isError ? ' error' : '');
  if (!persistent) {
    setTimeout(() => {
      if (el.textContent === message) { el.textContent = ''; el.className = 'save-status'; }
    }, 2500);
  }
}

// ─── Extension action status (NOTF-02) ────────────────────────────────────────
// Shows service worker response feedback (webhook, proposal, errors).
// Distinct from showStatus() which is for save-button feedback only.
let extStatusTimer = null;

function showExtStatus(message, type = 'success') {
  const el = document.getElementById('ext-status');
  if (!el) return;
  el.textContent = message;
  el.className = 'ext-status visible' + (type === 'error' ? ' error' : '');
  // Cancel any pending auto-clear
  if (extStatusTimer) clearTimeout(extStatusTimer);
  // Auto-clear after 5 seconds
  extStatusTimer = setTimeout(() => {
    el.textContent = '';
    el.className = 'ext-status';
    extStatusTimer = null;
  }, 5000);
}

// ─── On-demand scrape trigger ─────────────────────────────────────────────────
async function triggerScrape() {
  const btn = els.scrapeBtn();
  btn.disabled = true;
  btn.textContent = 'Scraping...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { showScrapeStatus('No active tab found', true); return; }

    const isSearchPage = tab.url &&
      (tab.url.includes('upwork.com/nx/search/jobs') || tab.url.includes('upwork.com/ab/jobs/search'));
    if (!isSearchPage) {
      showScrapeStatus('Open an Upwork job search page first', true);
      showExtStatus('Navigate to Upwork search results first', 'error');
      return;
    }

    const searchRes = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeSearch' });
    const searchJobs = searchRes?.jobs || [];
    if (searchJobs.length === 0) {
      showScrapeStatus('No jobs found on search page', true);
      showExtStatus('No jobs found on search page', 'error');
      return;
    }

    showScrapeStatus(`Found ${searchJobs.length} jobs — scraping details in background...`, false, true);
    showExtStatus(`Scraping ${searchJobs.length} job details in background...`, 'success');

    chrome.runtime.sendMessage({ action: 'RUN_DETAIL_SCRAPE', jobs: searchJobs }, (res) => {
      if (chrome.runtime.lastError) {
        showScrapeStatus('Failed to hand off to background', true);
        showExtStatus('Background scrape failed to start', 'error');
      }
    });
  } catch (err) {
    console.error('[Popup] triggerScrape failed:', err);
    showScrapeStatus('Scrape failed — open an Upwork search page', true);
    showExtStatus('Scrape failed — open an Upwork search page', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scrape Now';
  }
}

// ─── CSV export trigger ───────────────────────────────────────────────────────
async function sendExportCsv() {
  const btn = els.exportCsvBtn();
  btn.disabled = true;
  btn.textContent = 'Exporting...';
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'EXPORT_CSV' }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, message: chrome.runtime.lastError.message });
        } else {
          resolve(res);
        }
      });
    });

    if (response?.success) {
      showStatus('Exported ' + (response.count ?? '') + ' jobs');
    } else if (response?.reason === 'csv_disabled') {
      showStatus('CSV export is off — change Output Format to CSV or Both', true);
    } else if (response?.reason === 'no_data') {
      showStatus('No data to export — run a scrape first', true);
    } else {
      showStatus(response?.message ?? 'Export failed', true);
    }
  } catch (err) {
    console.error('[Popup] Export CSV error:', err);
    showStatus('Export failed', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export CSV';
  }
}

// ─── Master toggle — dims subtypes when disabled ───────────────────────────
function applyMasterToggleState(masterChecked) {
  const subtypes = els.notifSubtypes();
  if (masterChecked) {
    subtypes.classList.remove('disabled');
  } else {
    subtypes.classList.add('disabled');
  }
}

// ─── Load settings from storage ──────────────────────────────────────────────
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(null); // get all keys

    // Merge stored values over defaults (deep merge for notifications object)
    const settings = {
      webhookUrl:             stored.webhookUrl             ?? DEFAULTS.webhookUrl,
      proposalWebhookUrl:     stored.proposalWebhookUrl     ?? DEFAULTS.proposalWebhookUrl,
      scheduleInterval:       stored.scheduleInterval       ?? DEFAULTS.scheduleInterval,
      scheduledScrapeEnabled: stored.scheduledScrapeEnabled ?? DEFAULTS.scheduledScrapeEnabled,
      searchUrl:              stored.searchUrl              ?? DEFAULTS.searchUrl,
      cfWaitSeconds:          stored.cfWaitSeconds          ?? DEFAULTS.cfWaitSeconds,
      webhookRetries:         stored.webhookRetries         ?? DEFAULTS.webhookRetries,
      outputFormat:           stored.outputFormat           ?? DEFAULTS.outputFormat,
      notifications: {
        master:          stored['notifications.master']         ?? DEFAULTS.notifications.master,
        scrapeComplete:  stored['notifications.scrapeComplete'] ?? DEFAULTS.notifications.scrapeComplete,
        webhookSent:     stored['notifications.webhookSent']    ?? DEFAULTS.notifications.webhookSent,
        proposalLoaded:  stored['notifications.proposalLoaded'] ?? DEFAULTS.notifications.proposalLoaded,
        errors:          stored['notifications.errors']         ?? DEFAULTS.notifications.errors,
      },
    };

    // Apply to DOM
    els.webhookUrl().value = settings.webhookUrl;
    els.proposalWebhookUrl().value = settings.proposalWebhookUrl;

    els.scheduleInterval().value = String(settings.scheduleInterval);
    els.scheduledScrapeEnabled().checked = settings.scheduledScrapeEnabled;
    els.searchUrl().value = settings.searchUrl;
    els.cfWait().value = String(settings.cfWaitSeconds);
    els.webhookRetries().value = String(settings.webhookRetries);

    els.outputFormatAll().forEach(radio => {
      radio.checked = (radio.value === settings.outputFormat);
    });

    els.notifMaster().checked        = settings.notifications.master;
    els.notifScrapeComplete().checked = settings.notifications.scrapeComplete;
    els.notifWebhookSent().checked    = settings.notifications.webhookSent;
    els.notifProposalLoaded().checked = settings.notifications.proposalLoaded;
    els.notifErrors().checked         = settings.notifications.errors;

    applyMasterToggleState(settings.notifications.master);

  } catch (err) {
    // Safe-fail: log and surface in UI, never crash popup (NotificationManager pattern)
    console.error('[Popup] Failed to load settings:', err);
    showStatus('Failed to load settings', true);
  }
}

// ─── Save settings to storage ─────────────────────────────────────────────────
async function saveSettings() {
  try {
    const selectedFormat = els.outputFormat();

    const settings = {
      webhookUrl:                      els.webhookUrl().value.trim(),
      proposalWebhookUrl:              els.proposalWebhookUrl().value.trim(),
      scheduleInterval:                parseInt(els.scheduleInterval().value, 10),
      scheduledScrapeEnabled:          els.scheduledScrapeEnabled().checked,
      searchUrl:                       els.searchUrl().value.trim(),
      cfWaitSeconds:                   Math.max(3, Math.min(60, parseInt(els.cfWait().value, 10) || 5)),
      webhookRetries:                  Math.max(0, Math.min(10, parseInt(els.webhookRetries().value, 10) || 0)),
      outputFormat:                    selectedFormat ? selectedFormat.value : DEFAULTS.outputFormat,
      'notifications.master':          els.notifMaster().checked,
      'notifications.scrapeComplete':  els.notifScrapeComplete().checked,
      'notifications.webhookSent':     els.notifWebhookSent().checked,
      'notifications.proposalLoaded':  els.notifProposalLoaded().checked,
      'notifications.errors':          els.notifErrors().checked,
    };

    await chrome.storage.local.set(settings);

    // Notify service worker to re-register alarm with the new interval
    try {
      await chrome.runtime.sendMessage({
        action: 'updateAlarm',
        intervalMinutes: settings.scheduleInterval,
        scheduledScrapeEnabled: settings.scheduledScrapeEnabled,
      });
    } catch (err) {
      // Safe-fail: alarm update failure does not block save confirmation
      console.warn('[Popup] Failed to update alarm in service worker:', err);
    }

    console.log('[Popup] Settings saved:', settings);
    showStatus('Saved');

  } catch (err) {
    // Safe-fail: surface error in UI, do not throw (NotificationManager pattern)
    console.error('[Popup] Failed to save settings:', err);
    showStatus('Failed to save', true);
  }
}

// ─── Event bindings ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load on open
  loadSettings();

  // Master notification toggle dims subtypes immediately on change
  els.notifMaster().addEventListener('change', (e) => {
    applyMasterToggleState(e.target.checked);
  });

  // Save button
  els.saveBtn().addEventListener('click', saveSettings);

  // Export CSV button
  els.exportCsvBtn().addEventListener('click', sendExportCsv);

  // Scrape Now button
  els.scrapeBtn().addEventListener('click', triggerScrape);
});

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
    const isOn = cron.enabled !== false;
    li.innerHTML = `
      <div class="cron-info">
        <strong class="cron-name">${escapeHtml(cron.name)}</strong>
        <span class="cron-interval">every ${cron.intervalMinutes} min</span>
        <span class="cron-url" title="${escapeHtml(cron.webhookUrl)}">${escapeHtml(truncate(cron.webhookUrl, 40))}</span>
      </div>
      <div class="cron-actions">
        <button class="cron-toggle-btn ${isOn ? 'on' : 'off'}" data-id="${cron.id}" type="button" aria-label="Toggle ${escapeHtml(cron.name)}">${isOn ? 'ON' : 'OFF'}</button>
        <button class="cron-delete-btn" data-id="${cron.id}" type="button" aria-label="Delete ${escapeHtml(cron.name)}">Delete</button>
      </div>
    `;
    list.appendChild(li);
  }
  // Wire toggle + delete buttons
  list.querySelectorAll('.cron-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleCron(btn.dataset.id));
  });
  list.querySelectorAll('.cron-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteCron(btn.dataset.id));
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
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
    enabled: true,
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

async function toggleCron(cronId) {
  const { cronJobs = [] } = await chrome.storage.local.get({ cronJobs: [] });
  const cron = cronJobs.find(c => c.id === cronId);
  if (!cron) return;
  cron.enabled = cron.enabled === false ? true : false;
  await chrome.storage.local.set({ cronJobs });
  if (cron.enabled) {
    chrome.runtime.sendMessage({ action: 'REGISTER_CRON_ALARM', cron });
  } else {
    chrome.runtime.sendMessage({ action: 'DELETE_CRON_ALARM', cronId });
  }
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
  document.getElementById('debug-selectors-btn')?.addEventListener('click', testSelectors);
});

// ─── Selector Debugger ────────────────────────────────────────────────────────
function runAllSelectorChecks() {
  function firstText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return null;
  }
  const results = [];

  // title
  let title = null;
  const fc = document.querySelector('.air3-card-section');
  if (fc) { for (const s of fc.querySelectorAll('span')) { const t = s.textContent.trim(); if (t.length > 10 && t.length < 300 && !t.includes('ago') && !t.includes('Posted') && !t.includes('profile')) { title = t; break; } } }
  if (!title && document.title) { const p = document.title.split(' - '); if (p.length > 1) p.pop(); title = p.join(' - ').trim() || null; }
  results.push({ name: 'title', val: title });

  // description
  let desc = null;
  for (const s of document.querySelectorAll('.air3-card-section')) { const h = s.querySelector('strong'); if (h && h.textContent.trim() === 'Summary') { desc = s.textContent.replace('Summary', '').trim() || null; break; } }
  if (!desc) { const el = document.querySelector('[data-test="description"], .job-description'); if (el) desc = el.textContent.trim() || null; }
  results.push({ name: 'description', val: desc });

  // budget
  let budget = firstText(['p.m-0 > strong', '[data-test="budget"]', '[data-test="hourly-rate"]', '.budget']);
  if (!budget) { const m = document.body.innerText.match(/\$[\d,]+(?:\.\d+)?\s*[–\-]\s*\$[\d,]+(?:\.\d+)?\s*\/\s*hr\b/i) || document.body.innerText.match(/\$[\d,]+(?:\.\d+)?\s*\/\s*hr\b/i); if (m) budget = m[0].trim(); }
  results.push({ name: 'budget', val: budget });

  // skills
  const skillSels = ['[data-test="skill-badge"]', '.skill-badge', '[data-test="skills"] .badge', '.skills-list .badge'];
  let skills = [];
  for (const sel of skillSels) { const els = document.querySelectorAll(sel); if (els.length > 0) { skills = Array.from(els).map(e => e.textContent.trim()).filter(Boolean); break; } }
  results.push({ name: 'skills', val: skills.length ? skills.join(', ') : null });

  // experience_level
  let expLvl = null;
  for (const s of document.querySelectorAll('strong')) { if (['Entry Level', 'Intermediate', 'Expert'].includes(s.textContent.trim())) { expLvl = s.textContent.trim(); break; } }
  results.push({ name: 'experience_level', val: expLvl });

  // project_duration
  let dur = document.querySelector('.segmentations')?.textContent.trim() || null;
  if (!dur) dur = firstText(['[data-test="duration"]', '[data-test="project-duration"]', '.duration']);
  results.push({ name: 'project_duration', val: dur });

  // create_time / publish_time from script payload
  const jid = window.location.href.match(/~(\d+)/)?.[1];
  const jScript = jid && Array.from(document.querySelectorAll('script')).find(s => s.textContent.includes(jid));
  const isoDates = jScript ? jScript.textContent.match(/20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/g) || [] : [];
  results.push({ name: 'create_time (script)', val: isoDates[0] || null });
  results.push({ name: 'publish_time (script)', val: isoDates[1] || null });

  // posted_date
  let posted = isoDates[1] || document.querySelector('[data-test="posted-on"] time, time[datetime]')?.getAttribute('datetime') || null;
  if (!posted) { const fc2 = document.querySelector('.air3-card-section'); if (fc2) { for (const s of fc2.querySelectorAll('span')) { const t = s.textContent.trim(); if (t.includes('ago') && t.length < 30) { posted = t; break; } } } }
  results.push({ name: 'posted_date', val: posted });

  // proposals_count
  let proposals = null;
  for (const s of document.querySelectorAll('span.value')) { const t = s.textContent.trim(); if (/^(Less than|\d)/.test(t) && !t.includes('ago') && !t.includes('hour') && !t.includes('day')) { proposals = t; break; } }
  results.push({ name: 'proposals_count', val: proposals });

  // payment_verified
  let verified = false;
  for (const s of document.querySelectorAll('strong')) { if (s.textContent.includes('Payment method verified')) { verified = true; break; } }
  results.push({ name: 'payment_verified', val: verified ? 'true' : null });

  // client_location
  let loc = null;
  const cl = document.querySelector('.features.text-light-on-muted.list-unstyled');
  if (cl) { for (const s of cl.querySelectorAll('strong')) { const t = s.textContent.trim(); if (!t.includes('$') && !t.includes('jobs') && !t.includes('rate') && !t.includes('verified')) { loc = t; break; } } }
  results.push({ name: 'client_location', val: loc });

  // client_rating
  let rating = null;
  for (const s of document.querySelectorAll('span.sr-only')) { if (s.textContent.startsWith('Rating is')) { const m = s.textContent.match(/Rating is (\d+\.?\d*) out of/); if (m) { rating = m[1]; break; } } }
  results.push({ name: 'client_rating', val: rating });

  // client_total_spent
  let spent = null;
  if (cl) { for (const s of cl.querySelectorAll('strong')) { if (s.textContent.includes('total spent')) { spent = s.textContent.trim(); break; } } }
  results.push({ name: 'client_total_spent', val: spent });

  // client_total_hires / client_active_hires — div sibling of "total spent" strong
  let hiresActive = null;
  if (cl) {
    for (const li of cl.querySelectorAll('li')) {
      const s = li.querySelector('strong');
      if (s && s.textContent.includes('total spent')) {
        const d = li.querySelector('div');
        if (d) hiresActive = d.textContent.trim();
        break;
      }
    }
  }
  results.push({ name: 'client_hires_active', val: hiresActive });

  // hire_rate
  const hrEl = document.querySelector('[data-qa="client-job-posting-stats"] div');
  results.push({ name: 'hire_rate', val: hrEl?.textContent.trim() || null });

  // Activity on this job (li.ca-item)
  const actMap = {};
  for (const li of document.querySelectorAll('li.ca-item')) {
    const k = li.querySelector('.title')?.textContent.trim().replace(':', '');
    const v = li.querySelector('.value')?.textContent.trim();
    if (k && v) actMap[k] = v;
  }
  results.push({ name: 'total_hired (Hires/Hired)', val: actMap['Hires'] || actMap['Hired'] || null });
  results.push({ name: 'interviewing', val: actMap['Interviewing'] || null });
  results.push({ name: 'invites_sent', val: actMap['Invites sent'] || null });
  results.push({ name: 'unanswered_invites', val: actMap['Unanswered invites'] || null });
  results.push({ name: 'last_viewed_by_client', val: actMap['Last viewed by client'] || null });

  // screening_questions
  let sqText = null;
  for (const sec of document.querySelectorAll('.air3-card-section')) {
    if (sec.textContent.includes('You will be asked')) {
      const ol = sec.querySelector('ol');
      if (ol) sqText = Array.from(ol.querySelectorAll('li')).map(function(li){return li.textContent.trim()}).filter(Boolean).join(' | ');
      break;
    }
  }
  results.push({ name: 'screening_questions', val: sqText });

  return results;
}

async function testSelectors() {
  const resultsEl = document.getElementById('debug-results');
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = 'Running on active Upwork tab...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url?.includes('upwork.com')) {
    resultsEl.innerHTML = '<span style="color:#f87171">No active Upwork tab found. Open a job detail page first.</span>';
    return;
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: runAllSelectorChecks,
  });

  const rows = (result?.result || []).map(({ name, val }) => {
    const found = val !== null && val !== undefined && val !== '';
    return `<div style="display:flex;gap:6px;align-items:baseline;margin-bottom:2px">
      <span style="color:${found ? '#4ade80' : '#f87171'};font-weight:bold;min-width:12px">${found ? '✓' : '✗'}</span>
      <span style="color:#ccc;min-width:180px;font-size:11px">${name}</span>
      <span style="color:#888;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${found ? String(val).slice(0, 60) : 'NOT FOUND'}</span>
    </div>`;
  });

  resultsEl.innerHTML = rows.join('');
}

// ─── Pattern for future action buttons (Phases 2-3 popup additions) ──────────
// When adding scrape/webhook action buttons, wire responses like this:
//
//   chrome.runtime.sendMessage({ action: 'SCRAPE_SEARCH' }, (response) => {
//     if (response && response.error) {
//       showExtStatus('Error: ' + response.error, 'error');
//     } else if (response) {
//       showExtStatus('Scraped ' + (response.jobs?.length ?? 0) + ' jobs', 'success');
//     }
//   });
//
//   chrome.runtime.sendMessage({ action: 'LOAD_PROPOSAL', jobData }, (response) => {
//     if (response && response.error) {
//       showExtStatus('Proposal error: ' + response.error, 'error');
//     } else if (response) {
//       showExtStatus('Proposal: loaded', 'success');
//     }
//   });
