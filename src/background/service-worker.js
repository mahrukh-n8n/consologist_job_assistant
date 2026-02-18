// Consologit_Job_Assistant — Service Worker (MV3)
// Handles: scheduled alarms, webhook dispatch, cross-component messaging
// Adapts: WebhookUtility retry/backoff pattern (global class) via fetch API
// Adapts: EnvironmentAdapter message-passing pattern via chrome.runtime.onMessage

import { WebhookClient } from '../utils/webhook-client.js';
import { transformJob } from '../utils/job-transformer.js';
import { CsvExporter } from '../utils/csv-exporter.js';

console.log('[SW] Consologit_Job_Assistant service worker started');

// ─── Constants ────────────────────────────────────────────────────────────────
const ALARM_NAME = 'upwork-scrape-alarm';
const DEFAULT_INTERVAL_MINUTES = 30;

// ─── Install / activate lifecycle ────────────────────────────────────────────
self.addEventListener('install', () => {
  console.log('[SW] Installed');
});

self.addEventListener('activate', () => {
  console.log('[SW] Activated');
});

// ─── Alarm registration ───────────────────────────────────────────────────────
// Register alarm on install and startup from stored interval.
// Storage key: scheduleInterval — matches the key popup.js writes to storage.
chrome.runtime.onInstalled.addListener(registerAlarmFromStorage);
chrome.runtime.onStartup.addListener(registerAlarmFromStorage);

async function registerAlarmFromStorage() {
  const { scheduleInterval } = await chrome.storage.local.get({ scheduleInterval: DEFAULT_INTERVAL_MINUTES });
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: scheduleInterval,
    periodInMinutes: scheduleInterval,
  });
  console.debug('[upwork-ext] alarm registered:', scheduleInterval, 'min');
}

// ─── CSV export handler ───────────────────────────────────────────────────────

/**
 * Generates and downloads a CSV of the most recently scraped jobs.
 *
 * Guards:
 * 1. outputFormat === 'webhook' → csv_disabled (no download)
 * 2. lastScrapedJobs missing, not array, or empty → no_data (no download)
 *
 * Uses data: URI download (MV3 service worker — no Blob/URL.createObjectURL).
 *
 * @returns {Promise<{ success: boolean, count?: number, reason?: string, message?: string }>}
 */
async function handleExportCsv() {
  const { outputFormat, lastScrapedJobs } = await chrome.storage.local.get({
    outputFormat: 'both',
    lastScrapedJobs: null,
  });

  // Guard: CSV export disabled when outputFormat is webhook-only
  if (outputFormat === 'webhook') {
    return {
      success: false,
      reason: 'csv_disabled',
      message: 'CSV export is disabled for webhook-only mode',
    };
  }

  // Guard: no scraped data available
  if (!lastScrapedJobs || !Array.isArray(lastScrapedJobs) || lastScrapedJobs.length === 0) {
    return {
      success: false,
      reason: 'no_data',
      message: 'No scraped jobs to export',
    };
  }

  // Generate CSV string
  const exporter = new CsvExporter();
  const csvString = exporter.generateCsv(lastScrapedJobs);

  // Trigger download via data: URI (MV3-safe — no Blob/URL.createObjectURL)
  const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString);
  chrome.downloads.download({ url: dataUri, filename: 'upwork-jobs.csv', saveAs: false });

  return { success: true, count: lastScrapedJobs.length };
}

// ─── Notification helper (NOTF-01) ────────────────────────────────────────────
// Reads from flat dot-notation keys set by Phase 1 popup settings.
// type: 'scrapeComplete' | 'webhookSent' | 'proposalLoaded' | 'errors'
async function fireNotification(type, message) {
  try {
    const keys = ['notifications.master', `notifications.${type}`];
    const settings = await chrome.storage.local.get(keys);
    if (!settings['notifications.master']) return;
    if (!settings[`notifications.${type}`]) return;
    chrome.notifications.create('ext-notif-' + Date.now(), {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'Consologit_Job_Assistant',
      message
    });
  } catch (err) {
    // Safe-fail: notification failures must never crash the service worker
    console.error('[SW] fireNotification failed:', err);
  }
}

// Expose to DevTools console (module scope doesn't attach to self automatically)
self.fireNotification = fireNotification;

