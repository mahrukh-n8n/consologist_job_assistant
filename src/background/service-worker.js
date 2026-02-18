// Consologit_Job_Assistant — Service Worker (MV3)
// Handles: scheduled alarms, webhook dispatch, cross-component messaging
// Adapts: WebhookUtility retry/backoff pattern (global class) via fetch API
// Adapts: EnvironmentAdapter message-passing pattern via chrome.runtime.onMessage

console.log('[SW] Consologit_Job_Assistant service worker started');

// Install / activate lifecycle
self.addEventListener('install', () => {
  console.log('[SW] Installed');
});

self.addEventListener('activate', () => {
  console.log('[SW] Activated');
});

// Message router — shell for Phase 2 handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SW] Message received:', message.type);
  // Handlers added in later phases
  return false; // synchronous response (no async yet)
});

// Alarm listener — shell for Phase 2 scheduled scraping
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('[SW] Alarm fired:', alarm.name);
  // Scrape handler added in Phase 2
});
