import { extractJobId } from '../utils/job-parser.js';

/**
 * Scrapes job cards from the current Upwork search results page.
 * Returns an empty array if no cards are found — does not throw.
 *
 * @returns {Array<{job_id: string, title: string, url: string}>}
 */
export function scrapeSearchPage() {
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

  // Find card container selector that actually matches
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