// ─── Message router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SW] Message received:', message.action || message.type);

  // Update alarm when user changes interval in popup settings
  if (message.action === 'updateAlarm') {
    const intervalMinutes = message.intervalMinutes || DEFAULT_INTERVAL_MINUTES;
    chrome.alarms.clear(ALARM_NAME).then(() => {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes,
      });
      console.debug('[upwork-ext] alarm updated to:', intervalMinutes, 'min');
      sendResponse({ success: true });
    });
    return true; // keep channel open for async response
  }

  // Push scraped jobs to n8n webhook
  // Message format: { action: 'PUSH_JOBS', jobs: [ { job_id, title, url, ... } ] }
  if (message.action === 'PUSH_JOBS') {
    (async () => {
      // Guard: jobs must be a non-empty array
      if (!message.jobs || !Array.isArray(message.jobs) || message.jobs.length === 0) {
        await fireNotification('errors', 'Webhook: no jobs provided');
        sendResponse({ success: false, error: 'no jobs provided' });
        return;
      }

      // Read webhook settings from storage
      const { webhookUrl, outputFormat } = await chrome.storage.local.get({
        webhookUrl: '',
        outputFormat: 'webhook',
      });

      // Guard: skip if outputFormat is csv-only
      if (outputFormat === 'csv') {
        console.log('WebhookClient: skipping webhook push, outputFormat is csv-only');
        sendResponse({ success: false, skipped: true });
        return;
      }

      // Guard: skip if no webhook URL configured
      if (!webhookUrl) {
        console.log('WebhookClient: no webhook URL configured');
        sendResponse({ success: false, skipped: true });
        return;
      }

      // Transform to reference schema before dispatch
      const transformedJobs = message.jobs.map(transformJob).filter(Boolean);

      // Dispatch each job via WebhookClient
      const client = new WebhookClient();
      let sent = 0;
      let failed = 0;

      for (const job of transformedJobs) {
        const ok = await client.dispatchJob(webhookUrl, job);
        if (ok) {
          sent++;
        } else {
          failed++;
        }
      }

      // NOTF-01: toast notification for webhook sent
      await fireNotification('webhookSent', `Webhook: sent ${sent} jobs`);
      sendResponse({ success: true, sent, failed });
    })();
    return true; // keep channel open for async response
  }

  // Fetch match statuses for a list of job IDs from n8n match endpoint
  // Message format: { action: 'GET_MATCH_STATUS', jobIds: ['id1', 'id2', ...] }
  // Response: { success: true, statuses: { id1: 'match', id2: 'no_match', ... } }
  //        or { success: false, error: '...', statuses: {} }
  if (message.action === 'GET_MATCH_STATUS') {
    handleMatchStatus(message).then(sendResponse);
    return true; // keep port open for async response
  }

  // Export scraped jobs as a CSV file downloaded to the user's downloads folder
  // Message format: { action: 'EXPORT_CSV' }
  // Response: { success: true, count: N } | { success: false, reason: 'csv_disabled'|'no_data', message: '...' }
  if (message.action === 'EXPORT_CSV') {
    handleExportCsv(message).then(async (result) => {
      // NOTF-01: toast notification for CSV export success
      // Placeholder for SCRAPE_SEARCH success: await fireNotification('scrapeComplete', `Scraped ${jobs.length} jobs from search`);
      // Placeholder for SCRAPE_DETAIL success: await fireNotification('scrapeComplete', 'Job detail scraped');
      if (result && result.success) {
        await fireNotification('scrapeComplete', 'CSV exported to downloads folder');
      } else if (result && !result.success) {
        await fireNotification('errors', `Export failed: ${result.message || result.reason}`);
      }
      sendResponse(result);
    });
    return true; // keep port open for async response
  }

  // Fetch AI-generated proposal from n8n for a job apply page
  // Message format: { action: 'LOAD_PROPOSAL', jobData: { job_id, title, description } }
  // Response: { proposal: string } | { error: string }
  if (message.action === 'LOAD_PROPOSAL') {
    handleLoadProposal(message.jobData, sendResponse);
    return true; // keep channel open for async response
  }

  return false; // synchronous response for unhandled messages
});

// ─── Alarm listener ───────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.debug('[upwork-ext] alarm fired — starting scrape cycle');
  await runScheduledScrape();
});

// ─── Tab management helpers ───────────────────────────────────────────────────

/**
 * Waits for a tab to finish loading, then waits an additional 2s for
 * JS-rendered content (Upwork SPA) to settle.
 *
 * @param {number} tabId
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Extra delay for JS-rendered content
        setTimeout(resolve, 2000);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ─── Scrape orchestration ─────────────────────────────────────────────────────

/**
 * Finds or opens an Upwork search tab, sends a scrapeSearch message to the
 * content script, stores results in chrome.storage.local, and closes the tab
 * if it was opened by this function.
 */
