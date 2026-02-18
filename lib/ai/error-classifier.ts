/**
 * Error Classifier — Motion Granted AI Client
 *
 * Classifies API errors into actionable categories per BD-4:
 *   429/503/529       → RETRY_THEN_BREAKER (rate limit / overloaded / API overload)
 *   5xx (not 503)     → CIRCUIT_BREAKER (immediate open)
 *   400 context overflow → TRUNCATE_RETRY (reduce input and retry)
 *   Other 4xx         → FATAL (bad request — do not retry)
 *   Network/timeout    → RETRY_THEN_BREAKER
 */

export type ErrorAction =
  | 'RETRY_THEN_BREAKER'
  | 'CIRCUIT_BREAKER'
  | 'TRUNCATE_RETRY'
  | 'FATAL';

export interface ErrorClassification {
  action: ErrorAction;
  retryable: boolean;
  statusCode: number | null;
}

export function classifyError(error: unknown): ErrorClassification {
  const status = extractStatusCode(error);

  // 429 (rate limit), 503 (overloaded), 529 (API overloaded) — retry with backoff, then trip breaker
  if (status === 429 || status === 503 || status === 529) {
    return { action: 'RETRY_THEN_BREAKER', retryable: true, statusCode: status };
  }

  // 5xx (except 503) — immediate circuit breaker, do not retry
  if (status !== null && status >= 500 && status !== 503) {
    return { action: 'CIRCUIT_BREAKER', retryable: false, statusCode: status };
  }

  // 400 with context overflow — truncate input and retry
  if (status === 400 && isContextOverflow(error)) {
    return { action: 'TRUNCATE_RETRY', retryable: true, statusCode: status };
  }

  // Other 4xx — client error, do not retry
  if (status !== null && status >= 400 && status < 500) {
    return { action: 'FATAL', retryable: false, statusCode: status };
  }

  // Network errors, timeouts, unknown — treat as transient, retry then breaker
  return { action: 'RETRY_THEN_BREAKER', retryable: true, statusCode: status };
}

function extractStatusCode(error: unknown): number | null {
  if (error && typeof error === 'object') {
    if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
      return (error as Record<string, unknown>).status as number;
    }
    if ('statusCode' in error && typeof (error as Record<string, unknown>).statusCode === 'number') {
      return (error as Record<string, unknown>).statusCode as number;
    }
  }
  return null;
}

function isContextOverflow(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('context_length_exceeded')
    || message.includes('max_tokens')
    || message.includes('too many tokens')
    || message.includes('prompt is too long');
}
