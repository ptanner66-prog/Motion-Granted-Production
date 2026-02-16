/**
 * Circuit Breaker Pattern Implementation — V-002
 *
 * Redis-backed via Upstash. State persists across Vercel cold starts.
 * In-memory Map removed — dead on serverless.
 *
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Failures exceeded threshold, requests fail fast (TTL auto-expires to HALF_OPEN)
 * - HALF_OPEN: Testing recovery, limited requests pass through
 *
 * Fail-open: If Redis is unavailable, all requests are allowed.
 * Inngest retries handle transient failures.
 */

import { Redis } from '@upstash/redis';

// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;              // Time in OPEN state before implicit HALF_OPEN (ms)
  monitorWindow: number;        // Window to count failures (ms)
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  openedAt: number | null;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,        // 30 seconds
  monitorWindow: 60000,  // 1 minute
};

// Service-specific configurations
export const CIRCUIT_CONFIGS: Record<string, Partial<CircuitBreakerConfig>> = {
  claude: {
    failureThreshold: 3,
    timeout: 60000,      // 1 minute (Claude is critical)
  },
  courtlistener: {
    failureThreshold: 5,
    timeout: 120000,     // 2 minutes (can be slower)
  },
  stripe: {
    failureThreshold: 3,
    timeout: 30000,
  },
  resend: {
    failureThreshold: 5,
    timeout: 60000,
  },
  supabase: {
    failureThreshold: 3,
    timeout: 15000,      // Quick recovery for DB
  },
};

// ============================================================================
// REDIS CLIENT (lazy init)
// ============================================================================

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

function redisKey(service: string): string {
  return `circuit:${service}`;
}

const DEFAULT_STATS: CircuitStats = {
  state: 'CLOSED',
  failures: 0,
  successes: 0,
  lastFailure: null,
  lastSuccess: null,
  openedAt: null,
};

// ============================================================================
// CIRCUIT BREAKER CLASS (Redis-backed)
// ============================================================================

export class CircuitBreaker {
  private service: string;
  private config: CircuitBreakerConfig;

  constructor(service: string, config?: Partial<CircuitBreakerConfig>) {
    this.service = service;
    this.config = {
      ...DEFAULT_CONFIG,
      ...CIRCUIT_CONFIGS[service],
      ...config,
    };
  }

  async getState(): Promise<CircuitStats> {
    const r = getRedis();
    if (!r) return { ...DEFAULT_STATS };

    try {
      const data = await r.get<CircuitStats>(redisKey(this.service));
      if (!data) return { ...DEFAULT_STATS };

      // Check if OPEN state has expired → implicit HALF_OPEN
      if (data.state === 'OPEN' && data.openedAt) {
        if (Date.now() - data.openedAt >= this.config.timeout) {
          const halfOpen: CircuitStats = { ...data, state: 'HALF_OPEN', successes: 0 };
          await this.setState(halfOpen);
          return halfOpen;
        }
      }

      return data;
    } catch {
      // Fail open
      return { ...DEFAULT_STATS };
    }
  }

