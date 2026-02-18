// Upwork Job Scraper — Content Script
// Runs on: *://*.upwork.com/*
// Handles: DOM scraping, job data extraction
// Communicates with: service worker via chrome.runtime.sendMessage

console.log('[Content] Upwork Job Scraper content script loaded on:', window.location.href);

// Message listener from popup or service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Message received:', message.type);

  if (message.type === 'PING') {
    sendResponse({ status: 'ok', url: window.location.href });
    return true;
  }

  return false;
});
