/**
 * Sentry Server-Side Configuration
 *
 * Initialized on the server for API route error tracking and performance monitoring.
 * PII is stripped — no user emails, names, or IP addresses are sent.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring: sample 20% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Environment tagging
  environment: process.env.NODE_ENV || 'development',

  // PII stripping
  beforeSend(event: Sentry.ErrorEvent) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }

    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-supabase-auth'];
    }

    // Strip Supabase connection strings from breadcrumbs
    if (event.breadcrumbs) {
      for (const crumb of event.breadcrumbs) {
        if (crumb.data?.url && typeof crumb.data.url === 'string') {
          if (crumb.data.url.includes('supabase.co')) {
            crumb.data.url = '[SUPABASE_URL]';
          }
        }
      }
    }

    return event;
  },
});
