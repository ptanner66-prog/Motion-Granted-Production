/**
 * Model Router — Backward-compatible re-exports from phase-registry.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  This file is a THIN SHIM for backward compatibility.          ║
 * ║  All routing logic lives in lib/config/phase-registry.ts.      ║
 * ║  New code should import directly from phase-registry.           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Previously this was 243 lines that imported from types/workflow.ts
 * (which had the WRONG Sonnet model string: claude-sonnet-4-5-20250929).
 * All of that logic is now in phase-registry.ts with correct values.
 *
 * @deprecated Import from '@/lib/config/phase-registry' instead.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getModel,
  getThinkingBudget,
  getMaxTokens,
  type WorkflowPhase,
  type Tier,
} from '@/lib/config/phase-registry';
import { MODELS } from '@/lib/config/models';

// Re-export types that consumers may depend on
export type { WorkflowPhase, Tier };

// ============================================================================
// RE-EXPORTED TYPES
// ============================================================================

export interface ModelConfig {
  model: string;
  extendedThinking: boolean;
  thinkingBudget: number | null;
  maxTokens: number;
}

// ============================================================================
// BACKWARD-COMPATIBLE FUNCTIONS
// ============================================================================

/**
 * Get the complete model configuration for a phase/tier combination.
 * @deprecated Use getModel/getThinkingBudget/getMaxTokens from phase-registry directly.
 */
export function getModelConfig(
  phase: WorkflowPhase,
  tier: Tier
): ModelConfig {
  const model = getModel(phase, tier);
  const thinkingBudget = getThinkingBudget(phase, tier) ?? null;
  const extendedThinking = thinkingBudget !== null;

  return {
    model: model ?? MODELS.SONNET,
    extendedThinking,
    thinkingBudget,
    maxTokens: getMaxTokens(phase, tier),
  };
}

/**
 * @deprecated Use getModel() from phase-registry directly.
 */
export function shouldUseOpus(
  phase: WorkflowPhase,
  tier: Tier
): boolean {
  const model = getModel(phase, tier);
  return model !== null && model.includes('opus');
}

/**
 * @deprecated Use getModel() from phase-registry directly.
 */
export function getModelId(phase: WorkflowPhase, tier: Tier): string {
  return getModel(phase, tier) ?? MODELS.SONNET;
}

/**
 * Create Anthropic message parameters with correct model and thinking config.
 * @deprecated Build params directly using phase-registry getters.
 */
export function createMessageParams(
  phase: WorkflowPhase,
  tier: Tier,
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

  if (config.extendedThinking && config.thinkingBudget) {
    (params as Anthropic.MessageCreateParams & { thinking?: { type: string; budget_tokens: number } }).thinking = {
      type: 'enabled',
      budget_tokens: config.thinkingBudget,
    };
  }

  return params;
}
