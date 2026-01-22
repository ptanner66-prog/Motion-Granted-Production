/**
 * Redis Client - Production Distributed Caching
 *
 * Uses Upstash Redis for serverless-compatible distributed state:
 * - Rate limiting across all instances
 * - Session caching
 * - Queue state coordination
 * - Distributed locks
 *
 * Falls back gracefully when Redis is not configured.
 */

import { Redis } from '@upstash/redis';

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

let redis: Redis | null = null;
let redisAvailable = false;

function initRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || url.includes('placeholder')) {
    console.warn('[Redis] Not configured - using in-memory fallback');
    return null;
  }

  try {
    redis = new Redis({ url, token });
    redisAvailable = true;
    console.log('[Redis] Connected to Upstash Redis');
    return redis;
  } catch (error) {
    console.error('[Redis] Failed to connect:', error);
    return null;
  }
}

export function getRedis(): Redis | null {
  return initRedis();
}

export function isRedisAvailable(): boolean {
  initRedis();
  return redisAvailable;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Distributed rate limiting using Redis sliding window
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const client = getRedis();

  if (!client) {
    // Fallback: allow all requests when Redis unavailable
    return { allowed: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
  }

  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  const redisKey = `ratelimit:${key}`;

  try {
    // Use Redis pipeline for atomic operations
    const pipeline = client.pipeline();

    // Remove old entries outside the window
    pipeline.zremrangebyscore(redisKey, 0, windowStart);

    // Count current requests in window
    pipeline.zcard(redisKey);

    // Add current request
    pipeline.zadd(redisKey, { score: now, member: `${now}:${Math.random()}` });

    // Set expiry
    pipeline.expire(redisKey, windowSeconds);

    const results = await pipeline.exec();
    const currentCount = (results[1] as number) || 0;

    const allowed = currentCount < limit;
    const remaining = Math.max(0, limit - currentCount - 1);
    const resetAt = now + windowSeconds * 1000;

    if (!allowed) {
      // Calculate retry-after
      const oldestEntry = await client.zrange(redisKey, 0, 0, { withScores: true });
      const retryAfter = oldestEntry.length > 0
        ? Math.ceil((oldestEntry[0].score + windowSeconds * 1000 - now) / 1000)
        : windowSeconds;

      return { allowed: false, remaining: 0, resetAt, retryAfter };
    }

    return { allowed: true, remaining, resetAt };
  } catch (error) {
    console.error('[Redis] Rate limit check failed:', error);
    // Fail open - allow request on error
    return { allowed: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

// ============================================================================
// RATE LIMIT PRESETS
// ============================================================================

export const RATE_LIMITS = {
  // Claude API limits (per minute)
  CLAUDE_REQUESTS: { limit: 50, window: 60 },
  CLAUDE_TOKENS: { limit: 100000, window: 60 },

  // CourtListener API limits
  COURTLISTENER_CITATIONS: { limit: 60, window: 60 },
  COURTLISTENER_QUERIES: { limit: 5000, window: 3600 },

  // User API limits (per minute)
  USER_API_REQUESTS: { limit: 100, window: 60 },
  USER_GENERATE: { limit: 5, window: 60 },

  // Admin API limits
  ADMIN_API_REQUESTS: { limit: 200, window: 60 },

  // Global limits
  GLOBAL_API: { limit: 1000, window: 60 },
} as const;

/**
 * Check rate limit for Claude API calls
 */
export async function checkClaudeRateLimit(userId?: string): Promise<RateLimitResult> {
  const key = userId ? `claude:user:${userId}` : 'claude:global';
  return checkRateLimit(key, RATE_LIMITS.CLAUDE_REQUESTS.limit, RATE_LIMITS.CLAUDE_REQUESTS.window);
}

/**
 * Check rate limit for user API requests
 */
export async function checkUserRateLimit(userId: string): Promise<RateLimitResult> {
  return checkRateLimit(`user:${userId}`, RATE_LIMITS.USER_API_REQUESTS.limit, RATE_LIMITS.USER_API_REQUESTS.window);
}

/**
 * Check rate limit for CourtListener API
 */
export async function checkCourtListenerRateLimit(): Promise<RateLimitResult> {
  return checkRateLimit('courtlistener:global', RATE_LIMITS.COURTLISTENER_CITATIONS.limit, RATE_LIMITS.COURTLISTENER_CITATIONS.window);
}

// ============================================================================
// CACHING
// ============================================================================

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
}

/**
 * Get cached value
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const value = await client.get<T>(`cache:${key}`);
    return value;
  } catch (error) {
    console.error('[Redis] Cache get failed:', error);
    return null;
  }
}

/**
 * Set cached value
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  const { ttl = 3600, tags = [] } = options;

  try {
    await client.set(`cache:${key}`, value, { ex: ttl });

    // Add to cache tags for invalidation
    for (const tag of tags) {
      await client.sadd(`cache:tag:${tag}`, key);
      await client.expire(`cache:tag:${tag}`, ttl * 2);
    }

    return true;
  } catch (error) {
    console.error('[Redis] Cache set failed:', error);
    return false;
  }
}

/**
 * Delete cached value
 */
export async function cacheDelete(key: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.del(`cache:${key}`);
    return true;
  } catch (error) {
    console.error('[Redis] Cache delete failed:', error);
    return false;
  }
}

/**
 * Invalidate all cache entries with a specific tag
 */
export async function cacheInvalidateTag(tag: string): Promise<number> {
  const client = getRedis();
  if (!client) return 0;

  try {
    const keys = await client.smembers(`cache:tag:${tag}`);
    if (keys.length === 0) return 0;

    const pipeline = client.pipeline();
    for (const key of keys) {
      pipeline.del(`cache:${key}`);
    }
    pipeline.del(`cache:tag:${tag}`);
    await pipeline.exec();

    return keys.length;
  } catch (error) {
    console.error('[Redis] Cache invalidation failed:', error);
    return 0;
  }
}

// ============================================================================
// DISTRIBUTED LOCKS
// ============================================================================

/**
 * Acquire a distributed lock
 */
export async function acquireLock(
  lockName: string,
  ttlSeconds: number = 30
): Promise<string | null> {
  const client = getRedis();
  if (!client) return `local-${Date.now()}`; // Return local lock when Redis unavailable

  const lockKey = `lock:${lockName}`;
  const lockValue = `${Date.now()}:${Math.random()}`;

  try {
    const acquired = await client.set(lockKey, lockValue, { nx: true, ex: ttlSeconds });
    return acquired ? lockValue : null;
  } catch (error) {
    console.error('[Redis] Lock acquire failed:', error);
    return null;
  }
}

/**
 * Release a distributed lock
 */
export async function releaseLock(lockName: string, lockValue: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return true;

  const lockKey = `lock:${lockName}`;

  try {
    // Only release if we own the lock
    const currentValue = await client.get(lockKey);
    if (currentValue === lockValue) {
      await client.del(lockKey);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Redis] Lock release failed:', error);
    return false;
  }
}

/**
 * Execute a function with a distributed lock
 */
export async function withLock<T>(
  lockName: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 30
): Promise<T | null> {
  const lockValue = await acquireLock(lockName, ttlSeconds);

  if (!lockValue) {
    console.warn(`[Redis] Could not acquire lock: ${lockName}`);
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(lockName, lockValue);
  }
}

// ============================================================================
// QUEUE STATE
// ============================================================================

/**
 * Get queue position for an order
 */
export async function getQueuePosition(orderId: string): Promise<number | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const position = await client.zrank('queue:orders', orderId);
    return position !== null ? position + 1 : null;
  } catch (error) {
    console.error('[Redis] Queue position lookup failed:', error);
    return null;
  }
}

