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
  // Handles both /~ (new format) and _~ (old format) Upwork URL patterns
  const match = url.match(/[/_]~([a-zA-Z0-9]+)/);
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

  // title — search first card section for the largest short span (no h1 on Upwork)
  let title = null;
  const firstCard = document.querySelector('.air3-card-section');
  if (firstCard) {
    for (const span of firstCard.querySelectorAll('span')) {
      const t = span.textContent.trim();
      if (t.length > 10 && t.length < 300 && !t.includes('ago') && !t.includes('Posted') && !t.includes('profile')) {
        title = t;
        break;
      }
    }
  }
  // Fallback: strip site suffix from document.title ("Job Title - Upwork")
  if (!title && document.title) {
    const parts = document.title.split(' - ');
    if (parts.length > 1) parts.pop();
    title = parts.join(' - ').trim() || null;
  }

  // description — air3-card-section containing "Summary" heading
  let description = null;
  for (const section of document.querySelectorAll('.air3-card-section')) {
    const heading = section.querySelector('strong');
    if (heading && heading.textContent.trim() === 'Summary') {
      description = section.textContent.replace('Summary', '').trim() || null;
      break;
    }
  }
  if (!description) {
    const descSelectors = ['[data-test="description"]', '.job-description'];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el) { description = el.textContent.trim() || null; break; }
    }
  }

  // budget — strong inside p.m-0
  const budget = firstText([
    'p.m-0 > strong',
    '[data-test="budget"]',
    '[data-test="hourly-rate"]',
    '.budget',
    '.hourly-rate',
  ]);

  // payment_type — div.description or span.type contains "Fixed-price" or "Hourly"
  let payment_type = null;
  const paymentTypeEl = document.querySelector('div.description, span.type');
  if (paymentTypeEl) {
    const raw = paymentTypeEl.textContent.toLowerCase();
    if (raw.includes('hourly')) payment_type = 'hourly';
    else if (raw.includes('fixed')) payment_type = 'fixed';
  } else if (budget) {
    payment_type = budget.toLowerCase().includes('/hr') ? 'hourly' : 'fixed';
  }

  // skills — .skills-list .badge works on current Upwork DOM
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

  // experience_level — match known Upwork values in any strong element
  let experience_level = null;
  const expLevels = ['Entry Level', 'Intermediate', 'Expert'];
  for (const strong of document.querySelectorAll('strong')) {
    if (expLevels.includes(strong.textContent.trim())) {
      experience_level = strong.textContent.trim();
      break;
    }
  }

  // project_duration — .segmentations contains "Project Type: Ongoing project"
  let project_duration = null;
  const segEl = document.querySelector('.segmentations');
  if (segEl) {
    const segText = segEl.textContent.trim();
    project_duration = segText.replace(/^Project\s*Type:\s*/i, '').trim() || null;
  }
  if (!project_duration) {
    project_duration = firstText([
      '[data-test="duration"]',
      '[data-test="project-duration"]',
      '.duration',
      '.project-duration',
    ]);
  }

  // posted_date — span containing "ago" inside the first air3-card-section
  let posted_date = null;
  const timeEl = document.querySelector('[data-test="posted-on"] time, time[datetime]');
  if (timeEl) {
    posted_date = timeEl.getAttribute('datetime') || timeEl.textContent.trim() || null;
  }
  if (!posted_date) {
    const firstCard = document.querySelector('.air3-card-section');
    if (firstCard) {
      for (const span of firstCard.querySelectorAll('span')) {
        const t = span.textContent.trim();
        if (t.includes('ago') && t.length < 30) { posted_date = t; break; }
      }
    }
  }
  if (!posted_date) {
    posted_date = firstText(['[data-test="posted-on"]', '.posted-on', '.posted-date']);
  }

  // proposals_count — span.value matching "Less than N" or "N to M" patterns
  let proposals_count = null;
  for (const span of document.querySelectorAll('span.value')) {
    const t = span.textContent.trim();
    if (/^(Less than|\d)/.test(t) && !t.includes('ago') && !t.includes('hour') && !t.includes('day') && !t.includes('minute')) {
      proposals_count = t;
      break;
    }
  }
  if (!proposals_count) {
    proposals_count = firstText([
      '[data-test="proposals"]',
      '.proposals-count',
      '[data-test="proposals-count"]',
    ]);
  }

  // client_payment_verified — strong containing "Payment method verified"
  let client_payment_verified = false;
  for (const strong of document.querySelectorAll('strong')) {
    if (strong.textContent.includes('Payment method verified')) {
      client_payment_verified = true;
      break;
    }
  }
  if (!client_payment_verified) {
    const el = document.querySelector('[data-test="payment-verified"], .payment-verified');
    client_payment_verified = el !== null;
  }

  // client_location — first strong in .features.text-light-on-muted.list-unstyled
  // that doesn't contain "$", "jobs", or "rate"
  let client_location = null;
  const clientList = document.querySelector('.features.text-light-on-muted.list-unstyled');
  if (clientList) {
    for (const strong of clientList.querySelectorAll('strong')) {
      const t = strong.textContent.trim();
      if (!t.includes('$') && !t.includes('jobs') && !t.includes('rate') && !t.includes('verified')) {
        client_location = t;
        break;
      }
    }
  }
  if (!client_location) {
    client_location = firstText([
      '[data-test="client-location"]',
      '.client-location',
      '[data-test="location"]',
    ]);
  }

  // client_rating — parse from span.sr-only "Rating is X.X out of 5"
  let client_rating = null;
  for (const span of document.querySelectorAll('span.sr-only')) {
    const text = span.textContent.trim();
    if (text.startsWith('Rating is')) {
      const match = text.match(/Rating is (\d+\.?\d*) out of/);
      if (match) { client_rating = match[1]; break; }
    }
  }
  if (!client_rating) {
    client_rating = firstText([
      '[data-test="client-rating"] .rating',
      '[data-test="client-rating"]',
      '.client-rating',
    ]);
  }

  // client_total_spent — strong containing "total spent" in the client info list
  let client_total_spent = null;
  if (clientList) {
    for (const strong of clientList.querySelectorAll('strong')) {
      if (strong.textContent.includes('total spent')) {
        client_total_spent = strong.textContent.replace('total spent', '').trim();
        break;
      }
    }
  }
  if (!client_total_spent) {
    client_total_spent = firstText([
      '[data-test="total-spent"]',
      '.total-spent',
      '[data-test="client-total-spent"]',
    ]);
  }

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

  console.debug('[upwork-ext] detail scrape:', job_id, '— fields populated:', Object.values(job).filter(v => v !== null && v !== false && !(Array.isArray(v) && v.length === 0)).length, '/ 15');

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

