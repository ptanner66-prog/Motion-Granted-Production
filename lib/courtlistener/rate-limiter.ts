/**
 * CourtListener Rate Limiter
 *
 * Implements token bucket algorithm to respect CourtListener's rate limits:
 * - 60 requests per minute (1 per second average)
 * - Burst capacity of 10 requests
 *
 * @version 2026-01-30-CHEN-TIMEOUT-FIX
 */

import { logger } from '@/lib/logger';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('courtlistener-rate-limiter');
interface RateLimiterConfig {
  maxTokens: number; // Maximum bucket capacity
  refillRate: number; // Tokens added per second
  minDelayMs: number; // Minimum delay between requests
}

interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  consecutiveFailures: number;
  circuitOpen: boolean;
  circuitOpenUntil: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 10, // Burst capacity
  refillRate: 1, // 1 token per second = 60/minute
  minDelayMs: 100, // 100ms minimum between requests
};

// Module-level state (persists across function calls within same execution)
let state: RateLimiterState = {
  tokens: DEFAULT_CONFIG.maxTokens,
  lastRefill: Date.now(),
  consecutiveFailures: 0,
  circuitOpen: false,
  circuitOpenUntil: 0,
};

const CIRCUIT_BREAKER_THRESHOLD = 3; // Open after 3 consecutive failures
const CIRCUIT_BREAKER_DURATION = 30000; // 30 seconds

/**
 * Refill tokens based on elapsed time
 */
function refillTokens(): void {
  const now = Date.now();
  const elapsed = (now - state.lastRefill) / 1000; // seconds
  const tokensToAdd = elapsed * DEFAULT_CONFIG.refillRate;

  state.tokens = Math.min(DEFAULT_CONFIG.maxTokens, state.tokens + tokensToAdd);
  state.lastRefill = now;
}

/**
 * Check if circuit breaker is open
 */
function isCircuitOpen(): boolean {
  if (!state.circuitOpen) return false;

  if (Date.now() >= state.circuitOpenUntil) {
    // Circuit timeout expired, try half-open state
    logger.info('[RateLimiter] Circuit breaker half-open, allowing test request');
    state.circuitOpen = false;
    state.consecutiveFailures = 0;
    return false;
  }

  return true;
}

/**
 * Record a successful request
 */
export function recordSuccess(): void {
  state.consecutiveFailures = 0;
  if (state.circuitOpen) {
    logger.info('[RateLimiter] Circuit breaker closed after successful request');
    state.circuitOpen = false;
  }
}

/**
 * Record a failed request
 */
export function recordFailure(): void {
  state.consecutiveFailures++;

  if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.circuitOpen = true;
    state.circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
    logger.warn(
      `[RateLimiter] Circuit breaker OPEN after ${state.consecutiveFailures} consecutive failures. Will retry at ${new Date(state.circuitOpenUntil).toISOString()}`
    );
  }
}

/**
 * Acquire a token for making a request
 * Returns the number of milliseconds to wait before proceeding
 * Throws if circuit breaker is open
 */
export async function acquireToken(): Promise<number> {
  // Check circuit breaker
  if (isCircuitOpen()) {
    const waitTime = state.circuitOpenUntil - Date.now();
    throw new Error(`Circuit breaker open. Retry in ${Math.ceil(waitTime / 1000)}s`);
  }

  // Refill based on elapsed time
  refillTokens();

  // If we have tokens, consume one
  if (state.tokens >= 1) {
    state.tokens -= 1;
    return DEFAULT_CONFIG.minDelayMs;
  }

  // Calculate wait time for next token
  const waitTime = Math.ceil(((1 - state.tokens) / DEFAULT_CONFIG.refillRate) * 1000);

  logger.debug(`[RateLimiter] No tokens available, waiting ${waitTime}ms`);

  return waitTime + DEFAULT_CONFIG.minDelayMs;
}

/**
 * Get current rate limiter status (for logging/debugging)
 */
