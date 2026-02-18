/**
 * Extracts the Upwork job ID from a tilde-notation job URL.
 * Upwork URL pattern: /jobs/Title-words_~{alphanumeric-id}/
 * Also handles apply URLs: /apply/Title_~{id}
 *
 * @param {string} url - Absolute or relative Upwork job URL
 * @returns {string|null} - The job ID string, or null if not found
 */
export function extractJobId(url) {
  if (!url) return null;
  const match = url.match(/_~([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}
