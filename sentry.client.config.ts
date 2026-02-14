/**
 * Sentry Client-Side Configuration
 *
 * SP-12: PII sanitization via beforeSend / beforeBreadcrumb hooks.
 * Client-side events are sanitized before transmission to Sentry.
 *
 * NOTE: Client-side cannot import Node.js crypto, so we inline a
 * lightweight version of the PII pattern sanitizer here.
 */

import * as Sentry from '@sentry/nextjs';

/**
 * Lightweight client-side PII sanitizer (no Node.js dependencies).
 * Mirrors the critical patterns from lib/security/sanitizer.ts.
 */
function sanitizeClientString(input: string): string {
  if (typeof input !== 'string') return String(input);

  return input
    // Credit cards
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[PCI_REDACTED]')
    // API keys (Stripe, Anthropic, OpenAI)
    .replace(/\b(sk|pk)[-_](?:test|live)[-_]\w{20,}\b/g, '[CREDENTIAL_REDACTED]')
    .replace(/\bsk-ant-\w{20,}\b/g, '[CREDENTIAL_REDACTED]')
    .replace(/\bsk-\w{20,}\b/g, '[CREDENTIAL_REDACTED]')
    // JWTs
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT_REDACTED]')
    // Emails
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
    // Phone numbers
    .replace(/\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[PHONE_REDACTED]')
    // SSNs
    .replace(/\bSSN\s*[:=]?\s*\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/gi, '[SSN_REDACTED]');
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Replay for debugging (1% session, 100% on error)
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // SP-12: Mask all user input to prevent PII capture in replays
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: false,
    }),
  ],

  // SP-12: Strip PII from all client events
  beforeSend(event) {
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        if (exception.value) {
          exception.value = sanitizeClientString(exception.value);
        }
      }
    }

    if (event.breadcrumbs) {
      for (const breadcrumb of event.breadcrumbs) {
        if (breadcrumb.message) {
          breadcrumb.message = sanitizeClientString(breadcrumb.message);
        }
      }
    }

    // Strip user PII — keep only ID
    if (event.user) {
      event.user = { id: event.user.id };
    }

    return event;
  },

  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = sanitizeClientString(breadcrumb.message);
    }
    return breadcrumb;
  },
});
