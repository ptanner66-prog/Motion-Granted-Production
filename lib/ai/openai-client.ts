/**
 * OpenAI API Client Module
 *
 * GPT-5.2 client for Tier C holding verification (CIV Spec requirement)
 * Implements rate limiting, credential rotation, cost tracking, and error handling.
 *
 * Source: Gap Analysis A-2
 */

import OpenAI from 'openai';

// ============================================================================
// TYPES
// ============================================================================

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
}

export interface OpenAIRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  systemPrompt?: string;
  responseFormat?: 'text' | 'json_object';
}

export interface OpenAIResponse {
  success: boolean;
  content?: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost?: number;
  model?: string;
  error?: string;
  latencyMs?: number;
}

export interface CostTracking {
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  lastResetAt: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Model configuration
const DEFAULT_MODEL = 'gpt-4o'; // Fallback if GPT-5.2 not available
const TIER_C_MODEL = 'gpt-5.2'; // Primary for Tier C holding verification

// Rate limiting (matches Anthropic pattern)
const RATE_LIMIT_REQUESTS_PER_MINUTE = 60;
const RATE_LIMIT_TOKENS_PER_MINUTE = 150000;

// Cost per 1K tokens (approximate, update as pricing changes)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-5.2': { input: 0.005, output: 0.015 }, // Estimated
  'o1': { input: 0.015, output: 0.06 },
  'o1-mini': { input: 0.003, output: 0.012 },
};

