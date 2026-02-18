// CsvExporter — Upwork Job Assistant
// Generates RFC 4180-compliant CSV from stored job objects.
// Field names match the reference n8n project schema exactly (case-sensitive).

const FIELD_ORDER = [
  'category', 'subcategory', 'postedAt', 'publishTime', 'createTime',
  'lastActivity', 'lastOnlineTime', 'currencyCode', 'hourlyMin', 'hourlyMax',
  'projectBudget', 'weeklyRetainerBudget', 'engagementDuration', 'engagementWeeks',
  'hourlyEngagementType', 'Project Payment Type', 'skills', 'contractorTier',
  'totalApplicants', 'totalInvitedToInterview', 'totalHired', 'unansweredInvites',
  'invitationsSent', 'numberOfPositionsToHire', 'hireRate', 'clientCountry',
  'clientCity', 'feedbackScore', 'feedbackCount', 'totalCharges',
  'totalJobsWithHires', 'openedJobs', 'isPaymentVerified', 'clientIndustry',
  'clientCompanySize', 'qualifications_regions', 'qualifications_worldRegion',
  'qualifications_country', 'minJobSuccessScore', 'englishLevel',
  'Title', 'URL', 'Description', 'Job ID',
];

/**
 * Escapes a single CSV field value per RFC 4180:
 * - null/undefined → empty string
 * - Arrays → join with semicolons, then escape
 * - Values containing comma, double-quote, or newline → wrap in double-quotes
 * - Internal double-quotes → doubled ("")
 *
 * @param {*} value
 * @returns {string}
 */
function escapeField(value) {
  if (value === null || value === undefined) {
    return '';
  }

  // Arrays (e.g. skills) — join with semicolons before escaping
  if (Array.isArray(value)) {
    value = value.join(';');
  }

  const str = String(value);

  // Wrap in double-quotes if the value contains a comma, double-quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}

export class CsvExporter {
  /**
   * Generates an RFC 4180 CSV string from an array of job objects.
   * Each job object is expected to have fields matching FIELD_ORDER (pre-transformed).
   *
   * @param {Object[]} jobs - Array of job objects from lastScrapedJobs storage
   * @returns {string} Complete CSV string (header + data rows joined by CRLF)
   */
  generateCsv(jobs) {
    const header = FIELD_ORDER.join(',');

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return header;
    }

    const rows = jobs.map((job) => {
      return FIELD_ORDER.map((field) => escapeField(job[field])).join(',');
    });

    return [header, ...rows].join('\r\n');
  }
}
