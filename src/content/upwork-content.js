// Upwork Job Scraper — Content Script
// Runs on: *://*.upwork.com/*
// Handles: DOM scraping, job data extraction
// Communicates with: service worker via chrome.runtime.sendMessage

import { scrapeSearchPage } from './search-scraper.js';
import { scrapeDetailPage } from './detail-scraper.js';

console.log('[Content] Upwork Job Scraper content script loaded on:', window.location.href);

// Message listener from popup or service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Message received:', message.action || message.type);

  if (message.type === 'PING') {
    sendResponse({ status: 'ok', url: window.location.href });
    return true;
  }

  // Triggered by service worker alarm cycle to scrape the current search results page
  if (message.action === 'scrapeSearch') {
    const jobs = scrapeSearchPage();
    sendResponse({ jobs });
    return true;
  }

  // Triggered by popup or service worker to scrape the current job detail page
  if (message.action === 'scrapeDetail') {
    const job = scrapeDetailPage();
    sendResponse({ job });
    return true;
  }

  return false;
});
