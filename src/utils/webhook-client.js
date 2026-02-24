// WebhookClient — JS port of WebhookUtility (global class registry: http/webhook-utility.py)
// Sends job data to an n8n webhook URL via POST with exponential backoff retries.
// Fire-and-forget safe: errors are logged, never thrown.

/**
 * WebhookClient
 *
 * Stateless webhook dispatcher for MV3 service worker context.
 * Uses the Fetch API (no external dependencies).
 *
 * Port of: ~/.claude/classes/http/webhook-utility.py (WebhookUtility)
 * Adapted for: browser Fetch API, ES module export, synchronous construction
 */
export class WebhookClient {
  /**
   * Dispatch a single job object to the given webhook URL.
   *
   * Retries up to 3 times with exponential backoff:
   *   attempt 0 → 0ms delay
   *   attempt 1 → 1000ms delay
   *   attempt 2 → 2000ms delay
   *
   * Errors are logged via console.warn per attempt and console.error on exhaustion.
   * Never throws — returns false on complete failure.
   *
   * @param {string} url - The n8n webhook URL to POST to
   * @param {Object} jobData - Job object with field names matching reference project contract
   * @returns {Promise<boolean>} true on success, false after all retries exhausted
   */
  async dispatchJob(url, jobData) {
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Exponential backoff: attempt 0 = 0ms, attempt 1 = 1000ms, attempt 2 = 2000ms
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobData),
        });

        if (response.ok) {
          return true;
        }

        // Non-OK HTTP status (4xx, 5xx) — treat as failure, retry
        const statusText = `HTTP ${response.status} ${response.statusText}`;
        console.warn(`WebhookClient: attempt ${attempt + 1} failed: ${statusText}`);
      } catch (err) {
        // Network error (offline, DNS failure, CORS, etc.)
        console.warn(`WebhookClient: attempt ${attempt + 1} failed: ${err.message}`);
      }
    }

    // All 3 attempts exhausted
    console.error('WebhookClient: all retries failed for job', jobData.job_id);
    return false;
  }

  /**
   * Dispatch all jobs in a single POST request as a JSON array.
   * Retries up to 3 times with exponential backoff.
   *
   * @param {string} url - The n8n webhook URL to POST to
   * @param {Object[]} jobs - Array of transformed job objects
   * @returns {Promise<boolean>} true on success, false after all retries exhausted
   */
  async dispatchBatch(url, jobs) {
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobs),
        });

        if (response.ok) {
          return true;
        }

        const statusText = `HTTP ${response.status} ${response.statusText}`;
        console.warn(`WebhookClient: batch attempt ${attempt + 1} failed: ${statusText}`);
      } catch (err) {
        console.warn(`WebhookClient: batch attempt ${attempt + 1} failed: ${err.message}`);
      }
    }

    console.error('WebhookClient: all batch retries failed for', jobs.length, 'jobs');
    return false;
  }
}
