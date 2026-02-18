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

  // title
  const title = firstText([
    '[data-test="job-title"] h1',
    'h1.job-title',
    'h1',
  ]);

  // description — join all paragraph text inside the description container
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

  // budget
  const budget = firstText([
    '[data-test="budget"]',
    '[data-test="hourly-rate"]',
    '.budget',
    '.hourly-rate',
  ]);

  // payment_type — detect "hourly" vs "fixed" from page context
  let payment_type = null;
  const jobTypeEl = document.querySelector('[data-test="job-type"]');
  if (jobTypeEl) {
    const raw = jobTypeEl.textContent.toLowerCase();
    payment_type = raw.includes('hourly') ? 'hourly' : 'fixed';
  } else if (budget) {
    payment_type = budget.toLowerCase().includes('/hr') ? 'hourly' : 'fixed';
  }

  // skills — collect all badge elements as text array
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

  // experience_level
  const experience_level = firstText([
    '[data-test="experience-level"]',
    '.experience-level',
    '[data-test="contractor-tier"]',
  ]);

  // project_duration
  const project_duration = firstText([
    '[data-test="duration"]',
    '[data-test="project-duration"]',
    '.duration',
    '.project-duration',
  ]);

  // posted_date — prefer datetime attribute for machine-readable value
  let posted_date = null;
  const timeEl = document.querySelector('[data-test="posted-on"] time, time[datetime]');
  if (timeEl) {
    posted_date = timeEl.getAttribute('datetime') || timeEl.textContent.trim() || null;
  } else {
    posted_date = firstText(['[data-test="posted-on"]', '.posted-on', '.posted-date']);
  }

  // proposals_count
  const proposals_count = firstText([
    '[data-test="proposals"]',
    '.proposals-count',
    '[data-test="proposals-count"]',
  ]);

  // client_payment_verified — boolean presence check
  const paymentVerifiedEl = document.querySelector(
    '[data-test="payment-verified"], .payment-verified, [data-test="payment-status-verified"]'
  );
  const client_payment_verified = paymentVerifiedEl !== null;

  // client_location
  const client_location = firstText([
    '[data-test="client-location"]',
    '.client-location',
    '[data-test="location"]',
  ]);

  // client_rating
  const client_rating = firstText([
    '[data-test="client-rating"] .rating',
    '[data-test="client-rating"]',
    '.client-rating .rating',
    '.client-rating',
  ]);

  // client_total_spent
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
