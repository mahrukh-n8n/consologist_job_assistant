// Upwork Job Scraper — Popup Settings
// Pattern: NotificationManager safe-fail (global class registry) adapted for chrome.storage
// All storage operations wrapped in try/catch — errors shown in UI, never crash popup

// ─── Default values ──────────────────────────────────────────────────────────
const DEFAULTS = {
  webhookUrl: '',
  scheduleInterval: 30,
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
  scheduleInterval:    () => document.getElementById('schedule-interval'),
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
function showScrapeStatus(message, isError = false) {
  const el = els.scrapeStatus();
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
  try {
    // Query the active tab in the current window
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showScrapeStatus('No active tab found', true);
      return;
    }
    // Send scrapeSearch to the content script on the active tab
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeSearch' });
    if (response && Array.isArray(response.jobs)) {
      const msg = `Scraped ${response.jobs.length} job${response.jobs.length !== 1 ? 's' : ''}`;
      showScrapeStatus(msg);
      showExtStatus(msg, 'success');
    } else {
      showScrapeStatus('Scrape returned no data', true);
      showExtStatus('Scrape returned no data', 'error');
    }
  } catch (err) {
    // Safe-fail: content script may not be injected on non-Upwork tabs
    console.error('[Popup] Scrape failed:', err);
    showScrapeStatus('Scrape failed — open an Upwork search page', true);
    showExtStatus('Scrape failed — open an Upwork search page', 'error');
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
      webhookUrl:       stored.webhookUrl       ?? DEFAULTS.webhookUrl,
      scheduleInterval: stored.scheduleInterval ?? DEFAULTS.scheduleInterval,
      outputFormat:     stored.outputFormat     ?? DEFAULTS.outputFormat,
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

    els.scheduleInterval().value = String(settings.scheduleInterval);

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
      scheduleInterval:                parseInt(els.scheduleInterval().value, 10),
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
