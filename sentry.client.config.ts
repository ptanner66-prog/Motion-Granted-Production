/**
 * Sentry Client-Side Configuration
 *
 * Initialized in the browser for frontend error tracking and performance monitoring.
 * PII is stripped — no user emails, names, or IP addresses are sent.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring: sample 20% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Session replay for debugging (1% in production, 100% on error)
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // Environment tagging
  environment: process.env.NODE_ENV || 'development',

  // PII stripping — never send user data to Sentry
  beforeSend(event: Sentry.ErrorEvent) {
    // Strip user data
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }

    // Strip sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }

    return event;
  },

  // Ignore common non-actionable errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    'Network request failed',
    'Load failed',
    'ChunkLoadError',
  ],
});
