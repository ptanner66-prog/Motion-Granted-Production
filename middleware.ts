// /middleware.ts
// Security middleware per SECURITY_IMPLEMENTATION_CHECKLIST_v1
// VERSION: 2.0 — V-001: Redis-backed rate limiting via Upstash

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { validateCSRF } from '@/lib/security/csrf';
import { checkRateLimit, getClientIP, type RateLimitTier } from '@/lib/security/rate-limiter';

// ============================================================================
// REQUEST ID GENERATION
// ============================================================================

function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

// ============================================================================
// STATIC FILE EXTENSIONS ALLOWLIST (CGA7-001)
// Only these extensions bypass auth. Everything else goes through the full
// security pipeline — including paths like /api/admin/users.csv
// ============================================================================

const STATIC_EXTENSIONS = /\.(svg|png|jpe?g|gif|webp|ico|css|js|woff2?|map|txt)$/i;

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
    STATIC_EXTENSIONS.test(pathname)
  ) {
    return response;
  }

  // Add security headers to all responses
  response = addSecurityHeaders(response);

  // Create Supabase client
  // TOKEN REFRESH RACE CONDITION (DST-03):
  // The Supabase client initialized here uses the JWT from the current request cookie.
  // Token refresh may occur during this request via the onAuthStateChange listener.
  // The old token remains valid on the Supabase server until its exp claim.
  // If intermittent 401s appear in production logs at rates >0.01%,
  // investigate token refresh race condition.
  //
  // DEFERRED FIX: Implement request-scoped Supabase client caching via AsyncLocalStorage.
  // Pattern:
  //   import { AsyncLocalStorage } from 'async_hooks';
  //   const requestStorage = new AsyncLocalStorage<{ supabase: SupabaseClient }>();
  //   // In middleware: requestStorage.run({ supabase: client }, () => next());
  //   // In route handlers: const supabase = requestStorage.getStore()?.supabase;
  // This ensures every function in the same request uses the identical Supabase client
  // instance with the same JWT, eliminating the refresh race window entirely.
  // Trigger: implement when production 401 rate exceeds 0.01%.
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

  // CSRF protection — applied to all state-changing requests
  // Webhooks, Inngest, and cron routes are exempted in csrf.ts
  const csrfResult = validateCSRF(request);
  if (!csrfResult.valid) {
    console.warn(`[Middleware] CSRF blocked: ${csrfResult.reason}`);
    return NextResponse.json(
      { error: 'Request blocked by security policy' },
      { status: 403 }
    );
  }

  // AUD-035: Validate user token server-side. getUser() makes a Supabase network
  // call (~50-100ms) that cryptographically verifies the JWT, unlike getSession()
  // which only reads the cookie without verification.
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // V-001: Redis-backed rate limiting via Upstash Sliding Window
  // Use authenticated user ID when available; fall back to IP
  const clientId = user?.id || getClientIP(request);

  // ============================================================================
  // RATE LIMITING FOR API ROUTES (V-001: Redis-backed, fail-open)
  // ============================================================================

  if (pathname.startsWith('/api/')) {
    // Skip health checks from rate limiting
    if (pathname.startsWith('/api/health')) {
      response.headers.set('X-Request-Id', requestId);
      return response;
    }

    // Determine rate limit tier
    let limitTier: RateLimitTier = 'api';
    if (pathname.includes('/generate') || pathname.includes('/workflow/')) {
      limitTier = 'generate';
    } else if (pathname.includes('/auth') || pathname.includes('/login')) {
      limitTier = 'auth';
    }

    const rateLimit = await checkRateLimit(clientId, limitTier);

    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.reset - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': '0',
            'X-Request-Id': requestId,
          },
        }
      );
    }

    response.headers.set('X-RateLimit-Limit', String(rateLimit.limit));
    response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
  }

  // ============================================================================
  // PUBLIC API ROUTES (accessible without authentication)
  // /api/admin/states/metadata — intake form loads enabled states before login
  // ============================================================================

  const isPublicApiRoute = pathname === '/api/admin/states/metadata';

  // ============================================================================
  // PROTECTED ROUTES CHECK
  // ============================================================================

  const isProtectedRoute = !isPublicApiRoute && (
                          pathname.startsWith('/dashboard') ||
                          pathname.startsWith('/admin') ||
                          pathname.startsWith('/api/orders') ||
                          pathname.startsWith('/api/admin'));

  const isAdminRoute = !isPublicApiRoute && (
                       pathname.startsWith('/admin') ||
                       pathname.startsWith('/api/admin'));

  if (isProtectedRoute && (authError || !user)) {
    // API routes get JSON 401; page routes get redirected to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'X-Request-Id': requestId } }
      );
    }
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Admin route protection
  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // SEC-002: MFA enforcement for admin accounts
    // Skip MFA check on MFA setup/verify pages and MFA API routes
    const mfaMode = process.env.ADMIN_MFA_MODE?.toLowerCase().trim();
    const isMFARoute = pathname === '/admin/setup-mfa' ||
                       pathname === '/admin/verify-mfa' ||
                       pathname.startsWith('/api/auth/mfa');

    // CGA7-002: MFA enforcement applies to ALL admin routes (pages + API)
    // Only MFA setup/verify/enrollment endpoints are excluded
    if (mfaMode !== 'off' && !isMFARoute) {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factorsData } = await supabase.auth.mfa.listFactors();

      const hasVerifiedFactor = factorsData?.totp?.some(
        (f: { status: string }) => f.status === 'verified'
      );

      if (aalData?.currentLevel !== 'aal2') {
        // API routes get JSON 403; page routes get redirected
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'MFA required for admin access' },
            { status: 403, headers: { 'X-Request-Id': requestId } }
          );
        }
        if (hasVerifiedFactor) {
          // Factor enrolled but session is AAL1 — need to verify
          return NextResponse.redirect(new URL('/admin/verify-mfa', request.url));
        } else {
          // No factor enrolled — need to set up MFA
          return NextResponse.redirect(new URL('/admin/setup-mfa', request.url));
        }
      }
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
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.anthropic.com https://api.openai.com https://www.courtlistener.com https://*.inngest.com",
    // REMOVED (DST-10): https://*.clerk.accounts.dev — Clerk eliminated by ADR-001
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
