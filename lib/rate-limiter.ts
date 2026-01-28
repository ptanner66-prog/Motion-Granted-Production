/**
 * Token Bucket Rate Limiter
 *
 * Implements rate limiting for external APIs to prevent hitting limits.
 * Uses a token bucket algorithm with configurable refill rates.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

interface RateLimiterConfig {
  tokensPerInterval: number;
  interval: number; // milliseconds
  maxTokens: number;
}

interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

const rateLimiters: Map<string, RateLimiterState> = new Map();

/**
 * Rate limit configurations for each service.
 * Adjust based on API documentation and observed limits.
 */
export const RATE_LIMITS: Record<string, RateLimiterConfig> = {
  // CourtListener: 60 citations/minute, 5,000/hour
  courtlistener: {
    tokensPerInterval: 60,
    interval: 60 * 1000, // 1 minute
    maxTokens: 60,
  },
  courtlistener_hourly: {
    tokensPerInterval: 5000,
    interval: 60 * 60 * 1000, // 1 hour
    maxTokens: 5000,
  },

  // PACER: Cost-controlled limit (10/minute to minimize costs)
  pacer: {
    tokensPerInterval: 10,
    interval: 60 * 1000, // 1 minute
    maxTokens: 10,
  },

  // OpenAI: 60 requests/minute for most tiers
  openai: {
    tokensPerInterval: 60,
    interval: 60 * 1000,
    maxTokens: 60,
  },

  // Anthropic: 60 requests/minute
  anthropic: {
    tokensPerInterval: 60,
    interval: 60 * 1000,
    maxTokens: 60,
  },
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function getState(service: string): RateLimiterState {
  if (!rateLimiters.has(service)) {
    const config = RATE_LIMITS[service];
    rateLimiters.set(service, {
      tokens: config?.maxTokens || 100,
      lastRefill: Date.now(),
    });
  }
  return rateLimiters.get(service)!;
}

function refillTokens(service: string): void {
  const config = RATE_LIMITS[service];
  if (!config) return;

  const state = getState(service);
  const now = Date.now();
  const timePassed = now - state.lastRefill;
  const intervalsPassed = Math.floor(timePassed / config.interval);

  if (intervalsPassed > 0) {
    state.tokens = Math.min(
      config.maxTokens,
      state.tokens + intervalsPassed * config.tokensPerInterval
    );
    state.lastRefill = now;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Attempt to acquire a token for the given service.
 * Returns true if token acquired, false if rate limited.
 */
export async function acquireToken(service: string): Promise<boolean> {
  refillTokens(service);
  const state = getState(service);

  if (state.tokens > 0) {
    state.tokens--;
    return true;
  }

  return false;
}

/**
 * Wait for a token to become available.
 * Returns true if token acquired within maxWaitMs, false if timed out.
 */
export async function waitForToken(
  service: string,
  maxWaitMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (await acquireToken(service)) {
      return true;
    }
    // Wait 100ms before trying again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Get the number of tokens remaining for a service.
 */
export function getTokensRemaining(service: string): number {
  refillTokens(service);
  return getState(service).tokens;
}

/**
 * Get rate limit status for all configured services.
 */
export function getRateLimitStatus(): Record<string, { tokens: number; max: number; service: string }> {
  const status: Record<string, { tokens: number; max: number; service: string }> = {};

  for (const [service, config] of Object.entries(RATE_LIMITS)) {
    refillTokens(service);
    const state = getState(service);
    status[service] = {
      service,
      tokens: state.tokens,
      max: config.maxTokens,
    };
  }

  return status;
}

/**
 * Calculate time until next token is available.
 * Returns 0 if tokens are available, otherwise milliseconds to wait.
 */
export function getTimeUntilToken(service: string): number {
  refillTokens(service);
  const state = getState(service);

  if (state.tokens > 0) {
    return 0;
  }

  const config = RATE_LIMITS[service];
  if (!config) return 0;

  const timeSinceRefill = Date.now() - state.lastRefill;
  const timeUntilRefill = config.interval - timeSinceRefill;

  return Math.max(0, timeUntilRefill);
}

/**
 * Reset rate limiter for a service (useful for testing).
 */
export function resetRateLimiter(service: string): void {
  const config = RATE_LIMITS[service];
  if (config) {
    rateLimiters.set(service, {
      tokens: config.maxTokens,
      lastRefill: Date.now(),
    });
  }
}

/**
 * Reset all rate limiters (useful for testing).
 */
export function resetAllRateLimiters(): void {
  rateLimiters.clear();
}
