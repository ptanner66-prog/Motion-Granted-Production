/**
 * URL Validation for Email Templates
 *
 * Ensures URLs in emails point to trusted domains only.
 * Prevents phishing attacks via manipulated email links.
 */

// Allowed domains for email links
const ALLOWED_DOMAINS = [
  'motiongranted.com',
  'www.motiongranted.com',
  'app.motiongranted.com',
  // Add localhost for development
  ...(process.env.NODE_ENV === 'development' ? ['localhost', '127.0.0.1'] : []),
];

// Allowed protocols
const ALLOWED_PROTOCOLS = ['https:', 'mailto:'];

/**
 * Validates that a URL is safe to include in email templates
 * @param url The URL to validate
 * @param allowedDomains Optional override for allowed domains
 * @returns true if URL is safe, false otherwise
 */
export function isValidEmailUrl(url: string | undefined, allowedDomains?: string[]): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);

    // Allow mailto: links
    if (parsed.protocol === 'mailto:') {
      return true;
    }

    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    // Check domain
    const domains = allowedDomains || ALLOWED_DOMAINS;
    const hostname = parsed.hostname.toLowerCase();

    return domains.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Sanitizes a URL for email templates
 * Returns the URL if valid, or a fallback URL if not
 * @param url The URL to sanitize
 * @param fallback The fallback URL if validation fails
 * @returns A safe URL
 */
export function sanitizeEmailUrl(url: string | undefined, fallback: string): string {
  if (isValidEmailUrl(url)) {
    return url!;
  }

  // Log potential attack attempt
  if (url && process.env.NODE_ENV === 'production') {
    console.warn(`[EMAIL SECURITY] Blocked potentially malicious URL: ${url}`);
  }

  return fallback;
}

/**
 * Sanitizes email content to prevent header injection
 * @param content The content to sanitize
 * @returns Sanitized content safe for email
 */
export function sanitizeEmailContent(content: string | undefined): string {
  if (!content) return '';

  // Remove characters that could enable header injection
  return content
    .replace(/[\r\n]/g, ' ')  // Remove newlines
    .replace(/\0/g, '')       // Remove null bytes
    .trim();
}

/**
 * Validates and sanitizes a numeric value for email display
 * @param value The value to validate
 * @param min Minimum allowed value
 * @param max Maximum allowed value
 * @returns Validated number or min if invalid
 */
export function sanitizeEmailNumber(
  value: number | undefined,
  min: number = 0,
  max: number = Number.MAX_SAFE_INTEGER
): number {
  if (value === undefined || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Sanitizes a price amount for email display
 * @param amount The amount in cents
 * @returns Formatted price string
 */
export function formatEmailPrice(amount: number | undefined): string {
  const sanitized = sanitizeEmailNumber(amount, 0, 100000000); // Max $1M
  return `$${(sanitized / 100).toFixed(2)}`;
}