export function getStatus(): {
  tokens: number;
  circuitOpen: boolean;
  consecutiveFailures: number;
} {
  refillTokens();
  return {
    tokens: Math.floor(state.tokens * 100) / 100,
    circuitOpen: state.circuitOpen,
    consecutiveFailures: state.consecutiveFailures,
  };
}

/**
 * Reset rate limiter state (for testing or recovery)
 */
export function reset(): void {
  state = {
    tokens: DEFAULT_CONFIG.maxTokens,
    lastRefill: Date.now(),
    consecutiveFailures: 0,
    circuitOpen: false,
    circuitOpenUntil: 0,
  };
  logger.info('[RateLimiter] State reset');
}

// ============================================================================
// HOURLY RATE COUNTER (for batch POST tracking)
// ============================================================================

// Module-level hourly counter (tracks actual API calls, not citations)
let hourlyCallCount = 0;
let hourlyWindowStart = Date.now();
const HOUR_MS = 3600000;
const HOURLY_LIMIT = 5000; // 5,000 requests/hour for CL authenticated

/**
 * Increment rate counter for API calls.
 *
 * IMPORTANT: callCount = number of actual API calls (batch POSTs),
 * NOT the number of citations within the batch.
 *
 * Example: 25 citations in 2 batch POSTs = callCount of 2
 */
export function incrementSharedRateCounter(
  api: 'courtlistener' | 'caselaw',
  callCount: number
): { allowed: boolean; remaining: number; resetAt: string } {
  const now = Date.now();

  // Reset hourly window if expired
  if (now - hourlyWindowStart >= HOUR_MS) {
    hourlyCallCount = 0;
    hourlyWindowStart = now;
  }

  // Check if adding this many calls would exceed the limit
  if (hourlyCallCount + callCount > HOURLY_LIMIT) {
    const resetAt = new Date(hourlyWindowStart + HOUR_MS).toISOString();
    log.warn(`[RateLimit] ${api} hourly limit would be exceeded`, {
      current: hourlyCallCount,
      requested: callCount,
      limit: HOURLY_LIMIT,
      resetAt,
    });
    return {
      allowed: false,
      remaining: Math.max(0, HOURLY_LIMIT - hourlyCallCount),
      resetAt,
    };
  }

  hourlyCallCount += callCount;

  return {
    allowed: true,
    remaining: HOURLY_LIMIT - hourlyCallCount,
    resetAt: new Date(hourlyWindowStart + HOUR_MS).toISOString(),
  };
}

/**
 * Execute a function with rate limiting
 */
export async function withRateLimit<T>(fn: () => Promise<T>, label: string = 'request'): Promise<T> {
  const waitTime = await acquireToken();

  if (waitTime > DEFAULT_CONFIG.minDelayMs) {
    log.info(`[RateLimiter] Waiting ${waitTime}ms before ${label}`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  log.info(`[RateLimiter] Executing ${label}...`);
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    log.info(`[RateLimiter] ${label} completed in ${duration}ms`);
    recordSuccess();
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[RateLimiter] ${label} FAILED after ${duration}ms: ${errorMsg}`);
    recordFailure();
    throw error;
  }
}

// ============================================================================
// SUPABASE-BACKED ATOMIC RATE LIMITER (SP-13 AM-2 / D9 A-2)
// Uses DB-level atomic increment to prevent race conditions across
// concurrent Inngest functions. Fail-closed: returns false on error.
// ============================================================================

interface SupabaseRpcClient {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Check and atomically increment the DB-backed rate counter.
 * Returns true if the request is allowed, false if rate-limited or on error.
 */
export async function checkAndIncrementRateLimit(
  supabase: SupabaseRpcClient,
  api: string = 'courtlistener',
  limit: number = 5000
): Promise<boolean> {
  const { data, error } = await supabase.rpc('increment_rate_counter', {
    p_api: api,
    p_limit: limit,
  });
  if (error) {
    log.error('Rate limiter RPC failed', { api, error: error.message });
    return false; // Fail closed: treat as rate-limited
  }
  return data === true;
}