// ── Search page: collect job IDs and inject colored match status icons ──────

/**
 * Collects job IDs from all visible job cards, sends GET_MATCH_STATUS to the
 * service worker, and injects a colored circle icon next to each matching
 * job title link based on the returned status map.
 *
 * Status colors:
 *   match    → #22c55e (green)
 *   no_match → #ef4444 (red)
 *   applied  → #3b82f6 (blue)
 */
function initSearchPage() {
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

  // Retry up to 5 times every 800ms — handles slow/variable SPA render times.
  let attempt = 0;
  const MAX_ATTEMPTS = 5;
  const RETRY_MS = 800;

  function tryFindCards() {
    attempt++;
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = Array.from(found); break; }
    }

    if (cards.length === 0) {
      if (attempt < MAX_ATTEMPTS) {
        console.debug('[upwork-ext] initSearchPage: no cards yet, retry', attempt, '/', MAX_ATTEMPTS);
        setTimeout(tryFindCards, RETRY_MS);
      } else {
        console.log('[upwork-ext] initSearchPage: no job cards found after', MAX_ATTEMPTS, 'attempts');
      }
      return;
    }

    // Build map of job_id → anchor element
    const jobIdToAnchor = new Map();
    for (const card of cards) {
      let anchor = null;
      for (const sel of linkSelectors) {
        anchor = card.querySelector(sel);
        if (anchor) break;
      }
      if (!anchor) continue;
      const href = anchor.getAttribute('href') || '';
      const absoluteUrl = href.startsWith('http') ? href : `https://www.upwork.com${href}`;
      const job_id = extractJobId(absoluteUrl);
      if (!job_id) continue;
      jobIdToAnchor.set(job_id, anchor);
    }

    const jobIds = Array.from(jobIdToAnchor.keys());
    if (jobIds.length === 0) {
      console.log('[upwork-ext] initSearchPage: cards found but no job IDs extracted');
      return;
    }

    console.debug('[upwork-ext] initSearchPage: attempt', attempt, '— requesting match status for', jobIds.length, 'jobs');

  chrome.runtime.sendMessage({ action: 'GET_MATCH_STATUS', jobIds }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[upwork-ext] GET_MATCH_STATUS error:', chrome.runtime.lastError.message);
      return;
    }
    if (!response || !response.success) {
      console.warn('[upwork-ext] GET_MATCH_STATUS unsuccessful:', response?.error);
      return;
    }

    const statusColors = {
      match: '#22c55e',
      no_match: '#ef4444',
      applied: '#3b82f6',
    };

    for (const [jobId, status] of Object.entries(response.statuses)) {
      const anchor = jobIdToAnchor.get(jobId);
      if (!anchor) continue;

      // Skip if icon already injected (handles SPA re-runs)
      if (anchor.nextElementSibling && anchor.nextElementSibling.classList.contains('upwork-ext-status-icon')) continue;

      const color = statusColors[status];
      if (!color) continue; // unknown status — no icon

      const icon = document.createElement('span');
      icon.className = 'upwork-ext-status-icon';
      icon.style.cssText = 'border-radius:50%;width:10px;height:10px;display:inline-block;margin-left:6px;vertical-align:middle;';
      icon.style.backgroundColor = color;
      icon.title = status; // tooltip for accessibility

      anchor.insertAdjacentElement('afterend', icon);
    }

    console.debug('[upwork-ext] initSearchPage: icons injected for', Object.keys(response.statuses).length, 'statuses');
    });
  }

  tryFindCards();
}

