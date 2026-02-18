// Consologit_Job_Assistant — Service Worker (MV3)
// Handles: scheduled alarms, webhook dispatch, cross-component messaging
// Adapts: WebhookUtility retry/backoff pattern (global class) via fetch API
// Adapts: EnvironmentAdapter message-passing pattern via chrome.runtime.onMessage

import { WebhookClient } from '../utils/webhook-client.js';

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
        sendResponse({ success: false, error: 'no jobs provided' });
        return;
      }

      // Read webhook settings from storage
      const { webhookUrl, outputMode } = await chrome.storage.local.get({
        webhookUrl: '',
        outputMode: 'webhook',
      });

      // Guard: skip if outputMode is csv-only
      if (outputMode === 'csv') {
        console.log('WebhookClient: skipping webhook push, outputMode is csv-only');
        sendResponse({ success: false, skipped: true });
        return;
      }

      // Guard: skip if no webhook URL configured
      if (!webhookUrl) {
        console.log('WebhookClient: no webhook URL configured');
        sendResponse({ success: false, skipped: true });
        return;
      }

      // Dispatch each job via WebhookClient
      const client = new WebhookClient();
      let sent = 0;
      let failed = 0;

      for (const job of message.jobs) {
        const ok = await client.dispatchJob(webhookUrl, job);
        if (ok) {
          sent++;
        } else {
          failed++;
        }
      }

      sendResponse({ success: true, sent, failed });
    })();
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
      lastScrapeJobs: jobs,
      lastScrapeTime: new Date().toISOString(),
    });
  }
}
