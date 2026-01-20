/**
 * Claude API Rate Limit Safety Module
 *
 * Tracks API usage to prevent rate limit errors.
 * Uses in-memory tracking with automatic cleanup.
 *
 * Note: In a multi-instance environment (Vercel serverless),
 * this provides per-instance protection. For distributed rate
 * limiting, consider using Redis or Inngest's built-in throttling.
 */

// Claude API limits (conservative estimates for safety margin)
const CLAUDE_REQUESTS_PER_MINUTE = 50; // Actual limit is higher, but we stay safe
const TOKENS_PER_MINUTE = 100000; // Token limit for Claude

// In-memory request tracking
const requestLog: number[] = [];
const tokenLog: { timestamp: number; tokens: number }[] = [];

/**
 * Check if we can make a Claude API request
 * @returns true if within rate limits, false if should wait
 */
export function canMakeRequest(): boolean {
  const oneMinuteAgo = Date.now() - 60000;

  // Clean up old entries
  while (requestLog.length > 0 && requestLog[0] < oneMinuteAgo) {
    requestLog.shift();
  }

  // Check request count
  return requestLog.length < CLAUDE_REQUESTS_PER_MINUTE;
}

/**
 * Log a Claude API request
 */
export function logRequest(): void {
  requestLog.push(Date.now());

  // Clean up old entries periodically
  const oneMinuteAgo = Date.now() - 60000;
  while (requestLog.length > 0 && requestLog[0] < oneMinuteAgo) {
    requestLog.shift();
  }
}

/**
 * Check token budget availability
 * @param estimatedTokens - Estimated tokens for the request
 * @returns true if within token limits
 */
export function canUseTokens(estimatedTokens: number): boolean {
  const oneMinuteAgo = Date.now() - 60000;

  // Clean up old entries
  while (tokenLog.length > 0 && tokenLog[0].timestamp < oneMinuteAgo) {
    tokenLog.shift();
  }

  // Sum recent token usage
  const recentTokens = tokenLog.reduce((sum, entry) => sum + entry.tokens, 0);

  return recentTokens + estimatedTokens < TOKENS_PER_MINUTE;
}

/**
 * Log token usage
 * @param tokens - Number of tokens used
 */
export function logTokenUsage(tokens: number): void {
  tokenLog.push({ timestamp: Date.now(), tokens });

  // Clean up old entries
  const oneMinuteAgo = Date.now() - 60000;
  while (tokenLog.length > 0 && tokenLog[0].timestamp < oneMinuteAgo) {
    tokenLog.shift();
  }
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(): {
  requestsRemaining: number;
  tokensRemaining: number;
  resetInSeconds: number;
} {
  const oneMinuteAgo = Date.now() - 60000;

  // Clean up old entries
  while (requestLog.length > 0 && requestLog[0] < oneMinuteAgo) {
    requestLog.shift();
  }
  while (tokenLog.length > 0 && tokenLog[0].timestamp < oneMinuteAgo) {
    tokenLog.shift();
  }

  const recentTokens = tokenLog.reduce((sum, entry) => sum + entry.tokens, 0);

  // Calculate time until oldest entry expires
  const oldestRequest = requestLog[0] || Date.now();
  const resetInSeconds = Math.max(0, Math.ceil((oldestRequest + 60000 - Date.now()) / 1000));

  return {
    requestsRemaining: Math.max(0, CLAUDE_REQUESTS_PER_MINUTE - requestLog.length),
    tokensRemaining: Math.max(0, TOKENS_PER_MINUTE - recentTokens),
    resetInSeconds,
  };
}

/**
 * Wait for rate limit to reset if needed
 * @returns Promise that resolves when rate limit allows a request
 */
export async function waitForRateLimit(): Promise<void> {
  if (canMakeRequest()) {
    return;
  }

  const status = getRateLimitStatus();
  const waitTime = (status.resetInSeconds + 1) * 1000; // Add 1 second buffer

  return new Promise((resolve) => setTimeout(resolve, waitTime));
}
