/**
 * Transforms a Phase 2 scraper job object into the reference project schema.
 *
 * Scraped fields (Phase 2 names) are mapped and type-coerced.
 * Fields not available via DOM scraping default to "N/A" (strings) or 0 (numbers).
 *
 * Reference schema field names are case-sensitive and must not be changed.
 *
 * @param {Object} raw - Phase 2 scraper output (job_id, title, url, description, budget,
 *   payment_type, skills, experience_level, project_duration, posted_date,
 *   proposals_count, client_payment_verified, client_location, client_rating,
 *   client_total_spent)
 * @returns {Object} Reference-schema job object
 */
export function transformJob(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Parse "$5,460.99", "$5.5K", "$395", "$100K+" to float. Returns 0 on failure. */
  function parseMoney(str) {
    if (!str) return 0;
    const s = String(str);
    const mMatch = s.match(/\$([\d,]+\.?\d*)[Mm]/);
    const kMatch = s.match(/\$([\d,]+\.?\d*)[Kk]/);
    const plainMatch = s.match(/\$([\d,]+\.?\d*)/);
    if (mMatch) return parseFloat(mMatch[1].replace(/,/g, '')) * 1_000_000;
    if (kMatch) return parseFloat(kMatch[1].replace(/,/g, '')) * 1_000;
    if (plainMatch) return parseFloat(plainMatch[1].replace(/,/g, ''));
    return 0;
  }

  /** Parse proposals text "Less than 5", "5 to 10", "15" to integer. Returns 0 on failure. */
  function parseProposals(str) {
    if (!str) return 0;
    const ltMatch = String(str).match(/less than (\d+)/i);
    if (ltMatch) return parseInt(ltMatch[1], 10);
    const numMatch = String(str).match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1], 10) : 0;
  }

  /** Parse rating "4.9" or "Rating is 4.9 out of 5" to float. Returns 0 on failure. */
  function parseRating(str) {
    if (!str) return 0;
    const match = String(str).match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  }

  /** Map experience_level text to EXPERT / INTERMEDIATE / ENTRY_LEVEL. */
  function mapTier(str) {
    if (!str) return 'N/A';
    const lower = String(str).toLowerCase();
    if (lower.includes('expert')) return 'EXPERT';
    if (lower.includes('intermediate')) return 'INTERMEDIATE';
    if (lower.includes('entry')) return 'ENTRY_LEVEL';
    return String(str).toUpperCase();
  }

  /** Map payment_type to HOURLY / FIXED (uppercase). */
  function mapPaymentType(str) {
    if (!str) return 'N/A';
    const lower = String(str).toLowerCase();
    if (lower.includes('hourly') || lower.includes('/hr')) return 'HOURLY';
    if (lower.includes('fixed')) return 'FIXED';
    return String(str).toUpperCase();
  }

  /** Parse hourly budget string "e.g. $30.00–$50.00/hr" into { min, max }. */
  function parseHourlyRange(budgetStr, paymentType) {
    if (!budgetStr || paymentType !== 'HOURLY') return { min: 0, max: 0 };
    const rangeMatch = budgetStr.match(/\$([\d,]+\.?\d*)\s*[-\u2013]\s*\$([\d,]+\.?\d*)/);
    if (rangeMatch) {
      return {
        min: parseFloat(rangeMatch[1].replace(/,/g, '')) || 0,
        max: parseFloat(rangeMatch[2].replace(/,/g, '')) || 0,
      };
    }
    // Single value (e.g. "$100/hr") — treat as both min and max
    const singleMatch = budgetStr.match(/\$([\d,]+\.?\d*)/);
    const val = singleMatch ? parseFloat(singleMatch[1].replace(/,/g, '')) || 0 : 0;
    return { min: val, max: val };
  }

  /** Split "City, Country" or "Country Code" location string. */
  function parseLocation(str) {
    if (!str) return { country: 'N/A', city: 'N/A' };
    const parts = String(str).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { city: parts[0], country: parts[parts.length - 1] };
    return { country: parts[0] || 'N/A', city: 'N/A' };
  }

  /** Return ISO timestamp string if str looks like one, otherwise today's date. */
  function isoOrToday(str) {
    if (str && String(str).includes('T')) return str;
    return new Date().toISOString();
  }

  // ── Derive values ────────────────────────────────────────────────────────

  const paymentType = mapPaymentType(raw.payment_type || raw.budget);
  const hourlyRange = parseHourlyRange(raw.budget, paymentType);
  const location = parseLocation(raw.client_location);

  return {
    category: 'N/A',
    subcategory: 'N/A',
    postedAt: isoOrToday(raw.posted_date),
    publishTime: null,
    createTime: null,
    lastActivity: null,
    lastOnlineTime: 'N/A',
    currencyCode: 'N/A',
    hourlyMin: paymentType === 'HOURLY' ? hourlyRange.min : 0,
    hourlyMax: paymentType === 'HOURLY' ? hourlyRange.max : 0,
    projectBudget: paymentType === 'FIXED' ? parseMoney(raw.budget) : 0,
    weeklyRetainerBudget: 0,
    engagementDuration: raw.project_duration || 'N/A',
    engagementWeeks: 0,
    hourlyEngagementType: 'N/A',
    'Project Payment Type': paymentType,
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    contractorTier: mapTier(raw.experience_level),
    totalApplicants: parseProposals(raw.proposals_count),
    totalInvitedToInterview: 0,
    totalHired: 0,
    unansweredInvites: 0,
    invitationsSent: 0,
    numberOfPositionsToHire: 1,
    hireRate: 0,
    clientCountry: location.country,
    clientCity: location.city,
    feedbackScore: parseRating(raw.client_rating),
    feedbackCount: 0,
    totalCharges: parseMoney(raw.client_total_spent),
    totalJobsWithHires: 0,
    openedJobs: 0,
    isPaymentVerified: Boolean(raw.client_payment_verified),
    clientIndustry: 'N/A',
    clientCompanySize: 0,
    qualifications_regions: 'N/A',
    qualifications_worldRegion: 'N/A',
    qualifications_country: null,
    minJobSuccessScore: 0,
    englishLevel: 'N/A',
    Title: raw.title || 'N/A',
    URL: raw.url || 'N/A',
    Description: raw.description || 'N/A',
    'Job ID': raw.job_id || 'N/A',
  };
}
