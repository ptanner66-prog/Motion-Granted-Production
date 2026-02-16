// lib/security/rate-limiter.ts
// V-001: Redis-backed rate limiter via Upstash Sliding Window
// Replaces in-memory Map in middleware.ts (dead on Vercel cold starts)

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

export type RateLimitTier = 'auth' | 'generate' | 'api';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;       // Unix timestamp ms
  limit: number;
}

// Lazy initialization — Redis client created on first use
let redis: Redis | null = null;
let limiters: Record<RateLimitTier, Ratelimit> | null = null;

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null; // Local dev fallback
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

function getLimiters(): Record<RateLimitTier, Ratelimit> | null {
  const r = getRedis();
  if (!r) return null;

  if (!limiters) {
    limiters = {
      auth: new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:auth' }),
      generate: new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(5, '1 m'), prefix: 'rl:gen' }),
      api: new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(100, '1 m'), prefix: 'rl:api' }),
    };
  }
  return limiters;
}

/**
 * Get real client IP using Vercel's trusted header.
 * Priority: x-vercel-forwarded-for > x-forwarded-for > x-real-ip > fallback
 */
export function getClientIP(request: NextRequest): string {
  return request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';
}

export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier
): Promise<RateLimitResult> {
  const l = getLimiters();

  if (!l) {
    // Local dev: no Redis. Allow all requests.
    return { allowed: true, remaining: 999, reset: Date.now() + 60000, limit: 999 };
  }

  try {
    const result = await l[tier].limit(identifier);
    return {
      allowed: result.success,
      remaining: result.remaining,
      reset: result.reset,
      limit: result.limit,
    };
  } catch (error) {
    // FAIL OPEN: Redis outage should not cause total platform downtime
    console.error('[RateLimit] Redis error. Failing open.', {
      tier,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return { allowed: true, remaining: 0, reset: Date.now() + 60000, limit: 0 };
  }
}