// Retry configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  private requestTimestamps: number[] = [];
  private tokenCounts: { timestamp: number; tokens: number }[] = [];

  async waitForCapacity(estimatedTokens: number = 1000): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old entries
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
    this.tokenCounts = this.tokenCounts.filter(t => t.timestamp > oneMinuteAgo);

    // Check request rate
    if (this.requestTimestamps.length >= RATE_LIMIT_REQUESTS_PER_MINUTE) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = oldestRequest + 60000 - now;
      if (waitTime > 0) {
        console.log(`[OpenAI] Rate limit: waiting ${waitTime}ms for request capacity`);
        await this.sleep(waitTime);
      }
    }

    // Check token rate
    const currentTokens = this.tokenCounts.reduce((sum, t) => sum + t.tokens, 0);
    if (currentTokens + estimatedTokens > RATE_LIMIT_TOKENS_PER_MINUTE) {
      const oldestToken = this.tokenCounts[0];
      if (oldestToken) {
        const waitTime = oldestToken.timestamp + 60000 - now;
        if (waitTime > 0) {
          console.log(`[OpenAI] Rate limit: waiting ${waitTime}ms for token capacity`);
          await this.sleep(waitTime);
        }
      }
    }

    // Record this request
    this.requestTimestamps.push(now);
    this.tokenCounts.push({ timestamp: now, tokens: estimatedTokens });
  }

  recordActualTokens(tokens: number): void {
    const now = Date.now();
    // Update the most recent entry with actual tokens
    const recent = this.tokenCounts.find(t => t.timestamp === now);
    if (recent) {
      recent.tokens = tokens;
    } else {
      this.tokenCounts.push({ timestamp: now, tokens });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// COST TRACKER
// ============================================================================

class CostTracker {
  private tracking: CostTracking = {
    requestCount: 0,
    totalTokens: 0,
    totalCost: 0,
    lastResetAt: new Date().toISOString(),
  };

  record(model: string, promptTokens: number, completionTokens: number): number {
    const costs = MODEL_COSTS[model] || MODEL_COSTS['gpt-4o'];
    const inputCost = (promptTokens / 1000) * costs.input;
    const outputCost = (completionTokens / 1000) * costs.output;
    const totalCost = inputCost + outputCost;

    this.tracking.requestCount++;
    this.tracking.totalTokens += promptTokens + completionTokens;
    this.tracking.totalCost += totalCost;

    return totalCost;
  }

  getTracking(): CostTracking {
    return { ...this.tracking };
  }

  reset(): void {
    this.tracking = {
      requestCount: 0,
      totalTokens: 0,
      totalCost: 0,
      lastResetAt: new Date().toISOString(),
    };
  }
}

// ============================================================================
// OPENAI CLIENT
// ============================================================================

class OpenAIClient {
  private client: OpenAI | null = null;
  private rateLimiter = new RateLimiter();
  private costTracker = new CostTracker();
  private apiKeyIndex = 0;
  private apiKeys: string[] = [];

  constructor() {
    this.loadApiKeys();
  }

  private loadApiKeys(): void {
    // Support multiple API keys for rotation
    const primaryKey = process.env.OPENAI_API_KEY;
    const rotationKeys = process.env.OPENAI_API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];

    this.apiKeys = primaryKey ? [primaryKey, ...rotationKeys] : rotationKeys;

    if (this.apiKeys.length === 0) {
      console.warn('[OpenAI] No API keys configured');
    }
  }

  private getClient(): OpenAI {
    if (!this.client || this.apiKeys.length === 0) {
      if (this.apiKeys.length === 0) {
        throw new Error('OpenAI API key not configured');
      }

      this.client = new OpenAI({
        apiKey: this.apiKeys[this.apiKeyIndex],
        organization: process.env.OPENAI_ORGANIZATION,
      });
    }

    return this.client;
  }

  private rotateApiKey(): void {
    if (this.apiKeys.length > 1) {
      this.apiKeyIndex = (this.apiKeyIndex + 1) % this.apiKeys.length;
      this.client = null; // Force recreation with new key
      console.log(`[OpenAI] Rotated to API key index ${this.apiKeyIndex}`);
    }
  }

  /**
   * Check if OpenAI is properly configured
   */
  isConfigured(): boolean {
    return this.apiKeys.length > 0;
  }

  /**
   * Main completion method with rate limiting, retries, and cost tracking
   */
  async complete(
    prompt: string,
    options: OpenAIRequestOptions = {}
  ): Promise<OpenAIResponse> {
    const startTime = Date.now();

    const {
      model = DEFAULT_MODEL,
      maxTokens = 32000, // Increased for complex analysis
      temperature = 0.7,
      reasoningEffort = 'medium',
      systemPrompt,
      responseFormat,
    } = options;

    // Wait for rate limit capacity
    await this.rateLimiter.waitForCapacity(maxTokens);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const client = this.getClient();

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }

        messages.push({ role: 'user', content: prompt });

        // Build request parameters
        const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
        };

        // Add response format if specified
        if (responseFormat === 'json_object') {
          requestParams.response_format = { type: 'json_object' };
        }

        // Add reasoning effort for o1 models
        if (model.startsWith('o1') && reasoningEffort) {
          // o1 models use reasoning_effort parameter
          (requestParams as unknown as Record<string, unknown>).reasoning_effort = reasoningEffort;
        }

        const response = await client.chat.completions.create(requestParams);

        const content = response.choices[0]?.message?.content || '';
        const promptTokens = response.usage?.prompt_tokens || 0;
        const completionTokens = response.usage?.completion_tokens || 0;
        const totalTokens = response.usage?.total_tokens || 0;

        // Record actual tokens for rate limiting
        this.rateLimiter.recordActualTokens(totalTokens);

        // Track cost
        const cost = this.costTracker.record(model, promptTokens, completionTokens);

        const latencyMs = Date.now() - startTime;

        console.log(`[OpenAI] Request completed: model=${model}, tokens=${totalTokens}, cost=$${cost.toFixed(4)}, latency=${latencyMs}ms`);

        return {
          success: true,
          content,
          tokensUsed: {
            prompt: promptTokens,
            completion: completionTokens,
            total: totalTokens,
          },
          cost,
          model,
          latencyMs,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should rotate API key
        if (error instanceof OpenAI.RateLimitError) {
          console.warn(`[OpenAI] Rate limit hit on attempt ${attempt + 1}, rotating key`);
          this.rotateApiKey();
        } else if (error instanceof OpenAI.AuthenticationError) {
          console.error(`[OpenAI] Authentication error, rotating key`);
          this.rotateApiKey();
        }

        // Exponential backoff with jitter
        if (attempt < MAX_RETRIES - 1) {
          const baseDelay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
          const jitter = Math.random() * baseDelay * 0.1;
          const delay = baseDelay + jitter;

          console.warn(`[OpenAI] Request failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${Math.round(delay)}ms:`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`[OpenAI] All ${MAX_RETRIES} attempts failed:`, lastError?.message);

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * GPT-5.2 holding verification (Tier C primary model)
   */
  async verifyHolding(
    citationText: string,
    caseContext: string,
    proposition: string
  ): Promise<OpenAIResponse> {
    const systemPrompt = `You are an expert legal analyst specializing in case law verification.
Your task is to verify whether a cited case actually supports the legal proposition claimed.

Analyze with high reasoning effort and provide:
1. Whether the case exists and is correctly cited
2. Whether the holding of the case supports the proposition
3. Confidence level (HIGH, MEDIUM, LOW)
4. Any caveats or distinctions

Be precise and cite specific language from the case when possible.`;

    const prompt = `CITATION: ${citationText}

PROPOSITION CLAIMED: ${proposition}

CASE CONTEXT:
${caseContext}

Verify this citation and its claimed proposition. Return your analysis as JSON:
{
  "verified": boolean,
  "holdingSupportsProposition": boolean,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "actualHolding": "string describing the actual holding",
  "analysis": "string with detailed analysis",
  "caveats": ["array of any caveats or distinctions"]
}`;

    return this.complete(prompt, {
      model: TIER_C_MODEL,
      maxTokens: 32000, // Increased from 2000 for detailed holding verification
      temperature: 0.3,
      reasoningEffort: 'high',
      systemPrompt,
      responseFormat: 'json_object',
    });
  }

  /**
   * Get current cost tracking data
   */
  getCostTracking(): CostTracking {
    return this.costTracker.getTracking();
  }

  /**
   * Reset cost tracking (e.g., monthly reset)
   */
  resetCostTracking(): void {
    this.costTracker.reset();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const openaiClient = new OpenAIClient();

export const isOpenAIConfigured = openaiClient.isConfigured();

export async function askOpenAI(
  prompt: string,
  options?: OpenAIRequestOptions
): Promise<OpenAIResponse> {
  return openaiClient.complete(prompt, options);
}

export async function verifyHoldingWithGPT(
  citationText: string,
  caseContext: string,
  proposition: string
): Promise<OpenAIResponse> {
  return openaiClient.verifyHolding(citationText, caseContext, proposition);
}

export function getOpenAICostTracking(): CostTracking {
  return openaiClient.getCostTracking();
}

export function resetOpenAICostTracking(): void {
  openaiClient.resetCostTracking();
}

export default openaiClient;
