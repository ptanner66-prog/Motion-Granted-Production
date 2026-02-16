// lib/logging/logger.ts
// V-004: Safe structured logger
// Sanitizes all output to prevent privileged data leakage in Vercel logs
// Vercel function logs are visible to ALL team members with dashboard access

export interface SafeLogContext {
  orderId?: string;
  userId?: string;
  phase?: string;
  action: string;
}

const REDACT_PATTERNS = /body|content|facts|instructions|description|parties|filing_text|opposition_details|case_number|case_title|attorney_notes/i;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
const BAR_PATTERN = /\b[A-Z]{2}\d{5,7}\b/g;

export function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  try {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Remove keys matching privileged content patterns
      if (REDACT_PATTERNS.test(key)) continue;

      // Truncate Stripe objects to safe fields only
      if (key === 'stripe' || key === 'event' || key === 'session') {
        if (typeof value === 'object' && value !== null) {
          const obj = value as Record<string, unknown>;
          clean[key] = { id: obj.id, type: obj.type, status: obj.status, amount: obj.amount };
          continue;
        }
      }

      // Redact PII in string values
      if (typeof value === 'string') {
        clean[key] = value
          .replace(EMAIL_PATTERN, '[email]')
          .replace(PHONE_PATTERN, '[phone]')
          .replace(BAR_PATTERN, '[bar_number]');
        continue;
      }

      // Pass through safe types
      clean[key] = value;
    }
    return clean;
  } catch {
    return { sanitization_error: true };
  }
}

export function createLogger(service: string) {
  function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
    const entry = {
      level,
      service,
      message,
      timestamp: new Date().toISOString(),
      ...(meta ? sanitize(meta) : {}),
    };
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  return {
    info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