/**
 * Update queue positions (called after order changes)
 */
export async function updateQueuePositions(
  orders: Array<{ id: string; filingDeadline: Date; createdAt: Date }>
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const pipeline = client.pipeline();
    pipeline.del('queue:orders');

    for (const order of orders) {
      // Score = deadline timestamp (lower = higher priority)
      const score = order.filingDeadline.getTime();
      pipeline.zadd('queue:orders', { score, member: order.id });
    }

    await pipeline.exec();
    return true;
  } catch (error) {
    console.error('[Redis] Queue update failed:', error);
    return false;
  }
}

// ============================================================================
// REAL-TIME COUNTERS
// ============================================================================

/**
 * Increment a counter
 */
export async function incrementCounter(key: string, amount: number = 1): Promise<number> {
  const client = getRedis();
  if (!client) return 0;

  try {
    return await client.incrby(`counter:${key}`, amount);
  } catch (error) {
    console.error('[Redis] Counter increment failed:', error);
    return 0;
  }
}

/**
 * Get counter value
 */
export async function getCounter(key: string): Promise<number> {
  const client = getRedis();
  if (!client) return 0;

  try {
    const value = await client.get<number>(`counter:${key}`);
    return value || 0;
  } catch (error) {
    console.error('[Redis] Counter get failed:', error);
    return 0;
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function redisHealthCheck(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const client = getRedis();

  if (!client) {
    return { healthy: false, latencyMs: 0, error: 'Redis not configured' };
  }

  const start = Date.now();

  try {
    await client.ping();
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
