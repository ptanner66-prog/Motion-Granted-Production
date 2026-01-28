// /middleware.ts
// Security middleware per SECURITY_IMPLEMENTATION_CHECKLIST_v1
// VERSION: 1.0 — January 28, 2026

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Skip static files and internal Next.js routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return response;
  }

  // Add security headers to all responses
  response = addSecurityHeaders(response);

  // Create Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session if needed
  const { data: { session } } = await supabase.auth.getSession();

  // Get client identifier for rate limiting
  const clientId = request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // ============================================================================
  // RATE LIMITING FOR API ROUTES
  // ============================================================================

  if (pathname.startsWith('/api/')) {
    // Skip health checks from rate limiting
    if (pathname.startsWith('/api/health')) {
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

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMITS[limitType].limit));
    response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
  }

  // ============================================================================
  // PROTECTED ROUTES CHECK
  // ============================================================================

  const isProtectedRoute = pathname.startsWith('/dashboard') ||
                          pathname.startsWith('/admin') ||
                          pathname.startsWith('/api/orders') ||
                          pathname.startsWith('/api/admin');

  const isAdminRoute = pathname.startsWith('/admin') ||
                       pathname.startsWith('/api/admin');

  if (isProtectedRoute && !session) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Admin route protection
  if (isAdminRoute && session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Add request tracking headers
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

  return response;
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Strict Transport Security
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Content Security Policy
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.anthropic.com",
    "frame-src 'self' https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; '));

  // Other security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
