/**
 * Model Router Module
 *
 * Tier-based AI model routing that reads from model_routing_config database table.
 *
 * Config for TIER A/B:
 * - stage_1_holding = 'gpt-4o'
 * - stage_2_adversarial = 'claude-opus-4-5-20250101'
 * - dicta_detection = 'claude-haiku-4-5-20251001'
 * - bad_law_analysis = 'claude-haiku-4-5-20251001'
 * - drafting = 'claude-sonnet-4-5-20250929'
 *
 * Config for TIER C:
 * - stage_1_holding = 'gpt-5.2'
 * - stage_2_adversarial = 'claude-opus-4-5-20250101'
 * - dicta_detection = 'claude-sonnet-4-5-20250929'
 * - bad_law_analysis = 'claude-sonnet-4-5-20250929'
 * - drafting = 'claude-opus-4-5-20250101'
 * - judge_simulation = 'claude-opus-4-5-20250101'
 *
 * Source: API Architecture Spec Section 2, Quick Reference
 */

import { createClient } from '@/lib/supabase/server';
import { askOpenAI } from '@/lib/ai/openai-client';
import { askClaude } from '@/lib/automation/claude';

// ============================================================================
// TYPES
// ============================================================================

export type MotionTier = 'A' | 'B' | 'C';

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
    stage_1_holding: 'gpt-4o',
    stage_2_adversarial: 'claude-opus-4-5-20250101',
    dicta_detection: 'claude-haiku-4-5-20251001',
    bad_law_analysis: 'claude-haiku-4-5-20251001',
    drafting: 'claude-sonnet-4-5-20250929',
    judge_simulation: 'claude-opus-4-5-20250101',
    tiebreaker: 'gpt-4o',
  },
  'B': {
    stage_1_holding: 'gpt-4o',
    stage_2_adversarial: 'claude-opus-4-5-20250101',
    dicta_detection: 'claude-haiku-4-5-20251001',
    bad_law_analysis: 'claude-haiku-4-5-20251001',
    drafting: 'claude-sonnet-4-5-20250929',
    judge_simulation: 'claude-opus-4-5-20250101',
    tiebreaker: 'gpt-4o',
  },
  'C': {
    stage_1_holding: 'gpt-5.2',
    stage_2_adversarial: 'claude-opus-4-5-20250101',
    dicta_detection: 'claude-sonnet-4-5-20250929',
    bad_law_analysis: 'claude-sonnet-4-5-20250929',
    drafting: 'claude-opus-4-5-20250101',
    judge_simulation: 'claude-opus-4-5-20250101',
    tiebreaker: 'gpt-4o',
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
    lowerModel === 'gpt-5.2'
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
  console.warn(`[ModelRouter] Unknown model provider for: ${modelString}, defaulting to anthropic`);
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
      console.error(`[ModelRouter] DB error fetching configs for tier ${tier}:`, error);
      return configs;
    }

    if (data) {
      for (const row of data) {
        configs.set(row.task_type, row.model_string);
      }
    }

    console.log(`[ModelRouter] Loaded ${configs.size} configs for tier ${tier} from DB`);
  } catch (error) {
    console.error(`[ModelRouter] Error fetching configs:`, error);
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
    console.warn(`[ModelRouter] No config for tier ${tier}, task ${taskType}, using default`);
    return DEFAULT_CONFIGS[tier][taskType] || 'claude-sonnet-4-5-20250929';
  }

  // Log model selection for audit
  console.log(`[ModelRouter] Selected model for tier ${tier}, task ${taskType}: ${model}`);

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

  console.log(`[ModelRouter] Calling ${provider} model: ${modelString}`);

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
    console.error(`[ModelRouter] Model call failed after ${duration}ms:`, error);
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
  console.log('[ModelRouter] Cache cleared');
}

/**
 * Refresh cache for a specific tier
 */
export async function refreshTierCache(tier: MotionTier): Promise<void> {
  configCache.delete(tier);
  await getModelsForTier(tier);
  console.log(`[ModelRouter] Cache refreshed for tier ${tier}`);
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
    console.error('[ModelRouter] Failed to log model selection:', error);
    // Don't throw - logging failure shouldn't break the pipeline
  }
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
};
