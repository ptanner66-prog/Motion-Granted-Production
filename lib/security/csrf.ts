/**
 * CSRF Protection via Origin/Referer header validation.
 *
 * For API-first apps with Supabase Auth, Origin-based CSRF protection is
 * simpler and equally effective as token-based approaches. Browsers automatically
 * send Origin headers on cross-origin requests, and JavaScript cannot spoof them.
 *
 * HOW IT WORKS:
 * 1. Safe methods (GET/HEAD/OPTIONS) are always allowed
 * 2. Requests without an Origin header are same-origin (allowed)
 * 3. Requests with an Origin header must match our allowed origins
 * 4. Webhooks and Inngest have their own auth (exempted)
 *
 * Created: SP15 (0B-9)
 * Resolves: C-026
 */

import { NextRequest } from 'next/server';

/**
 * Allowed origins for cross-origin requests.
 * Includes production domain, Vercel preview, and local dev.
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = [
    'https://motion-granted.com',
    'https://www.motion-granted.com',
    'https://motion-granted-production.vercel.app',
  ];

  // Add configured app URL (handles custom domains and previews)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && !origins.includes(appUrl)) {
    origins.push(appUrl);
  }

  // Allow localhost in development
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000');
    origins.push('http://localhost:3001');
  }

  return origins;
}

/** Route prefixes exempt from CSRF validation */
const EXEMPT_PREFIXES = [
  '/api/webhooks/',    // Stripe webhooks — have signature verification
  '/api/inngest',      // Inngest — has signing key verification
  '/api/cron/',        // Cron jobs — have CRON_SECRET verification
] as const;

/**
 * Validate that a request does not violate CSRF protections.
 *
 * @param request - The incoming Next.js request
 * @returns Object with `valid` boolean and optional `reason` string
 *
 * @example
 * const result = validateCSRF(request);
 * if (!result.valid) {
 *   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 * }
 */
export function validateCSRF(request: NextRequest): {
  valid: boolean;
  reason?: string;
} {
  const method = request.method.toUpperCase();
  const pathname = request.nextUrl.pathname;

  // Safe methods don't need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { valid: true };
  }

  // Exempt routes have their own authentication
  if (EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return { valid: true };
  }

  const origin = request.headers.get('origin');

  // No Origin header = same-origin request
  // Browsers always send Origin on cross-origin POST/PUT/DELETE
  // Same-origin requests may or may not include it
  if (!origin) {
    return { valid: true };
  }

  // Validate origin against allowed list
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) {
    return { valid: true };
  }

  // Check Referer as fallback (some browsers send Referer but not Origin)
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (allowed.includes(refererOrigin)) {
        return { valid: true };
      }
    } catch {
      // Malformed referer — fall through to rejection
    }
  }

  return {
    valid: false,
    reason: `Origin '${origin}' not in allowed list for ${method} ${pathname}`,
  };
}
