// lib/ai/openai-circuit-breaker.ts
// V-003: Redis-backed circuit breaker for OpenAI (GPT-4T)
// When OPEN: mark citations VERIFICATION_DEFERRED (NOT cascade to Opus)
// Uses same Redis infrastructure as the main circuit breaker

import { getCircuitBreaker, type CircuitState } from '@/lib/circuit-breaker';

// Service name constant for consistent key naming
export const OPENAI_SERVICE = 'openai';

// Pre-create OpenAI circuit breaker instance with custom thresholds
const openaiBreaker = getCircuitBreaker(OPENAI_SERVICE);

export async function checkOpenAICircuit(): Promise<{ state: CircuitState; allowed: boolean }> {
  const canExec = await openaiBreaker.canExecute();
  const health = await openaiBreaker.getHealth();
  return { state: health.state, allowed: canExec };
}

export async function recordOpenAISuccess(): Promise<void> {
  await openaiBreaker.recordSuccess();
}

export async function recordOpenAIFailure(error?: Error): Promise<void> {
  await openaiBreaker.recordFailure(error);
}

// VERIFICATION_DEFERRED status for citation pipeline
// When OpenAI breaker is OPEN, citations get this status instead of FAILED
// Protocol 7 IGNORES deferred citations (infrastructure issue, not quality failure)
export const DEFERRED_RESULT = {
  status: 'VERIFICATION_DEFERRED' as const,
  reason: 'OPENAI_CIRCUIT_OPEN',
  aisEntry: 'Citation holding verification deferred due to API unavailability. Manual verification required.',
  confidence: 0,
};