  private async setState(stats: CircuitStats): Promise<void> {
    const r = getRedis();
    if (!r) return;

    try {
      // TTL = 2x timeout for auto-cleanup of stale keys
      const ttl = Math.ceil((this.config.timeout * 2) / 1000);
      await r.set(redisKey(this.service), stats, { ex: Math.max(ttl, 3600) });
    } catch (error) {
      console.warn(`[CircuitBreaker:${this.service}] Failed to update Redis state`, {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  async canExecute(): Promise<boolean> {
    const stats = await this.getState();

    switch (stats.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        return false;
      case 'HALF_OPEN':
        return true;
      default:
        return true;
    }
  }

  async recordSuccess(): Promise<void> {
    const stats = await this.getState();
    const now = Date.now();

    if (stats.state === 'HALF_OPEN') {
      const newSuccesses = stats.successes + 1;

      if (newSuccesses >= this.config.successThreshold) {
        console.info(`[CircuitBreaker:${this.service}] Circuit CLOSED after successful recovery`);
        await this.setState({
          state: 'CLOSED',
          failures: 0,
          successes: 0,
          lastFailure: stats.lastFailure,
          lastSuccess: now,
          openedAt: null,
        });
      } else {
        await this.setState({
          ...stats,
          successes: newSuccesses,
          lastSuccess: now,
        });
      }
    } else if (stats.state === 'CLOSED') {
      await this.setState({
        ...stats,
        failures: 0,
        lastSuccess: now,
      });
    }
  }

  async recordFailure(error?: Error): Promise<void> {
    const stats = await this.getState();
    const now = Date.now();
    const recentFailures = stats.failures + 1;

    if (stats.state === 'HALF_OPEN') {
      console.warn(`[CircuitBreaker:${this.service}] Circuit REOPENED after failure in HALF_OPEN`, {
        error: error?.message,
      });
      await this.setState({
        state: 'OPEN',
        failures: recentFailures,
        successes: 0,
        lastFailure: now,
        lastSuccess: stats.lastSuccess,
        openedAt: now,
      });
    } else if (stats.state === 'CLOSED') {
      if (recentFailures >= this.config.failureThreshold) {
        console.error(`[CircuitBreaker:${this.service}] Circuit OPENED after ${recentFailures} failures`, {
          threshold: this.config.failureThreshold,
          error: error?.message,
        });
        await this.setState({
          state: 'OPEN',
          failures: recentFailures,
          successes: 0,
          lastFailure: now,
          lastSuccess: stats.lastSuccess,
          openedAt: now,
        });
      } else {
        await this.setState({
          ...stats,
          failures: recentFailures,
          lastFailure: now,
        });
      }
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const canExec = await this.canExecute();

    if (!canExec) {
      const stats = await this.getState();
      const retryAfter = stats.openedAt
        ? Math.ceil((this.config.timeout - (Date.now() - stats.openedAt)) / 1000)
        : this.config.timeout / 1000;

      throw new CircuitOpenError(this.service, retryAfter);
    }

    try {
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure(error instanceof Error ? error : undefined);
      throw error;
    }
  }

  async reset(): Promise<void> {
    console.info(`[CircuitBreaker:${this.service}] Circuit manually reset`);
    await this.setState({ ...DEFAULT_STATS });
  }

  async getHealth(): Promise<{
    service: string;
    state: CircuitState;
    healthy: boolean;
    stats: CircuitStats;
  }> {
    const stats = await this.getState();
    return {
      service: this.service,
      state: stats.state,
      healthy: stats.state === 'CLOSED',
      stats,
    };
  }
}

// ============================================================================
// CIRCUIT OPEN ERROR
// ============================================================================

export class CircuitOpenError extends Error {
  public service: string;
  public retryAfter: number;

  constructor(service: string, retryAfter: number) {
    super(`Circuit breaker is open for ${service}. Retry after ${retryAfter}s`);
    this.name = 'CircuitOpenError';
    this.service = service;
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// SINGLETON INSTANCES (class instances are fine — they hold no mutable state,
// all state is in Redis)
// ============================================================================

const circuits: Map<string, CircuitBreaker> = new Map();

export function getCircuitBreaker(service: string): CircuitBreaker {
  if (!circuits.has(service)) {
    circuits.set(service, new CircuitBreaker(service));
  }
  return circuits.get(service)!;
}

// Pre-create common circuit breakers
export const claudeCircuit = getCircuitBreaker('claude');
export const courtlistenerCircuit = getCircuitBreaker('courtlistener');
export const stripeCircuit = getCircuitBreaker('stripe');
export const resendCircuit = getCircuitBreaker('resend');
export const supabaseCircuit = getCircuitBreaker('supabase');

// ============================================================================
// HEALTH CHECK FOR ALL CIRCUITS
// ============================================================================

export async function getAllCircuitsHealth(): Promise<{
  allHealthy: boolean;
  circuits: Array<{
    service: string;
    state: CircuitState;
    healthy: boolean;
  }>;
}> {
  const results = await Promise.all([
    claudeCircuit.getHealth(),
    courtlistenerCircuit.getHealth(),
    stripeCircuit.getHealth(),
    resendCircuit.getHealth(),
    supabaseCircuit.getHealth(),
  ]);

  return {
    allHealthy: results.every(r => r.healthy),
    circuits: results.map(r => ({
      service: r.service,
      state: r.state,
      healthy: r.healthy,
    })),
  };
}