async function runScheduledScrape() {
  // Find an existing Upwork search tab
  const tabs = await chrome.tabs.query({ url: 'https://www.upwork.com/nx/search/jobs/*' });

  let tabId;
  let opened = false;

  if (tabs.length > 0) {
    tabId = tabs[0].id;
  } else {
    // No search tab open — open one in background
    const tab = await chrome.tabs.create({
      url: 'https://www.upwork.com/nx/search/jobs/',
      active: false,
    });
    tabId = tab.id;
    opened = true;

    // Wait for tab to finish loading + SPA render delay
    await waitForTabLoad(tabId);
  }

  // Send scrape command to content script in that tab
  let jobs = [];
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'scrapeSearch' });
    jobs = response?.jobs || [];
    console.debug('[upwork-ext] scheduled scrape complete:', jobs.length, 'jobs');
  } catch (err) {
    console.error('[upwork-ext] scrape message failed:', err);
  }

  // Close the tab if we opened it
  if (opened) {
    await chrome.tabs.remove(tabId);
  }

  // Store results for popup display and downstream phases
  if (jobs.length > 0) {
    await chrome.storage.local.set({
      lastScrapedJobs: jobs,
      lastScrapeTime: new Date().toISOString(),
    });
    await fireNotification('scrapeComplete', `Scraped ${jobs.length} jobs from search`);
  }
}

// ─── Proposal load handler ────────────────────────────────────────────────────

/**
 * Fetches an AI-generated proposal from the configured n8n proposal webhook URL.
 *
 * Requires 'proposalWebhookUrl' in chrome.storage.local.
 * This is distinct from 'webhookUrl' (job data webhook).
 * Set via the extension popup settings panel.
 *
 * Handles both JSON responses ({ proposal: "..." } or { text: "..." }) and
 * plain-text responses — n8n workflow can return either format.
 *
 * @param {{ job_id: string, title: string, description: string }} jobData
 * @param {function} sendResponse
 */
async function handleLoadProposal(jobData, sendResponse) {
  try {
    const settings = await chrome.storage.local.get(['proposalWebhookUrl']);
    const url = settings.proposalWebhookUrl;

    if (!url) {
      sendResponse({ error: 'No proposal webhook URL configured. Set it in extension settings.' });
      return;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobData),
    });

    if (!response.ok) {
      sendResponse({ error: `n8n returned ${response.status}: ${response.statusText}` });
      return;
    }

    // n8n may return plain text or JSON { proposal: "..." }
    const contentType = response.headers.get('content-type') || '';
    let proposalText;
    if (contentType.includes('application/json')) {
      const json = await response.json();
      proposalText = json.proposal || json.text || JSON.stringify(json);
    } else {
      proposalText = await response.text();
    }

    // NOTF-01: toast notification for proposal loaded
    await fireNotification('proposalLoaded', 'Proposal loaded');
    sendResponse({ proposal: proposalText.trim() });

  } catch (err) {
    // NOTF-01: toast notification for proposal error
    await fireNotification('errors', `Proposal load failed: ${err.message}`);
    sendResponse({ error: `Proposal load failed: ${err.message}` });
  }
}

// ─── Match status handler ─────────────────────────────────────────────────────

/**
 * Fetches match statuses for a list of job IDs from the n8n match endpoint.
 *
 * Reads matchWebhookUrl from storage. Falls back to webhookUrl + '/match'.
 * Returns { success: true, statuses: { jobId: 'match'|'no_match'|'applied' } }
 *       or { success: false, error: '...', statuses: {} }
 *
 * @param {{ jobIds: string[] }} message
 * @returns {Promise<{ success: boolean, statuses: object, error?: string }>}
 */
async function handleMatchStatus(message) {
  const { webhookUrl } = await chrome.storage.local.get({ webhookUrl: '' });

  if (!webhookUrl) {
    console.warn('[upwork-ext] GET_MATCH_STATUS: no webhook URL configured');
    return { success: false, error: 'no match URL configured', statuses: {} };
  }

  const url = webhookUrl;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_ids: message.jobIds, statuscheck: true }),
    });

    if (!response.ok) {
      const msg = `HTTP ${response.status}`;
      console.warn('[upwork-ext] GET_MATCH_STATUS failed:', msg);
      return { success: false, error: msg, statuses: {} };
    }

    const statuses = await response.json();
    console.debug('[upwork-ext] GET_MATCH_STATUS received statuses for', Object.keys(statuses).length, 'jobs');
    return { success: true, statuses };
  } catch (err) {
    console.warn('[upwork-ext] GET_MATCH_STATUS failed:', err.message);
    return { success: false, error: err.message, statuses: {} };
  }
}
