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
  const { scheduleInterval, scheduledScrapeEnabled } = await chrome.storage.local.get({
    scheduleInterval: DEFAULT_INTERVAL_MINUTES,
    scheduledScrapeEnabled: true,
  });
  await chrome.alarms.clear(ALARM_NAME);
  if (scheduledScrapeEnabled !== false) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: scheduleInterval,
      periodInMinutes: scheduleInterval,
    });
    console.debug('[SW] alarm registered:', scheduleInterval, 'min');
  } else {
    console.debug('[SW] alarm not registered — scheduled scraping disabled');
  }
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
    // Treat missing keys as enabled (default = on until user explicitly turns off)
    if (settings['notifications.master'] === false) return;
    if (settings[`notifications.${type}`] === false) return;
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
self.runScheduledScrape = runScheduledScrape;

// ─── Message router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SW] Message received:', message.action || message.type);

  // Update alarm when user changes interval in popup settings
  if (message.action === 'updateAlarm') {
    const intervalMinutes = message.intervalMinutes || DEFAULT_INTERVAL_MINUTES;
    const enabled = message.scheduledScrapeEnabled !== false;
    chrome.alarms.clear(ALARM_NAME).then(() => {
      if (enabled) {
        chrome.alarms.create(ALARM_NAME, {
          delayInMinutes: intervalMinutes,
          periodInMinutes: intervalMinutes,
        });
        console.debug('[SW] alarm updated:', intervalMinutes, 'min, enabled');
      } else {
        console.debug('[SW] alarm cleared — scheduled scraping disabled');
      }
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
      if (sent > 0) {
        await fireNotification('webhookSent', `Webhook: sent ${sent} job${sent === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}`);
      } else {
        await fireNotification('errors', `Webhook: all ${failed} job${failed === 1 ? '' : 's'} failed to send`);
      }
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

  if (message.action === 'RUN_DETAIL_SCRAPE') {
    sendResponse({ success: true, queued: true }); // immediate — popup can close
    (async () => {
      const searchJobs = message.jobs;
      if (!searchJobs?.length) {
        await fireNotification('errors', 'Detail scrape: no jobs to process');
        return;
      }
      const detailedJobs = await scrapeJobDetails(searchJobs);
      if (detailedJobs.length > 0) {
        await chrome.storage.local.set({ lastScrapedJobs: detailedJobs, lastScrapeTime: new Date().toISOString() });
        await dispatchJobsBatch(detailedJobs);
        await fireNotification('scrapeComplete', `Scrape Now: ${detailedJobs.length} jobs (full detail)`);
      } else {
        await fireNotification('errors', 'Detail scrape: all tabs failed');
      }
    })();
    return true;
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
 * Waits for a tab to finish loading and then remain stable (no further
 * navigations) before resolving. Handles Cloudflare challenge pages that
 * fire 'complete' and then immediately redirect to the real Upwork page:
 *
 *   Cloudflare page complete  →  loading (redirect)  →  Upwork page complete
 *                                   ↑ resets timer
 *
 * Stability windows:
 *   - Normal load:           2 s after last 'complete'
 *   - After a redirect:      5 s after last 'complete' (SPA needs more time)
 * Overall timeout: 60 s (generous for slow Cloudflare challenges).
 *
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function waitForTabLoad(tabId) {
  const BASE_EXTRA_MS = 2000;
  const CF_EXTRA_MS   = 5000;
  const TIMEOUT_MS    = 60000;

  return new Promise((resolve) => {
    let settled    = false;
    let stableTimer = null;
    let hadRedirect = false;

    function cleanup() {
      chrome.tabs.onUpdated.removeListener(listener);
      if (stableTimer) clearTimeout(stableTimer);
      clearTimeout(timeoutId);
    }

    function done() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }

    const timeoutId = setTimeout(() => {
      console.warn('[SW] waitForTabLoad: timeout for tabId', tabId);
      done();
    }, TIMEOUT_MS);

    function scheduleStable() {
      if (stableTimer) clearTimeout(stableTimer);
      const delay = hadRedirect ? CF_EXTRA_MS : BASE_EXTRA_MS;
      stableTimer = setTimeout(done, delay);
    }

    function listener(id, changeInfo) {
      if (id !== tabId) return;
      if (changeInfo.status === 'loading') {
        if (stableTimer) {
          // A navigation started after a previous 'complete' → redirect detected
          hadRedirect = true;
          clearTimeout(stableTimer);
          stableTimer = null;
        }
      } else if (changeInfo.status === 'complete') {
        scheduleStable();
      }
    }

    // Register listener BEFORE checking current state to avoid missed events
    chrome.tabs.onUpdated.addListener(listener);

    // If the tab is already complete (e.g. cached), start the stability timer now
    chrome.tabs.get(tabId)
      .then(tab => { if (tab.status === 'complete') scheduleStable(); })
      .catch(() => { /* tab not yet queryable — listener will catch complete */ });
  });
}

function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeJobDetails(searchJobs) {
  const detailedJobs = [];
  for (let i = 0; i < searchJobs.length; i++) {
    const job = searchJobs[i];
    if (i > 0) await randomDelay(2000, 5000);
    let detailTab = null;
    try {
      detailTab = await chrome.tabs.create({ url: job.url, active: false });
      await waitForTabLoad(detailTab.id);
      const res = await chrome.tabs.sendMessage(detailTab.id, { action: 'scrapeDetail' });
      const detailJob = res?.job;
      detailedJobs.push((!detailJob || !detailJob.job_id) ? job : detailJob);
    } catch (err) {
      console.error('[SW] scrapeJobDetails: failed for', job.url, err.message);
      detailedJobs.push(job); // shallow fallback
    } finally {
      if (detailTab?.id) {
        try { await chrome.tabs.remove(detailTab.id); } catch (_) {}
      }
    }
  }
  return detailedJobs;
}

async function dispatchJobsBatch(jobs) {
  const { webhookUrl, outputFormat } = await chrome.storage.local.get({
    webhookUrl: '',
    outputFormat: 'both',
  });
  if (outputFormat === 'csv' || !webhookUrl) return;
  const transformed = jobs.map(transformJob).filter(Boolean);
  if (transformed.length === 0) return;
  const client = new WebhookClient();
  const ok = await client.dispatchBatch(webhookUrl, transformed);
  await fireNotification('webhookSent', `Webhook: ${ok ? 'sent' : 'failed'} ${transformed.length} jobs`);
  console.debug('[SW] dispatchJobsBatch:', ok ? 'success' : 'FAILED', transformed.length, 'jobs');
}

// ─── Scrape orchestration ─────────────────────────────────────────────────────

async function runScheduledScrape() {
  const { scheduledScrapeEnabled, searchUrl, cfWaitSeconds } = await chrome.storage.local.get({
    scheduledScrapeEnabled: true,
    searchUrl: '',
    cfWaitSeconds: 5,
  });
  if (!scheduledScrapeEnabled) return;

  // Validate and resolve search URL — must be an Upwork search page
  const targetUrl = (searchUrl && searchUrl.includes('upwork.com'))
    ? searchUrl
    : 'https://www.upwork.com/nx/search/jobs/';
  console.debug('[SW] runScheduledScrape: opening', targetUrl);

  // Phase 1: shallow search scrape
  // Cloudflare Turnstile checks document.visibilityState and will not solve in
  // a hidden background tab. However, once a user has visited Upwork the
  // cf_clearance cookie is set for the domain — new background tabs can then
  // bypass the challenge automatically.
  // Strategy: open background tab if any Upwork tab exists (cookie is live),
  // otherwise open as active so Cloudflare can solve the challenge.
  const existingUpworkTabs = await chrome.tabs.query({ url: '*://*.upwork.com/*' });
  const needsActivTab = existingUpworkTabs.length === 0;
  if (needsActivTab) {
    console.debug('[SW] runScheduledScrape: no existing Upwork tabs — opening active tab for Cloudflare');
  }
  const tab = await chrome.tabs.create({ url: targetUrl, active: needsActivTab });
  await waitForTabLoad(tab.id);
  // Extra wait for Cloudflare challenge JS to finish and redirect to settle.
  // Configurable via popup "CF wait (seconds)" setting (default 5s, range 3–60s).
  const cfWaitMs = Math.max(3000, (cfWaitSeconds || 5) * 1000);
  console.debug('[SW] runScheduledScrape: CF wait', cfWaitMs / 1000, 's');
  await new Promise((resolve) => setTimeout(resolve, cfWaitMs));
  let searchJobs = [];
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeSearch' });
    searchJobs = res?.jobs || [];
  } catch (err) {
    console.error('[SW] runScheduledScrape: search failed:', err);
  }
  try { await chrome.tabs.remove(tab.id); } catch (_) {}
  if (searchJobs.length === 0) {
    await fireNotification('errors', 'Scheduled scrape: no jobs found — check your Scheduled Scrape URL');
    return;
  }

  // Phase 2: detail scrape (sequential, random delays)
  const detailedJobs = await scrapeJobDetails(searchJobs);
  if (detailedJobs.length === 0) {
    await fireNotification('errors', 'Scheduled scrape: all detail tabs failed to load');
    return;
  }

  // Phase 3: persist + batch webhook dispatch + notify
  await chrome.storage.local.set({ lastScrapedJobs: detailedJobs, lastScrapeTime: new Date().toISOString() });
  await dispatchJobsBatch(detailedJobs);
  await fireNotification('scrapeComplete', `Scraped ${detailedJobs.length} jobs (full detail)`);
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
    // Uses the same webhookUrl as job data — n8n routes by status field.
    // Sends { job_id, status: 'proposal' } so n8n can distinguish from scrape payloads.
    const settings = await chrome.storage.local.get(['webhookUrl']);
    const url = settings.webhookUrl;

    if (!url) {
      sendResponse({ error: 'No webhook URL configured. Set it in extension settings.' });
      return;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobData.job_id, status: 'proposal' }),
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
      body: JSON.stringify({ job_ids: message.jobIds, status: 'search' }),
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