// ── Detail page: inject "Scrape Job" button (INJC-02) ────────────────────

/**
 * Injects a green "Scrape Job" button near the job title on detail pages.
 * On click, calls scrapeDetailPage() and sends PUSH_JOBS to the service worker.
 * Shows transient "Sent!" or "Failed" feedback, then resets after 2s.
 * Safe to call multiple times — exits early if button already present.
 */
function initDetailPage() {
  // Confirm we're on a job detail page via URL pattern
  const urlMatch = location.pathname.match(/\/jobs\/~([a-z0-9]+)/i);
  if (!urlMatch) return;

  // Prevent duplicate injection on SPA re-runs
  if (document.getElementById('upwork-ext-scrape-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'upwork-ext-scrape-btn';
  btn.textContent = 'Scrape Job';
  btn.style.cssText = 'background:#14a800;color:white;padding:8px 16px;border:none;border-radius:4px;cursor:pointer;font-size:14px;margin-top:8px;display:block;';

  btn.addEventListener('click', () => {
    const jobData = scrapeDetailPage();
    if (!jobData) {
      console.warn('[upwork-ext] initDetailPage: detail scrape returned nothing');
      return;
    }
    chrome.runtime.sendMessage({ action: 'PUSH_JOBS', jobs: [jobData] }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[upwork-ext] PUSH_JOBS error:', chrome.runtime.lastError.message);
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Scrape Job'; }, 2000);
        return;
      }
      btn.textContent = response?.success ? 'Sent!' : 'Failed';
      setTimeout(() => { btn.textContent = 'Scrape Job'; }, 2000);
    });
  });

  // Inject after h1 if present, otherwise prepend to body as fallback
  const h1 = document.querySelector('h1');
  if (h1) {
    h1.insertAdjacentElement('afterend', btn);
  } else {
    document.body.prepend(btn);
  }

  console.debug('[upwork-ext] initDetailPage: Scrape Job button injected for job', urlMatch[1]);
}

// ── SPA navigation router ─────────────────────────────────────────────────

/**
 * Routes the current page to the appropriate init function.
 * Called on initial load and on every SPA URL change detected by the observer.
 */
function routePage() {
  const path = location.pathname;
  const search = location.search;

  // Detail page: /jobs/~<id> — check first (more specific match)
  const isDetailPage = /\/jobs\/~[a-z0-9]+/i.test(path);

  // Search results: /nx/search/jobs or path with /search
  const isSearchPage = (
    path.includes('/search') ||
    (path.includes('/jobs') && !isDetailPage)
  ) && (search.includes('q=') || path.includes('/search'));

  if (isDetailPage) {
    // Wait briefly for SPA content to render before injecting button
    setTimeout(initDetailPage, 500);
  } else if (isSearchPage) {
    // initSearchPage retries internally every 800ms — no outer delay needed
    initSearchPage();
  }
}

// Observe URL changes for SPA navigation
// Track full href (not just pathname) so search-to-search navigation
// (same /nx/search/jobs/ path, different ?q= params) also re-triggers.
let lastUrl = location.href;
const _spaObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.debug('[upwork-ext] SPA navigation detected:', location.href);
    routePage();
  }
});
_spaObserver.observe(document.body, { childList: true, subtree: true });

// Run on initial script load
routePage();
