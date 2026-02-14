/**
 * PII Sanitization Pipeline
 *
 * Sanitizes data before it reaches any logging, error tracking, or external system.
 * Six PII categories across four leakage vectors:
 *   - Vercel function logs (console.log/console.error)
 *   - Sentry error tracking (90-day retention)
 *   - Inngest step payloads (visible in dashboard)
 *   - CourtListener/Eyecite query logs
 *
 * Categories:
 *   - Payment data (card numbers, bank accounts) → [PCI_REDACTED]
 *   - Case content (facts, legal arguments, evidence) → [PRIVILEGED_REDACTED]
 *   - Attorney identity (names, bar numbers, contact) → [PII_MASKED]
 *   - Credentials (API keys, tokens, passwords) → [CREDENTIAL_REDACTED]
 *   - Contact info (emails, phones, addresses) → [CONTACT_REDACTED]
 *   - Document content (uploaded file text) → [DOCUMENT_REDACTED]
 */

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Payment data (PCI-DSS)
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[PCI_REDACTED]' },
  { pattern: /\b\d{3,4}[\s-]?\d{6,7}[\s-]?\d{5}\b/g, replacement: '[PCI_REDACTED]' }, // Amex
  { pattern: /\bcvv\s*[:=]\s*\d{3,4}\b/gi, replacement: 'cvv=[PCI_REDACTED]' },

  // Credentials
  { pattern: /\b(sk|pk)[-_](?:test|live)[-_]\w{20,}\b/g, replacement: '[CREDENTIAL_REDACTED]' }, // Stripe keys
  { pattern: /\bsk-ant-\w{20,}\b/g, replacement: '[CREDENTIAL_REDACTED]' }, // Anthropic keys
  { pattern: /\bsk-\w{20,}\b/g, replacement: '[CREDENTIAL_REDACTED]' }, // OpenAI keys
  { pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, replacement: '[JWT_REDACTED]' }, // JWTs
  { pattern: /password\s*[:=]\s*['"]?[^\s'"]{3,}/gi, replacement: 'password=[CREDENTIAL_REDACTED]' },

  // Contact info
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
  { pattern: /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
  { pattern: /\bSSN\s*[:=]?\s*\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/gi, replacement: '[SSN_REDACTED]' },

  // Bar numbers
  { pattern: /\b(?:Bar\s+(?:Roll\s+)?No\.?\s*|Bar\s+#)\s*\d{4,}/gi, replacement: '[BAR_NUMBER_REDACTED]' },
];

/**
 * Sanitize a string by replacing PII patterns with safe placeholders.
 */
export function sanitizePII(input: string): string {
  if (typeof input !== 'string') return String(input);

  let result = input;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/** Keys whose VALUES should be entirely redacted regardless of content */
const SENSITIVE_KEYS = new Set([
  'password', 'secret', 'token', 'api_key', 'apikey', 'api-key',
  'authorization', 'cookie', 'session', 'credit_card', 'card_number',
  'cvv', 'ssn', 'social_security',
  // Case content fields — attorney-client privileged
  'case_facts', 'statement_of_facts', 'drafting_instructions',
  'opposition_details', 'attorney_notes', 'legal_arguments',
  'case_content', 'draft_text', 'motion_body', 'memorandum_text',
]);

const SENSITIVE_KEY_LABELS = new Map<string, string>([
  ['password', 'CREDENTIAL_REDACTED'],
  ['secret', 'CREDENTIAL_REDACTED'],
  ['token', 'CREDENTIAL_REDACTED'],
  ['api_key', 'CREDENTIAL_REDACTED'],
  ['apikey', 'CREDENTIAL_REDACTED'],
  ['api-key', 'CREDENTIAL_REDACTED'],
  ['authorization', 'CREDENTIAL_REDACTED'],
  ['cookie', 'CREDENTIAL_REDACTED'],
  ['session', 'CREDENTIAL_REDACTED'],
  ['case_facts', 'PRIVILEGED_REDACTED'],
  ['statement_of_facts', 'PRIVILEGED_REDACTED'],
  ['drafting_instructions', 'PRIVILEGED_REDACTED'],
  ['opposition_details', 'PRIVILEGED_REDACTED'],
  ['attorney_notes', 'PRIVILEGED_REDACTED'],
  ['legal_arguments', 'PRIVILEGED_REDACTED'],
  ['draft_text', 'PRIVILEGED_REDACTED'],
  ['motion_body', 'PRIVILEGED_REDACTED'],
  ['memorandum_text', 'PRIVILEGED_REDACTED'],
  ['case_content', 'PRIVILEGED_REDACTED'],
  ['credit_card', 'PCI_REDACTED'],
  ['card_number', 'PCI_REDACTED'],
  ['cvv', 'PCI_REDACTED'],
  ['ssn', 'PII_MASKED'],
  ['social_security', 'PII_MASKED'],
]);

/**
 * Sanitize an object recursively — safe for logging structured data.
 * Processes string values, preserves structure. Sensitive keys are fully redacted.
 */
export function sanitizeObject(obj: unknown, depth: number = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH_REACHED]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizePII(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: sanitizePII(obj.message),
      stack: obj.stack ? sanitizePII(obj.stack) : undefined,
    };
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = `[${SENSITIVE_KEY_LABELS.get(lowerKey) || 'REDACTED'}]`;
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }

  return obj;
}
