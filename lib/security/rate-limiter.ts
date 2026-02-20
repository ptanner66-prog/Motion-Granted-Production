// lib/security/rate-limiter.ts
// V-001: Redis-backed rate limiter via Upstash Sliding Window
// Replaces in-memory Map in middleware.ts (dead on Vercel cold starts)
//
// A8-T11 (LCV-TS-025): Consolidated from 3 competing rate limiters:
// - lib/rate-limiter.ts (external API token bucket — broken on Vercel)
// - lib/rate-limit.ts (Claude API safety — broken on Vercel)
// - lib/security/rate-limiter.ts (this file — canonical, Redis-backed)
//
// External API rate limiting and Claude safety wrappers now live here
// alongside the Redis sliding window limiter.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

export type RateLimitTier = 'auth' | 'generate' | 'api' | 'cp3';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;       // Unix timestamp ms
  limit: number;
}

// ============================================================================
// REDIS SLIDING WINDOW RATE LIMITER
// ============================================================================

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
      cp3: new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(5, '1 m'), prefix: 'rl:cp3' }),
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

// ============================================================================
// EXTERNAL API TOKEN BUCKET (consolidated from lib/rate-limiter.ts)
// ============================================================================

interface TokenBucketConfig {
  tokensPerInterval: number;
  interval: number; // milliseconds
  maxTokens: number;
}

interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}

const tokenBuckets: Map<string, TokenBucketState> = new Map();

export const RATE_LIMITS: Record<string, TokenBucketConfig> = {
  courtlistener: { tokensPerInterval: 60, interval: 60 * 1000, maxTokens: 60 },
  courtlistener_hourly: { tokensPerInterval: 5000, interval: 60 * 60 * 1000, maxTokens: 5000 },
  pacer: { tokensPerInterval: 10, interval: 60 * 1000, maxTokens: 10 },
  openai: { tokensPerInterval: 60, interval: 60 * 1000, maxTokens: 60 },
  anthropic: { tokensPerInterval: 60, interval: 60 * 1000, maxTokens: 60 },
};

function getTokenBucketState(service: string): TokenBucketState {
  if (!tokenBuckets.has(service)) {
    const config = RATE_LIMITS[service];
    tokenBuckets.set(service, {
      tokens: config?.maxTokens || 100,
      lastRefill: Date.now(),
    });
  }
  return tokenBuckets.get(service)!;
}

function refillTokens(service: string): void {
  const config = RATE_LIMITS[service];
  if (!config) return;
  const state = getTokenBucketState(service);
  const now = Date.now();
  const intervalsPassed = Math.floor((now - state.lastRefill) / config.interval);
  if (intervalsPassed > 0) {
    state.tokens = Math.min(config.maxTokens, state.tokens + intervalsPassed * config.tokensPerInterval);
    state.lastRefill = now;
  }
}

/** Acquire a token for an external API service. Returns true if acquired. */
export async function acquireToken(service: string): Promise<boolean> {
  refillTokens(service);
  const state = getTokenBucketState(service);
  if (state.tokens > 0) {
    state.tokens--;
    return true;
  }
  return false;
}

/** Wait for a token to become available (up to maxWaitMs). */
export async function waitForToken(service: string, maxWaitMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (await acquireToken(service)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** Get tokens remaining for an external API service. */
export function getTokensRemaining(service: string): number {
  refillTokens(service);
  return getTokenBucketState(service).tokens;
}

// ============================================================================
// CLAUDE API SAFETY (consolidated from lib/rate-limit.ts)
// ============================================================================

const CLAUDE_REQUESTS_PER_MINUTE = 50;
const TOKENS_PER_MINUTE = 100000;

const requestLog: number[] = [];
const tokenLog: { timestamp: number; tokens: number }[] = [];

function cleanRequestLog(): void {
  const oneMinuteAgo = Date.now() - 60000;
  while (requestLog.length > 0 && requestLog[0] < oneMinuteAgo) requestLog.shift();
}

function cleanTokenLog(): void {
  const oneMinuteAgo = Date.now() - 60000;
  while (tokenLog.length > 0 && tokenLog[0].timestamp < oneMinuteAgo) tokenLog.shift();
}

/** Check if a Claude API request can be made within rate limits. */
export function canMakeRequest(): boolean {
  cleanRequestLog();
  return requestLog.length < CLAUDE_REQUESTS_PER_MINUTE;
}

/** Log a Claude API request. */
export function logRequest(): void {
  requestLog.push(Date.now());
  cleanRequestLog();
}

/** Get current Claude rate limit status. */
export function getRateLimitStatus(): {
  requestsRemaining: number;
  tokensRemaining: number;
  resetInSeconds: number;
} {
  cleanRequestLog();
  cleanTokenLog();
  const recentTokens = tokenLog.reduce((sum, entry) => sum + entry.tokens, 0);
  const oldestRequest = requestLog[0] || Date.now();
  const resetInSeconds = Math.max(0, Math.ceil((oldestRequest + 60000 - Date.now()) / 1000));
  return {
    requestsRemaining: Math.max(0, CLAUDE_REQUESTS_PER_MINUTE - requestLog.length),
    tokensRemaining: Math.max(0, TOKENS_PER_MINUTE - recentTokens),
    resetInSeconds,
  };
}
