/**
 * Rate Limiting Middleware (Task 69)
 *
 * Rate limiting for all API endpoints using sliding window algorithm.
 *
 * Limits:
 * - Public endpoints: 60 requests/minute per IP
 * - Authenticated endpoints: 120 requests/minute per user
 * - Webhook endpoints: 1000 requests/minute (Stripe, Inngest)
 * - Admin endpoints: 300 requests/minute per admin
 *
 * Source: Chunk 10, Task 69 - P2 Pre-Launch
 */

import { NextResponse } from 'next/server';
import { checkRateLimit as redisCheckRateLimit } from '@/lib/redis';

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

// ============================================================================
// RATE LIMIT CONFIGURATIONS
// ============================================================================

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  public: { windowMs: 60000, maxRequests: 60, keyPrefix: 'rl:pub:' },
  authenticated: { windowMs: 60000, maxRequests: 120, keyPrefix: 'rl:auth:' },
  webhook: { windowMs: 60000, maxRequests: 1000, keyPrefix: 'rl:hook:' },
  admin: { windowMs: 60000, maxRequests: 300, keyPrefix: 'rl:admin:' },
};

// ============================================================================
// IN-MEMORY FALLBACK STORE
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const inMemoryStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryStore.entries()) {
    if (entry.resetAt < now) {
      inMemoryStore.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * In-memory rate limit check (fallback when Redis unavailable)
 */
function checkInMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const fullKey = `${config.keyPrefix}${key}`;

  let entry = inMemoryStore.get(fullKey);

  // Create new entry if doesn't exist or window expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    inMemoryStore.set(fullKey, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: new Date(entry.resetAt),
    };
  }

  // Increment count
  entry.count++;

  // Check if over limit
  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.resetAt),
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: new Date(entry.resetAt),
  };
}

// ============================================================================
// MAIN RATE LIMIT CHECK
// ============================================================================

/**
 * Check rate limit for a given key and config
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const fullKey = `${config.keyPrefix}${key}`;
  const windowSeconds = config.windowMs / 1000;

  try {
    // Try Redis first
    const result = await redisCheckRateLimit(fullKey, config.maxRequests, windowSeconds);

    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetAt: new Date(result.resetAt),
      retryAfter: result.retryAfter,
    };
  } catch {
    // Fall back to in-memory
    return checkInMemoryRateLimit(key, config);
  }
}

/**
 * Get rate limit key based on type and identifier
 */
export function getRateLimitKey(
  type: keyof typeof RATE_LIMITS,
  identifier: string
): string {
  return `${type}:${identifier}`;
}

// ============================================================================
// MIDDLEWARE HELPERS
// ============================================================================

/**
 * Extract IP address from request
 */
export function getClientIP(req: Request): string {
  // Check various headers in order of preference
  const headers = new Headers(req.headers);

  // Vercel/Cloudflare headers
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const cfConnectingIP = headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback
  return 'unknown';
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();

  headers.set('X-RateLimit-Limit', String(RATE_LIMITS.public.maxRequests));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));

  if (result.retryAfter) {
    headers.set('Retry-After', String(result.retryAfter));
  }

  return headers;
}

/**
 * Create 429 Too Many Requests response
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  const headers = createRateLimitHeaders(result);

  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${result.retryAfter || 60} seconds.`,
      retryAfter: result.retryAfter,
    }),
    {
      status: 429,
      headers: {
        ...Object.fromEntries(headers),
        'Content-Type': 'application/json',
      },
    }
  );
}

// ============================================================================
// MIDDLEWARE WRAPPER
// ============================================================================

/**
 * Higher-order function to wrap API handlers with rate limiting
 */
export function withRateLimit(
  type: keyof typeof RATE_LIMITS,
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const config = RATE_LIMITS[type];

    // Get identifier based on type
    let identifier: string;

    if (type === 'webhook') {
      // Webhooks use source as identifier
      identifier = req.headers.get('x-webhook-source') || 'unknown';
    } else if (type === 'public') {
      // Public endpoints use IP
      identifier = getClientIP(req);
    } else {
      // Auth/admin endpoints use user ID from header or IP fallback
      identifier = req.headers.get('x-user-id') || getClientIP(req);
    }

    // Check rate limit
    const result = await checkRateLimit(identifier, config);

    if (!result.allowed) {
      return createRateLimitResponse(result);
    }

    // Call the actual handler
    const response = await handler(req);

    // Add rate limit headers to response
    const headers = createRateLimitHeaders(result);
    const newHeaders = new Headers(response.headers);

    headers.forEach((value, key) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

/**
 * Check rate limit and return early if exceeded (for use in route handlers)
 */
export async function enforceRateLimit(
  req: Request,
  type: keyof typeof RATE_LIMITS,
  identifier?: string
): Promise<Response | null> {
  const config = RATE_LIMITS[type];
  const id = identifier || getClientIP(req);

  const result = await checkRateLimit(id, config);

  if (!result.allowed) {
    return createRateLimitResponse(result);
  }

  return null;
}

/**
 * Rate limit for Next.js API routes (returns NextResponse)
 */
export async function rateLimitMiddleware(
  req: Request,
  type: keyof typeof RATE_LIMITS = 'public',
  identifier?: string
): Promise<NextResponse | null> {
  const response = await enforceRateLimit(req, type, identifier);

  if (response) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429 }
    );
  }

  return null;
}
