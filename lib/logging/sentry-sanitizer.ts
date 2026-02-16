// lib/logging/sentry-sanitizer.ts
// V-005: Sentry PII sanitization
// Set sendDefaultPii: false in both sentry.*.config.ts
// Add beforeSend: sanitizeEvent, beforeBreadcrumb: sanitizeBreadcrumb

import type { Event, Breadcrumb } from '@sentry/nextjs';

const PII_PATTERNS = /email|phone|bar_number|case_number|case_title|party|attorney|billing|card|ssn|password/i;

export function sanitizeEvent(event: Event): Event | null {
  try {
    // Strip request body
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }

    // Redact user context to ID only
    if (event.user) {
      event.user = { id: event.user.id };
    }

    // Scrub extra context
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (PII_PATTERNS.test(key)) {
          delete event.extra[key];
        }
      }
    }

    // Scrub PII from error messages
    if (event.message) {
      event.message = event.message.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '[email]'
      );
    }

    return event;
  } catch {
    // If sanitization itself fails, drop the event entirely
    console.error('[Sentry] Event sanitization failed, event dropped.');
    return null;
  }
}

export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console breadcrumbs capture console.log arguments — strip entirely
  if (breadcrumb.category === 'console') {
    delete breadcrumb.data;
  }
  // Fetch breadcrumbs: keep URL + status, strip bodies
  if (breadcrumb.category === 'fetch' && breadcrumb.data) {
    breadcrumb.data = {
      url: breadcrumb.data.url,
      status_code: breadcrumb.data.status_code,
    };
  }
  return breadcrumb;
}
