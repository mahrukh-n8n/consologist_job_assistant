// Upwork Job Scraper — Content Script
// Runs on: *://*.upwork.com/*
// Handles: DOM scraping, job data extraction
// Communicates with: service worker via chrome.runtime.sendMessage
//
// Note: Chrome does not support ES module imports in content scripts.
// All dependencies are inlined below.

// ── from src/utils/job-parser.js ──────────────────────────────────────────

function extractJobId(url) {
  if (!url) return null;
  const match = url.match(/_~([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// ── from src/content/search-scraper.js ────────────────────────────────────

function scrapeSearchPage() {
  const cardSelectors = [
    '[data-test="job-tile"]',
    'section.air3-card-section',
    'article.job-tile',
    '.job-tile',
  ];

  const linkSelectors = [
    '[data-test="job-title"] a',
    'h2.job-title a',
    'h2 a[href*="/jobs/"]',
    'a[href*="/jobs/"]',
  ];

  let cards = [];
  for (const sel of cardSelectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      cards = Array.from(found);
      break;
    }
  }

  const jobs = [];

  for (const card of cards) {
    let anchor = null;
    for (const sel of linkSelectors) {
      anchor = card.querySelector(sel);
      if (anchor) break;
    }

    if (!anchor) continue;

    const href = anchor.getAttribute('href') || '';
    const absoluteUrl = href.startsWith('http')
      ? href
      : `https://www.upwork.com${href}`;

    const job_id = extractJobId(absoluteUrl);
    const title = (anchor.textContent || '').trim();

    if (!job_id || !title) continue;

    jobs.push({ job_id, title, url: absoluteUrl });
  }

  console.debug('[upwork-ext] search scrape:', jobs.length, 'jobs found');

  return jobs;
}

// ── from src/content/detail-scraper.js ────────────────────────────────────

function firstText(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return null;
}

function scrapeDetailPage() {
  const pageUrl = window.location.href;
  const job_id = extractJobId(pageUrl);

  const title = firstText([
    '[data-test="job-title"] h1',
    'h1.job-title',
    'h1',
  ]);

  let description = null;
  const descSelectors = [
    '[data-test="description"]',
    '.description',
    '.job-description',
  ];
  for (const sel of descSelectors) {
    const container = document.querySelector(sel);
    if (container) {
      const paragraphs = Array.from(container.querySelectorAll('p'));
      const text = paragraphs.length
        ? paragraphs.map(p => p.textContent.trim()).filter(Boolean).join('\n\n')
        : container.textContent.trim();
      if (text) { description = text; break; }
    }
  }

  const budget = firstText([
    '[data-test="budget"]',
    '[data-test="hourly-rate"]',
    '.budget',
    '.hourly-rate',
  ]);

  let payment_type = null;
  const jobTypeEl = document.querySelector('[data-test="job-type"]');
  if (jobTypeEl) {
    const raw = jobTypeEl.textContent.toLowerCase();
    payment_type = raw.includes('hourly') ? 'hourly' : 'fixed';
  } else if (budget) {
    payment_type = budget.toLowerCase().includes('/hr') ? 'hourly' : 'fixed';
  }

  const skillSelectors = [
    '[data-test="skill-badge"]',
    '.skill-badge',
    '[data-test="skills"] .badge',
    '.skills-list .badge',
  ];
  let skills = [];
  for (const sel of skillSelectors) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      skills = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
      break;
    }
  }

  const experience_level = firstText([
    '[data-test="experience-level"]',
    '.experience-level',
    '[data-test="contractor-tier"]',
  ]);

  const project_duration = firstText([
    '[data-test="duration"]',
    '[data-test="project-duration"]',
    '.duration',
    '.project-duration',
  ]);

  let posted_date = null;
  const timeEl = document.querySelector('[data-test="posted-on"] time, time[datetime]');
  if (timeEl) {
    posted_date = timeEl.getAttribute('datetime') || timeEl.textContent.trim() || null;
  } else {
    posted_date = firstText(['[data-test="posted-on"]', '.posted-on', '.posted-date']);
  }

  const proposals_count = firstText([
    '[data-test="proposals"]',
    '.proposals-count',
    '[data-test="proposals-count"]',
  ]);

  const paymentVerifiedEl = document.querySelector(
    '[data-test="payment-verified"], .payment-verified, [data-test="payment-status-verified"]'
  );
  const client_payment_verified = paymentVerifiedEl !== null;

  const client_location = firstText([
    '[data-test="client-location"]',
    '.client-location',
    '[data-test="location"]',
  ]);

  const client_rating = firstText([
    '[data-test="client-rating"] .rating',
    '[data-test="client-rating"]',
    '.client-rating .rating',
    '.client-rating',
  ]);

  const client_total_spent = firstText([
    '[data-test="total-spent"]',
    '.total-spent',
    '[data-test="client-total-spent"]',
  ]);

  const job = {
    job_id,
    title,
    url: pageUrl,
    description,
    budget,
    payment_type,
    skills,
    experience_level,
    project_duration,
    posted_date,
    proposals_count,
    client_payment_verified,
    client_location,
    client_rating,
    client_total_spent,
  };

  console.debug('[upwork-ext] detail scrape:', job_id, '— fields populated:', Object.values(job).filter(v => v !== null && v !== false).length, '/ 15');

  return job;
}

// ── Message listener ───────────────────────────────────────────────────────

console.log('[Content] Upwork Job Scraper content script loaded on:', window.location.href);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Message received:', message.action || message.type);

  if (message.type === 'PING') {
    sendResponse({ status: 'ok', url: window.location.href });
    return true;
  }

  if (message.action === 'scrapeSearch') {
    const jobs = scrapeSearchPage();
    sendResponse({ jobs });
    return true;
  }

  if (message.action === 'scrapeDetail') {
    const job = scrapeDetailPage();
    sendResponse({ job });
    return true;
  }

  return false;
});
