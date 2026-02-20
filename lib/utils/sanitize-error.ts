/**
 * A-027: PII sanitization for error logging
 *
 * Strips personally identifiable information from error messages before
 * they reach log aggregation (Sentry, Vercel logs, etc.).
 *
 * Targets: email addresses, common case number patterns, SSNs,
 * phone numbers. UUIDs (order IDs) are NOT PII and are preserved.
 */

/**
 * Strip PII patterns from a string before logging.
 */
export function sanitizeForLog(message: string): string {
  if (!message || typeof message !== 'string') return message;

  return message
    // Strip email addresses
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    // Strip common case number patterns (XX-XXXX, XX-CV-XXXX, XX:XX-cv-XXXXX, etc.)
    .replace(/\b\d{1,4}[-–:]\w{1,5}[-–:]\d{3,10}\b/g, '[CASE_NO]')
    // Strip SSN patterns (XXX-XX-XXXX)
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    // Strip US phone numbers
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');
}

/**
 * Extract error message from unknown error and sanitize PII.
 */
export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeForLog(message);
}
