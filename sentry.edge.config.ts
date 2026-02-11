/**
 * Sentry Edge Runtime Configuration
 *
 * Initialized for middleware and edge functions.
 * PII is stripped — no user data sent.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Lower sample rate for edge (middleware runs on every request)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  environment: process.env.NODE_ENV || 'development',

  beforeSend(event: Sentry.ErrorEvent) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }
    return event;
  },
});
