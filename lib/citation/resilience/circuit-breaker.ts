/**
 * Citation-Specific Circuit Breaker (SP-19 Block 3)
 *
 * In-memory circuit breaker for external citation APIs (CourtListener, PACER).
 * Complements the Redis-backed lib/circuit-breaker.ts which handles
 * cross-instance state; this module provides fast, per-process protection
 * for the citation pipeline's tight API call loops.
 *
 * Pattern: 5 failures within 60 s → circuit opens for 30 s → half-open test.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitStateName = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: CircuitStateName;
  openedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 30_000;
const FAILURE_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// State (per-process)
// ---------------------------------------------------------------------------

const circuits: Map<string, CircuitState> = new Map();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return the current state for `service`, auto-transitioning as needed. */
export function getCircuitState(service: string): CircuitState {
  const circuit = circuits.get(service) ?? {
    failures: 0,
    lastFailure: 0,
    state: 'CLOSED' as const,
    openedAt: 0,
  };

  const now = Date.now();

  // OPEN → HALF_OPEN after reset timeout
  if (circuit.state === 'OPEN' && now - circuit.openedAt > RESET_TIMEOUT_MS) {
    circuit.state = 'HALF_OPEN';
  }

  // Reset failure count when outside the rolling window
  if (circuit.state === 'CLOSED' && now - circuit.lastFailure > FAILURE_WINDOW_MS) {
    circuit.failures = 0;
  }

  circuits.set(service, circuit);
  return circuit;
}

/** Record a failure. Opens the circuit once the threshold is reached. */
export function recordFailure(service: string): void {
  const circuit = getCircuitState(service);
  circuit.failures++;
  circuit.lastFailure = Date.now();

  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = 'OPEN';
    circuit.openedAt = Date.now();
  }

  circuits.set(service, circuit);
}

/** Record a success. Resets the circuit to CLOSED. */
export function recordSuccess(service: string): void {
  const circuit = getCircuitState(service);
  circuit.failures = 0;
  circuit.state = 'CLOSED';
  circuits.set(service, circuit);
}

/** True when the circuit is fully OPEN (requests should not be attempted). */
export function isCircuitOpen(service: string): boolean {
  return getCircuitState(service).state === 'OPEN';
}
