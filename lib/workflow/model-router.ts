/**
 * Model Router - v7.2
 *
 * Handles model selection (Sonnet vs Opus) and extended thinking configuration
 * based on workflow phase and motion tier.
 *
 * Routing Rules:
 * - Phase VII (always): Opus
 * - Tier A (any phase): Sonnet
 * - Tier B/C Phases IV, VI, VIII: Opus
 * - Everything else: Sonnet
 *
 * Extended Thinking:
 * - Phase VI (B/C only): 8K tokens
 * - Phase VII (all tiers): 10K tokens
 * - Phase VIII (B/C only): 8K tokens
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  type MotionTier,
  type WorkflowPhaseCode,
  SONNET_MODEL,
  OPUS_MODEL,
  getModelForPhase,
  getExtendedThinkingBudget,
} from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelConfig {
  model: string;
  extendedThinking: boolean;
  thinkingBudget: number | null;
  maxTokens: number;
}

export interface PhaseExecutionConfig extends ModelConfig {
  phase: WorkflowPhaseCode;
  tier: MotionTier;
  systemPrompt: string;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_MAX_TOKENS = 8192; // Doubled for complex workflows
const EXTENDED_THINKING_MAX_TOKENS = 32000; // Doubled for extended thinking

// ============================================================================
// MODEL ROUTER
// ============================================================================

/**
 * Get the complete model configuration for a phase/tier combination
 */
export function getModelConfig(
  phase: WorkflowPhaseCode,
  tier: MotionTier
): ModelConfig {
  const model = getModelForPhase(phase, tier);
  const thinkingBudget = getExtendedThinkingBudget(phase, tier);
  const extendedThinking = thinkingBudget !== null;

  return {
    model,
    extendedThinking,
    thinkingBudget,
    maxTokens: extendedThinking ? EXTENDED_THINKING_MAX_TOKENS : DEFAULT_MAX_TOKENS,
  };
}

/**
 * Determine if a phase should use Opus model
 */
export function shouldUseOpus(
  phase: WorkflowPhaseCode,
  tier: MotionTier
): boolean {
  // Phase VII always uses Opus
  if (phase === 'VII') return true;

  // Tier A always uses Sonnet
  if (tier === 'A') return false;

  // Tier B/C uses Opus for specific phases
  const opusPhases: WorkflowPhaseCode[] = ['IV', 'VI', 'VIII'];
  return opusPhases.includes(phase);
}

/**
 * Get the model ID string for API calls
 */
export function getModelId(phase: WorkflowPhaseCode, tier: MotionTier): string {
  return shouldUseOpus(phase, tier) ? OPUS_MODEL : SONNET_MODEL;
}

/**
 * Get extended thinking budget in tokens (null if not enabled)
 */
export function getThinkingBudget(
  phase: WorkflowPhaseCode,
  tier: MotionTier
): number | null {
  return getExtendedThinkingBudget(phase, tier);
}

// ============================================================================
// ANTHROPIC API HELPERS
// ============================================================================

/**
 * Create Anthropic message parameters with correct model and thinking config
 */
export function createMessageParams(
  phase: WorkflowPhaseCode,
  tier: MotionTier,
  systemPrompt: string,
  userMessage: string,
  additionalParams?: Partial<Anthropic.MessageCreateParams>
): Anthropic.MessageCreateParams {
  const config = getModelConfig(phase, tier);

  const params: Anthropic.MessageCreateParams = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    ...additionalParams,
  };

  // Add extended thinking configuration if enabled
  if (config.extendedThinking && config.thinkingBudget) {
    (params as Anthropic.MessageCreateParams & { thinking?: { type: string; budget_tokens: number } }).thinking = {
      type: 'enabled',
      budget_tokens: config.thinkingBudget,
    };
  }

  return params;
}

/**
 * Create streaming message parameters
 */
export function createStreamingParams(
  phase: WorkflowPhaseCode,
  tier: MotionTier,
  systemPrompt: string,
  userMessage: string,
  additionalParams?: Partial<Anthropic.MessageCreateParams>
): Anthropic.MessageCreateParams {
  return {
    ...createMessageParams(phase, tier, systemPrompt, userMessage, additionalParams),
    stream: true,
  };
}

// ============================================================================
// LOGGING & METRICS
// ============================================================================

export interface ModelUsageLog {
  phase: WorkflowPhaseCode;
  tier: MotionTier;
  model: string;
  extendedThinking: boolean;
  thinkingBudget: number | null;
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  durationMs?: number;
  timestamp: Date;
}

/**
 * Create a usage log entry for tracking model usage
 */
export function createUsageLog(
  phase: WorkflowPhaseCode,
  tier: MotionTier,
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    thinkingTokens?: number;
    durationMs?: number;
  }
): ModelUsageLog {
  const config = getModelConfig(phase, tier);

  return {
    phase,
    tier,
    model: config.model,
    extendedThinking: config.extendedThinking,
    thinkingBudget: config.thinkingBudget,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    thinkingTokens: usage?.thinkingTokens,
    durationMs: usage?.durationMs,
    timestamp: new Date(),
  };
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

// Approximate costs per 1M tokens (as of v7.2)
const COST_PER_MILLION_TOKENS = {
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
};

/**
 * Estimate cost for a phase execution
 */
export function estimateCost(
  phase: WorkflowPhaseCode,
  tier: MotionTier,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): number {
  const model = shouldUseOpus(phase, tier) ? 'opus' : 'sonnet';
  const costs = COST_PER_MILLION_TOKENS[model];

  const inputCost = (estimatedInputTokens / 1_000_000) * costs.input;
  const outputCost = (estimatedOutputTokens / 1_000_000) * costs.output;

  return inputCost + outputCost;
}

/**
 * Get model display name for UI
 */
export function getModelDisplayName(phase: WorkflowPhaseCode, tier: MotionTier): string {
  const model = getModelId(phase, tier);
  if (model.includes('opus')) return 'Claude Opus 4.5';
  return 'Claude Sonnet 4';
}
