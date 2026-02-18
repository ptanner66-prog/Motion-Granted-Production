/**
 * Model Router Module — Canonical Source (CGA6-037)
 *
 * Unified model routing for both workflow phases (DB-based) and
 * Citation Integrity Verification (config-based).
 *
 * DB-based routing reads from model_routing_config table.
 * CIV routing uses hardcoded config aligned with lib/config/citation-models.ts.
 *
 * Source: API Architecture Spec Section 2, Quick Reference
 */

import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { askOpenAI } from '@/lib/ai/openai-client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('model-router');
import { askClaude, getAnthropicClient } from '@/lib/automation/claude';
import { getOpenAIAPIKey } from '@/lib/api-keys';
import { getCitationModel, CITATION_GPT_MODELS } from '@/lib/config/citation-models';
import { MODELS } from '@/lib/config/models';
import { normalizeConfidence } from '@/lib/citation/utils';

// ============================================================================
// CIV RETRY UTILITY
// ============================================================================

/**
 * Retry wrapper with exponential backoff and jitter for CIV API calls.
 * Retries on rate limits, overloaded errors, and transient server errors.
 */
async function withCIVRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const isRetryable = msg.includes('rate_limit') || msg.includes('overloaded') ||
        msg.includes('529') || msg.includes('500') || msg.includes('503') || msg.includes('timeout');
      if (!isRetryable || attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4);
      log.warn(`[CIV Retry] Attempt ${attempt + 1} failed (${msg}), retrying in ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('withCIVRetry: unreachable');
}

// ============================================================================
// TYPES
// ============================================================================

import type { MotionTier } from '@/types/workflow';
export type { MotionTier };

export type TaskType =
  | 'stage_1_holding'
  | 'stage_2_adversarial'
  | 'dicta_detection'
  | 'bad_law_analysis'
  | 'drafting'
  | 'judge_simulation'
  | 'tiebreaker';

export interface ModelConfig {
  tier: MotionTier;
  taskType: TaskType;
  modelString: string;
}

export type ModelProvider = 'openai' | 'anthropic';

export interface ModelCallResult {
  content: string;
  usage: {
    tokens: number;
    cost: number;
  };
  model: string;
  provider: ModelProvider;
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  configs: Map<string, string>;
  timestamp: number;
}

// In-memory cache for model configs
const configCache: Map<MotionTier, CacheEntry> = new Map();

// ============================================================================
// DEFAULT CONFIGURATIONS (fallback if DB unavailable)
// ============================================================================

const DEFAULT_CONFIGS: Record<MotionTier, Record<TaskType, string>> = {
  'A': {
    stage_1_holding: MODELS.GPT4_TURBO,
    stage_2_adversarial: MODELS.OPUS,
    dicta_detection: MODELS.HAIKU,
    bad_law_analysis: MODELS.HAIKU,
    drafting: MODELS.SONNET,
    judge_simulation: MODELS.OPUS,
    tiebreaker: MODELS.GPT4_TURBO,
  },
  'B': {
    stage_1_holding: MODELS.GPT4_TURBO,
    stage_2_adversarial: MODELS.OPUS,
    dicta_detection: MODELS.HAIKU,
    bad_law_analysis: MODELS.HAIKU,
    drafting: MODELS.SONNET,
    judge_simulation: MODELS.OPUS,
    tiebreaker: MODELS.GPT4_TURBO,
  },
  'C': {
    stage_1_holding: MODELS.GPT4_TURBO,
    stage_2_adversarial: MODELS.OPUS,
    dicta_detection: MODELS.SONNET,
    bad_law_analysis: MODELS.SONNET,
    drafting: MODELS.OPUS,
    judge_simulation: MODELS.OPUS,
    tiebreaker: MODELS.GPT4_TURBO,
  },
  'D': {
    stage_1_holding: MODELS.GPT4_TURBO,
    stage_2_adversarial: MODELS.OPUS,
    dicta_detection: MODELS.SONNET,
    bad_law_analysis: MODELS.SONNET,
    drafting: MODELS.OPUS,
    judge_simulation: MODELS.OPUS,
    tiebreaker: MODELS.GPT4_TURBO,
  },
};

// ============================================================================
// MODEL PROVIDER DETECTION
// ============================================================================

/**
 * Determine if a model string is OpenAI or Anthropic
 */
export function getModelProvider(modelString: string): ModelProvider {
  const lowerModel = modelString.toLowerCase();

  // OpenAI models
  if (
    lowerModel.startsWith('gpt-') ||
    lowerModel.startsWith('o1') ||
    lowerModel.includes('openai') ||
    lowerModel === 'gpt-4o' ||
    lowerModel === 'gpt-4-turbo'
  ) {
    return 'openai';
  }

  // Anthropic models (Claude)
  if (
    lowerModel.includes('claude') ||
    lowerModel.includes('anthropic') ||
    lowerModel.includes('haiku') ||
    lowerModel.includes('sonnet') ||
    lowerModel.includes('opus')
  ) {
    return 'anthropic';
  }

  // Default to Anthropic for unknown models
  log.warn(`[ModelRouter] Unknown model provider for: ${modelString}, defaulting to anthropic`);
  return 'anthropic';
}

// ============================================================================
// CONFIG FETCHING
// ============================================================================

/**
 * Check if cache is valid for a tier
 */
function isCacheValid(tier: MotionTier): boolean {
  const entry = configCache.get(tier);
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Fetch model configs from database for a tier
 */
async function fetchConfigsFromDB(tier: MotionTier): Promise<Map<string, string>> {
  const configs = new Map<string, string>();

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('model_routing_config')
      .select('task_type, model_string')
      .eq('tier', tier);

    if (error) {
      log.error(`[ModelRouter] DB error fetching configs for tier ${tier}:`, error);
      return configs;
    }

    if (data) {
      for (const row of data) {
        configs.set(row.task_type, row.model_string);
      }
    }

    log.info(`[ModelRouter] Loaded ${configs.size} configs for tier ${tier} from DB`);
  } catch (error) {
    log.error(`[ModelRouter] Error fetching configs:`, error);
  }

  return configs;
}

/**
 * Get all model configs for a tier with caching
 */
export async function getModelsForTier(tier: MotionTier): Promise<Record<string, string>> {
  // Check cache first
  if (isCacheValid(tier)) {
    const cached = configCache.get(tier)!;
    return Object.fromEntries(cached.configs);
  }

  // Fetch from DB
  const dbConfigs = await fetchConfigsFromDB(tier);

  // Merge with defaults (DB takes precedence)
  const defaults = DEFAULT_CONFIGS[tier];
  const merged = new Map<string, string>();

  // Start with defaults
  for (const [taskType, modelString] of Object.entries(defaults)) {
    merged.set(taskType, modelString);
  }

  // Override with DB configs
  for (const [taskType, modelString] of dbConfigs) {
    merged.set(taskType, modelString);
  }

  // Update cache
  configCache.set(tier, {
    configs: merged,
    timestamp: Date.now(),
  });

  return Object.fromEntries(merged);
}

/**
 * Get model for a specific tier/task combination
 */
export async function getModelForTask(tier: MotionTier, taskType: TaskType): Promise<string> {
  const configs = await getModelsForTier(tier);
  const model = configs[taskType];

  if (!model) {
    log.warn(`[ModelRouter] No config for tier ${tier}, task ${taskType}, using default`);
    return DEFAULT_CONFIGS[tier][taskType] || MODELS.SONNET;
  }

  // Log model selection for audit
  log.info(`[ModelRouter] Selected model for tier ${tier}, task ${taskType}: ${model}`);

  return model;
}

// ============================================================================
// MODEL CALLING
// ============================================================================

/**
 * Call a model with unified interface
 * Routes to OpenAI or Anthropic based on model string
 */
export async function callModel(
  modelString: string,
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
    responseFormat?: 'text' | 'json_object';
  }
): Promise<ModelCallResult> {
  const provider = getModelProvider(modelString);
  const startTime = Date.now();

  log.info(`[ModelRouter] Calling ${provider} model: ${modelString}`);

  try {
    if (provider === 'openai') {
      const response = await askOpenAI(prompt, {
        model: modelString,
        maxTokens: options?.maxTokens || 32000, // Increased from 2000 for comprehensive analysis
        temperature: options?.temperature ?? 0.2,
        systemPrompt: options?.systemPrompt,
        responseFormat: options?.responseFormat,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error || 'OpenAI call failed');
      }

      return {
        content: response.content,
        usage: {
          tokens: response.tokensUsed?.total || 0,
          cost: response.cost || 0,
        },
        model: modelString,
        provider: 'openai',
      };
    } else {
      // Anthropic (Claude)
      const response = await askClaude({
        prompt,
        model: modelString,
        maxTokens: options?.maxTokens || 32000, // Increased from 2000 for comprehensive analysis
        temperature: options?.temperature ?? 0.2,
        systemPrompt: options?.systemPrompt,
      });

      if (!response.success || !response.result?.content) {
        throw new Error(response.error || 'Claude call failed');
      }

      return {
        content: response.result.content,
        usage: {
          tokens: response.result.tokensUsed || 0,
          cost: 0, // Cost tracking handled at higher level
        },
        model: modelString,
        provider: 'anthropic',
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(`[ModelRouter] Model call failed after ${duration}ms:`, error);
    throw error;
  }
}

/**
 * Call model for a specific tier/task
 * Automatically selects the right model based on configuration
 */
export async function callModelForTask(
  tier: MotionTier,
  taskType: TaskType,
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
    responseFormat?: 'text' | 'json_object';
  }
): Promise<ModelCallResult> {
  const model = await getModelForTask(tier, taskType);
  return callModel(model, prompt, options);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear the model config cache
 * Call this after updating model_routing_config in database
 */
export function clearModelCache(): void {
  configCache.clear();
  log.info('[ModelRouter] Cache cleared');
}

/**
 * Refresh cache for a specific tier
 */
export async function refreshTierCache(tier: MotionTier): Promise<void> {
  configCache.delete(tier);
  await getModelsForTier(tier);
  log.info(`[ModelRouter] Cache refreshed for tier ${tier}`);
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log model selection to database for audit trail
 */
export async function logModelSelection(
  orderId: string,
  tier: MotionTier,
  taskType: TaskType,
  modelString: string,
  provider: ModelProvider
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'model_selection',
      action_details: {
        tier,
        taskType,
        modelString,
        provider,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error('[ModelRouter] Failed to log model selection:', error);
    // Don't throw - logging failure shouldn't break the pipeline
  }
}

// ============================================================================
// CIV MODEL ROUTING (migrated from lib/civ/model-router.ts — CGA6-037)
// ============================================================================

/**
 * CIV-specific model routing config aligned with lib/config/citation-models.ts.
 * Tier-based routing per Clay's Part C §3.
 */
export const CIV_MODEL_ROUTING = {
  tier_a: {
    stage_1_holding: CITATION_GPT_MODELS.STAGE_1_DEFAULT,
    stage_2_adversarial: MODELS.OPUS,
    steps_3_5: MODELS.HAIKU,
  },
  tier_b: {
    stage_1_holding: CITATION_GPT_MODELS.STAGE_1_DEFAULT,
    stage_2_adversarial: MODELS.OPUS,
    steps_3_5: MODELS.HAIKU,
  },
  tier_c: {
    stage_1_holding: CITATION_GPT_MODELS.STAGE_1_TIER_C,
    stage_2_adversarial: MODELS.OPUS,
    steps_3_5: MODELS.SONNET,
  },
  tier_d: {
    stage_1_holding: CITATION_GPT_MODELS.STAGE_1_TIER_C,
    stage_2_adversarial: MODELS.OPUS,
    steps_3_5: MODELS.SONNET,
  },
} as const;

/** Motion type to tier mapping for CIV */
export const MOTION_TYPE_TO_TIER: Record<string, MotionTier> = {
  // Tier A - Simple procedural
  'extension_of_time': 'A',
  'continuance': 'A',
  'pro_hac_vice': 'A',
  'substitution_of_counsel': 'A',

  // Tier B - Standard substantive
  'motion_to_compel': 'B',
  'motion_for_protective_order': 'B',
  'demurrer': 'B',
  'motion_to_strike': 'B',
  'motion_for_sanctions': 'B',
  'anti_slapp': 'B',
  'motion_to_dismiss': 'B',

  // Tier C - Complex
  'anti_slapp_complex': 'C',
  'motion_in_limine_complex': 'C',
  'jnov': 'C',
  'new_trial': 'C',

  // Tier D - Highly Complex/Dispositive
  'motion_for_summary_judgment': 'D',
  'msj': 'D',
  'preliminary_injunction': 'D',
  'tro': 'D',
  'class_certification': 'D',
  'daubert_motion': 'D',
};

/** Get tier from motion type string */
export function getTierFromMotionType(motionType: string): MotionTier {
  const normalized = motionType.toLowerCase().replace(/\s+/g, '_');
  return MOTION_TYPE_TO_TIER[normalized] || 'B';
}

/** Get the appropriate model for a CIV task and tier */
export function getCIVModelForTask(
  task: 'stage_1_holding' | 'stage_2_adversarial' | 'steps_3_5',
  tier: MotionTier
): string {
  const tierKey = `tier_${tier.toLowerCase()}` as keyof typeof CIV_MODEL_ROUTING;
  return CIV_MODEL_ROUTING[tierKey][task];
}

// OpenAI client singleton for CIV
let civOpenAIClient: OpenAI | null = null;

/** Get or create OpenAI client for CIV pipeline */
export async function getCIVOpenAIClient(): Promise<OpenAI> {
  if (!civOpenAIClient) {
    const apiKey = await getOpenAIAPIKey();
    civOpenAIClient = new OpenAI({ apiKey });
  }
  return civOpenAIClient;
}

/** Call OpenAI directly (for CIV Stage 1 holding verification) — with retry */
export async function callCIVOpenAI(
  model: string,
  prompt: string,
  maxTokens: number = 32000
): Promise<string> {
  const client = await getCIVOpenAIClient();

  return withCIVRetry(async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.1,
    });

    return response.choices[0]?.message?.content || '';
  });
}

/** Call Anthropic directly (for CIV Stage 2 and Steps 3-5) — with retry and configurable temperature */
export async function callCIVAnthropic(
  model: string,
  prompt: string,
  maxTokens: number = 32000,
  temperature: number = 0
): Promise<string> {
  const client = await getAnthropicClient();

  if (!client) {
    throw new Error('Anthropic client not configured');
  }

  return withCIVRetry(async () => {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
    return (textBlock && 'text' in textBlock) ? (textBlock as { type: 'text'; text: string }).text : '';
  });
}

/**
 * Stage 2 trigger logic — Clay's Part C §4 BINDING
 *
 * Trigger adversarial verification when:
 * - Confidence is borderline (80-94%) -> HOLDING_STAGE_2
 * - Confidence is low (<80%) -> HOLDING_FAIL (will also get Stage 2 for audit)
 *
 * >=95% = skip Stage 2 (VERIFIED)
 */
export function shouldTriggerStage2(
  confidence: number,
  flags: string[] = []
): boolean {
  const normalizedConf = normalizeConfidence(confidence);

  if (normalizedConf >= 0.95) {
    return false;
  }

  return true;
}

/** Reset CIV OpenAI client (for testing or key rotation) */
export function resetCIVOpenAIClient(): void {
  civOpenAIClient = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getModelForTask,
  getModelsForTier,
  getModelProvider,
  callModel,
  callModelForTask,
  clearModelCache,
  refreshTierCache,
  logModelSelection,
  // CIV exports
  getTierFromMotionType,
  getCIVModelForTask,
  callCIVOpenAI,
  callCIVAnthropic,
  shouldTriggerStage2,
};
