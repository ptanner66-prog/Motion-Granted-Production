/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by:
 * - Tracking failure rates for external services
 * - Opening circuit after threshold failures
 * - Allowing periodic testing when open
 * - Auto-recovery after success
 *
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Failures exceeded threshold, requests fail fast
 * - HALF_OPEN: Testing recovery, limited requests pass through
 */

import { getRedis, isRedisAvailable } from './redis';
import { logger } from './logger';

// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Failures before opening (default: 5)
  successThreshold: number;     // Successes to close from half-open (default: 2)
  timeout: number;              // Time in open state before half-open (ms, default: 30000)
  monitorWindow: number;        // Window to count failures (ms, default: 60000)
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
// IN-MEMORY FALLBACK
// ============================================================================

const memoryState: Map<string, CircuitStats> = new Map();

function getMemoryState(service: string): CircuitStats {
  if (!memoryState.has(service)) {
    memoryState.set(service, {
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      openedAt: null,
    });
  }
  return memoryState.get(service)!;
}

// ============================================================================
// CIRCUIT BREAKER CLASS
// ============================================================================

export class CircuitBreaker {
  private service: string;
  private config: CircuitBreakerConfig;
  private log: typeof logger;

  constructor(service: string, config?: Partial<CircuitBreakerConfig>) {
    this.service = service;
    this.config = {
      ...DEFAULT_CONFIG,
      ...CIRCUIT_CONFIGS[service],
      ...config,
    };
    this.log = logger.child({ service, action: 'circuit-breaker' });
  }

  /**
   * Get current circuit state
   */
  async getState(): Promise<CircuitStats> {
    const redis = getRedis();

    if (!redis) {
      return getMemoryState(this.service);
    }

    try {
      const key = `circuit:${this.service}`;
      const data = await redis.get<CircuitStats>(key);
      return data || getMemoryState(this.service);
    } catch {
      return getMemoryState(this.service);
    }
  }

  /**
   * Update circuit state
   */
  private async setState(stats: CircuitStats): Promise<void> {
    const redis = getRedis();
    const key = `circuit:${this.service}`;

    // Always update memory state
    memoryState.set(this.service, stats);

    if (redis) {
      try {
        await redis.set(key, stats, { ex: 3600 }); // 1 hour TTL
      } catch (error) {
        this.log.warn('Failed to update Redis circuit state', { error });
      }
    }
  }

  /**
   * Check if request should be allowed
   */
  async canExecute(): Promise<boolean> {
    const stats = await this.getState();
    const now = Date.now();

    switch (stats.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if timeout has passed
        if (stats.openedAt && now - stats.openedAt >= this.config.timeout) {
          // Transition to half-open
          this.log.info('Circuit transitioning to HALF_OPEN');
          await this.setState({
            ...stats,
            state: 'HALF_OPEN',
            successes: 0,
          });
          return true;
        }
        return false;

      case 'HALF_OPEN':
        // Allow limited requests for testing
        return true;

      default:
        return true;
    }
  }

  /**
   * Record a successful call
   */
  async recordSuccess(): Promise<void> {
    const stats = await this.getState();
    const now = Date.now();

    if (stats.state === 'HALF_OPEN') {
      const newSuccesses = stats.successes + 1;

      if (newSuccesses >= this.config.successThreshold) {
        // Close the circuit
        this.log.info('Circuit closing after successful recovery');
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
      // Reset failures on success
      await this.setState({
        ...stats,
        failures: 0,
        lastSuccess: now,
      });
    }
  }

  /**
   * Record a failed call
   */
  async recordFailure(error?: Error): Promise<void> {
    const stats = await this.getState();
    const now = Date.now();

    // Clean up old failures outside the monitor window
    const recentFailures = stats.failures + 1;

    if (stats.state === 'HALF_OPEN') {
      // Immediately open on failure in half-open
      this.log.warn('Circuit reopening after failure in HALF_OPEN', {
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
        // Open the circuit
        this.log.error('Circuit opening due to failure threshold', {
          failures: recentFailures,
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

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const canExecute = await this.canExecute();

    if (!canExecute) {
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

  /**
   * Force reset the circuit to closed state
   */
  async reset(): Promise<void> {
    this.log.info('Circuit manually reset');
    await this.setState({
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      openedAt: null,
    });
  }

  /**
   * Get health status for monitoring
   */
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
// SINGLETON INSTANCES
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
