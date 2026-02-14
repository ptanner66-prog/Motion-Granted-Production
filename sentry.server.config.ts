/**
 * Sentry Server-Side Configuration
 *
 * SP-12: PII sanitization via beforeSend / beforeBreadcrumb hooks.
 * All event data passes through sanitizeObject() before transmission.
 */

import * as Sentry from '@sentry/nextjs';
import { sanitizeObject, sanitizePII } from '@/lib/security/sanitizer';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance monitoring — sample 10% in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // SP-12: Strip PII from all events before they leave the server
  beforeSend(event) {
    // Sanitize exception messages
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        if (exception.value) {
          exception.value = sanitizePII(exception.value);
        }
        // Sanitize stack frame local variables
        if (exception.stacktrace?.frames) {
          for (const frame of exception.stacktrace.frames) {
            if (frame.vars) {
              frame.vars = sanitizeObject(frame.vars) as Record<string, string>;
            }
          }
        }
      }
    }

    // Sanitize breadcrumb messages
    if (event.breadcrumbs) {
      for (const breadcrumb of event.breadcrumbs) {
        if (breadcrumb.message) {
          breadcrumb.message = sanitizePII(breadcrumb.message);
        }
        if (breadcrumb.data) {
          breadcrumb.data = sanitizeObject(breadcrumb.data) as Record<string, unknown>;
        }
      }
    }

    // Sanitize extra context
    if (event.extra) {
      event.extra = sanitizeObject(event.extra) as Record<string, unknown>;
    }

    // Sanitize request data
    if (event.request) {
      if (event.request.headers) {
        // Remove sensitive headers entirely
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }
      if (event.request.data) {
        event.request.data = sanitizeObject(event.request.data) as string;
      }
      if (event.request.query_string) {
        event.request.query_string = sanitizePII(
          typeof event.request.query_string === 'string'
            ? event.request.query_string
            : ''
        );
      }
    }

    // Strip user PII — keep only ID for correlation
    if (event.user) {
      event.user = { id: event.user.id };
    }

    return event;
  },

  // SP-12: Sanitize breadcrumbs as they're created
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = sanitizePII(breadcrumb.message);
    }
    if (breadcrumb.data) {
      breadcrumb.data = sanitizeObject(breadcrumb.data) as Record<string, unknown>;
    }
    return breadcrumb;
  },
});
