/**
 * Claude API Client with Rate Limit Handling
 *
 * Wraps Anthropic SDK with:
 * - Automatic retry on rate limit errors (429)
 * - Exponential backoff with jitter
 * - Request logging for debugging
 */

import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicAPIKey } from '@/lib/api-keys';

// Rate limit tracking
let lastRequestTime = 0;
let requestCount = 0;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MIN_REQUEST_INTERVAL = 2000; // Minimum 2 seconds between requests

interface RateLimitInfo {
  retryAfterMs: number;
  message: string;
}

/**
 * Parse rate limit error to extract retry timing
 */
function parseRateLimitError(error: unknown): RateLimitInfo | null {
  if (!(error instanceof Error)) return null;

  const message = error.message;

  // Check for 429 rate limit error
  if (message.includes('429') || message.includes('rate_limit')) {
    // Default to 60 seconds if we can't parse the actual wait time
    let retryAfterMs = 60000;

    // Try to parse "retry after X seconds" from error message
    const retryMatch = message.match(/retry\s*(?:after|in)\s*(\d+)\s*(?:seconds?|s)/i);
    if (retryMatch) {
      retryAfterMs = parseInt(retryMatch[1], 10) * 1000;
    }

    // If it's specifically about tokens per minute, wait the full minute
    if (message.includes('per minute')) {
      retryAfterMs = Math.max(retryAfterMs, 60000);
    }

    return { retryAfterMs, message };
  }

  return null;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create Claude message with automatic rate limit handling
 */
export async function createMessageWithRetry(
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: {
    maxRetries?: number;
    onRetry?: (attempt: number, waitMs: number, error: string) => void;
    onSuccess?: (inputTokens: number, outputTokens: number) => void;
  } = {}
): Promise<Anthropic.Message> {
  const { maxRetries = 5, onRetry, onSuccess } = options;

  // Get API key
  const apiKey = await getAnthropicAPIKey();
  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Add it in Admin Settings > API Keys.');
  }

  const anthropic = new Anthropic({ apiKey });

  // Ensure minimum interval between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`[Claude] Waiting ${waitTime}ms before request (rate limit protection)`);
    await sleep(waitTime);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Update tracking
      lastRequestTime = Date.now();
      requestCount++;

      console.log(`[Claude] Attempt ${attempt + 1}/${maxRetries + 1} - Making request...`);

      const response = await anthropic.messages.create(params);

      // Log success
      console.log(`[Claude] Success - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);

      if (onSuccess) {
        onSuccess(response.usage.input_tokens, response.usage.output_tokens);
      }

      return response;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a rate limit error
      const rateLimitInfo = parseRateLimitError(error);

      if (rateLimitInfo && attempt < maxRetries) {
        // Add jitter (10-30% extra) to avoid thundering herd
        const jitter = rateLimitInfo.retryAfterMs * (0.1 + Math.random() * 0.2);
        const waitMs = Math.ceil(rateLimitInfo.retryAfterMs + jitter);

        console.log(`[Claude] Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 2}...`);

        if (onRetry) {
          onRetry(attempt + 1, waitMs, rateLimitInfo.message);
        }

        await sleep(waitMs);
        continue;
      }

      // Check for other retryable errors (5xx, network issues)
      if (isRetryableError(error) && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const baseDelay = 2000;
        const waitMs = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;

        console.log(`[Claude] Retryable error. Waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 2}...`);

        if (onRetry) {
          onRetry(attempt + 1, waitMs, lastError.message);
        }

        await sleep(waitMs);
        continue;
      }

      // Non-retryable error or out of retries
      throw lastError;
    }
  }

  throw lastError || new Error('Unknown error during Claude API call');
}

/**
 * Check if an error is retryable (network errors, server errors)
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Network errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  ) {
    return true;
  }

  // Server errors (5xx)
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('internal server error')
  ) {
    return true;
  }

  // Anthropic overloaded
  if (message.includes('overloaded') || message.includes('capacity')) {
    return true;
  }

  return false;
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(): {
  requestsInWindow: number;
  timeSinceLastRequest: number;
  canMakeRequest: boolean;
} {
  const now = Date.now();

  // Reset count if window has passed
  if (now - lastRequestTime > RATE_LIMIT_WINDOW) {
    requestCount = 0;
  }

  return {
    requestsInWindow: requestCount,
    timeSinceLastRequest: now - lastRequestTime,
    canMakeRequest: now - lastRequestTime >= MIN_REQUEST_INTERVAL,
  };
}

/**
 * Estimate if request will hit rate limit based on token count
 * Note: This is approximate - actual rate limit is 30k input tokens/min
 */
export function estimateRateLimitRisk(inputTokenCount: number): 'low' | 'medium' | 'high' {
  const RATE_LIMIT_TOKENS_PER_MINUTE = 30000;

  // If single request is > 50% of limit, high risk
  if (inputTokenCount > RATE_LIMIT_TOKENS_PER_MINUTE * 0.5) {
    return 'high';
  }

  // If > 25% of limit, medium risk
  if (inputTokenCount > RATE_LIMIT_TOKENS_PER_MINUTE * 0.25) {
    return 'medium';
  }

  return 'low';
}
