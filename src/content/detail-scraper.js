import { extractJobId } from '../utils/job-parser.js';

/**
 * Tries a list of CSS selectors in order, returns the first match's trimmed textContent.
 * Returns null if none match.
 *
 * @param {string[]} selectors
 * @returns {string|null}
 */
function firstText(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return null;
}

/**
 * Scrapes the current Upwork job detail page.
 * Returns an object with all 15 reference-project fields.
 * Missing fields are null, never undefined.
 *
 * @returns {Object} Full job object with reference-project field names
 */
export function scrapeDetailPage() {
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
