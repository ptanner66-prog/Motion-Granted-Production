/**
 * Sentry Edge Runtime Configuration
 *
 * SP-12: PII sanitization for edge functions (middleware, edge API routes).
 * Uses same sanitization as server config but runs in the Edge Runtime.
 */

import * as Sentry from '@sentry/nextjs';

/**
 * Edge-compatible PII sanitizer (no Node.js dependencies).
 */
function sanitizeEdgeString(input: string): string {
  if (typeof input !== 'string') return String(input);

  return input
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[PCI_REDACTED]')
    .replace(/\b(sk|pk)[-_](?:test|live)[-_]\w{20,}\b/g, '[CREDENTIAL_REDACTED]')
    .replace(/\bsk-ant-\w{20,}\b/g, '[CREDENTIAL_REDACTED]')
    .replace(/\bsk-\w{20,}\b/g, '[CREDENTIAL_REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT_REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
    .replace(/\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[PHONE_REDACTED]')
    .replace(/\bSSN\s*[:=]?\s*\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/gi, '[SSN_REDACTED]');
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // SP-12: Strip PII from edge events
  beforeSend(event) {
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        if (exception.value) {
          exception.value = sanitizeEdgeString(exception.value);
        }
      }
    }

    if (event.breadcrumbs) {
      for (const breadcrumb of event.breadcrumbs) {
        if (breadcrumb.message) {
          breadcrumb.message = sanitizeEdgeString(breadcrumb.message);
        }
      }
    }

    if (event.user) {
      event.user = { id: event.user.id };
    }

    return event;
  },

  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = sanitizeEdgeString(breadcrumb.message);
    }
    return breadcrumb;
  },
});
