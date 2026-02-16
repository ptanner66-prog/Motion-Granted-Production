/**
 * OpenAI Usage Normalization Adapter
 *
 * D3 Task 4: Maps OpenAI's chat completion usage response to a normalized
 * shape consumed by the cost tracking pipeline (D3 Tasks 7-8).
 *
 * OpenAI's usage object has a different shape than Anthropic's. This adapter
 * ensures both providers feed the same NormalizedUsage interface into
 * cost_tracking inserts.
 *
 * Fields:
 *   input_tokens           — prompt_tokens from OpenAI
 *   output_tokens          — completion_tokens from OpenAI
 *   cache_creation_input_tokens — always 0 (OpenAI has no cache creation)
 *   cache_read_input_tokens     — prompt_tokens_details.cached_tokens if present, else 0
 *   total_tokens           — total_tokens from OpenAI (or sum of input+output)
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Normalized usage shape consumed by cost_tracking INSERT.
 * Both Anthropic and OpenAI usage are mapped to this before persistence.
 */
export interface NormalizedUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens: number;
}

/**
 * Partial shape of OpenAI's ChatCompletion.usage object.
 * We only reference fields we actually use to avoid tight coupling.
 */
export interface OpenAIUsageResponse {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ============================================================================
// NORMALIZER
// ============================================================================

/**
 * Map an OpenAI usage response to NormalizedUsage.
 *
 * Handles missing/undefined fields gracefully — defaults to 0.
 * Never throws; returns zero-usage on null/undefined input.
 *
 * @param usage - The `usage` object from an OpenAI ChatCompletion response
 * @returns NormalizedUsage with all 5 fields populated
 */
export function normalizeOpenAIUsage(
  usage: OpenAIUsageResponse | null | undefined
): NormalizedUsage {
  if (!usage) {
    return {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      total_tokens: 0,
    };
  }

  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: 0, // OpenAI has no cache creation concept
    cache_read_input_tokens: cachedTokens,
    total_tokens: usage.total_tokens ?? inputTokens + outputTokens,
  };
}
