/**
 * Sanitized Structured Logger
 *
 * Wraps console output with PII sanitization. All string values pass through
 * sanitizePII() and all objects through sanitizeObject() before reaching
 * Vercel function logs.
 *
 * Usage:
 *   import { createLogger } from '@/lib/security/logger';
 *   const log = createLogger('phase-executors');
 *   log.info('Phase completed', { phase: 'IV', orderId });
 *   log.error('Phase failed', { error: err.message, orderId });
 */

import { sanitizePII, sanitizeObject } from './sanitizer';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  service: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

/**
 * Create a service-specific logger that sanitizes all output.
 *
 * All string values are run through sanitizePII().
 * All objects are run through sanitizeObject().
 * Sensitive keys (case_facts, draft_text, etc.) are automatically redacted.
 */
export function createLogger(service: string) {
  function log(level: LogLevel, message: string, data?: unknown) {
    const entry: LogEntry = {
      level,
      service,
      message: sanitizePII(message),
      timestamp: new Date().toISOString(),
    };

    if (data !== undefined) {
      entry.data = sanitizeObject(data);
    }

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
         
        console.error(output);
        break;
      case 'warn':
         
        console.warn(output);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(output);
    }
  }

  return {
    debug: (message: string, data?: unknown) => log('debug', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    error: (message: string, data?: unknown) => log('error', message, data),
  };
}

/** Convenience export for quick usage without creating a named logger */
export const logger = createLogger('app');
