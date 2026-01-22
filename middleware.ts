/**
 * Next.js Middleware
 *
 * Production-grade middleware with:
 * - Rate limiting per user/IP
 * - Request logging
 * - Security headers
 * - Auth verification via Supabase
 */

import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

// In-memory rate limit store (per-instance)
// For full distributed rate limiting, see lib/redis.ts
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS = {
  api: { limit: 100, window: 60000 },      // 100 requests per minute
  generate: { limit: 5, window: 60000 },   // 5 generations per minute
  auth: { limit: 10, window: 60000 },      // 10 auth attempts per minute
};

function checkRateLimit(
  identifier: string,
  type: keyof typeof RATE_LIMITS
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const config = RATE_LIMITS[type];
  const now = Date.now();
  const key = `${type}:${identifier}`;

  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.window });
    return { allowed: true, remaining: config.limit - 1 };
  }

  if (entry.count >= config.limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: config.limit - entry.count };
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  return response;
}

// ============================================================================
// REQUEST ID GENERATION
// ============================================================================

function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

// ============================================================================
// MAIN MIDDLEWARE
// ============================================================================

export async function middleware(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const pathname = request.nextUrl.pathname;

  // Skip static files and internal Next.js routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Get client identifier for rate limiting
  const clientId = request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.ip ||
    'unknown';

  // ============================================================================
  // RATE LIMITING FOR API ROUTES
  // ============================================================================

  if (pathname.startsWith('/api/')) {
    // Skip health checks from rate limiting
    if (pathname.startsWith('/api/health')) {
      const response = NextResponse.next();
      response.headers.set('X-Request-Id', requestId);
      return response;
    }

    // Determine rate limit type
    let limitType: keyof typeof RATE_LIMITS = 'api';
    if (pathname.includes('/generate') || pathname.includes('/workflow/')) {
      limitType = 'generate';
    } else if (pathname.includes('/auth') || pathname.includes('/login')) {
      limitType = 'auth';
    }

    const rateLimit = checkRateLimit(clientId, limitType);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter),
            'X-RateLimit-Limit': String(RATE_LIMITS[limitType].limit),
            'X-RateLimit-Remaining': '0',
            'X-Request-Id': requestId,
          },
        }
      );
    }

    // Process the request with session update
    const response = await updateSession(request);
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMITS[limitType].limit));
    response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    response.headers.set('X-Request-Id', requestId);
    response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

    return addSecurityHeaders(response);
  }

  // ============================================================================
  // ALL OTHER ROUTES
  // ============================================================================

  const response = await updateSession(request);

  // Add request tracking headers
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

  return addSecurityHeaders(response);
}

// ============================================================================
// MATCHER CONFIGURATION
// ============================================================================

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
