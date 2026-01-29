/**
 * SUPERPROMPT-DRIVEN PHASE EXECUTOR
 *
 * This module executes workflow phases using the admin-editable superprompt.
 * The superprompt in the database contains all instructions for all 14 phases.
 *
 * Key Features:
 * - Reads superprompt from admin-editable database
 * - Extracts phase-specific instructions
 * - Uses correct model routing (Sonnet vs Opus)
 * - Applies extended thinking where required
 * - Merges order data with superprompt placeholders
 *
 * Model Routing:
 * - Opus 4.5: Phase VII (always), IV/VI/VIII (Tier B/C)
 * - Sonnet 4.5: All Tier A, and I/II/III/V/V.1/VIII.5/IX/IX.1/X for B/C
 *
 * Extended Thinking — MAXIMIZED for production legal workloads:
 * - Complex phases (IV, VI, VII, VIII): 128K tokens
 * - Supporting phases (all others): 64K tokens
 * - ALL phases now use extended thinking
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicAPIKey } from '@/lib/api-keys';
import { logger } from '@/lib/logger';
import {
  getThinkingBudget as getThinkingBudgetFromConfig,
  shouldUseExtendedThinking as shouldUseExtendedThinkingFromConfig,
} from '@/lib/config/token-budgets';
import type {
  WorkflowPhaseCode,
  MotionTier,
  PhaseStatus,
} from '@/types/workflow';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Model identifiers
const SONNET_MODEL = 'claude-sonnet-4-5-20250929';
const OPUS_MODEL = 'claude-opus-4-5-20251101';

// Extended thinking token budgets — NOW IMPORTED FROM CENTRALIZED CONFIG
// Complex phases (IV, VI, VII, VIII): 128K tokens
// Supporting phases (all others): 64K tokens

// Phases that use Opus
const OPUS_PHASES: WorkflowPhaseCode[] = ['IV', 'VI', 'VII', 'VIII'];

// ALL phases now get extended thinking for production legal workloads
const ALL_PHASES: WorkflowPhaseCode[] = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X'
];

// ============================================================================
// TYPES
// ============================================================================

export interface OrderContext {
  orderId: string;
  orderNumber: string;
  caseNumber: string;
  caseCaption: string;
  court: string;
  jurisdiction: string;
  courtDivision?: string;
  motionType: string;
  motionTier: MotionTier;
  filingDeadline?: string;
  filingPosture: 'FILING' | 'RESPONDING';

  // Parties
  plaintiffNames: string;
  defendantNames: string;
  allParties: string;

  // Client content
  statementOfFacts: string;
  proceduralHistory: string;
  clientInstructions: string;

  // Documents
  documentContent: string;
  documentSummaries: string;
  keyFacts: string;
  legalIssues: string;

  // Attorney info
  attorneyName: string;
  barNumber: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
}

export interface PhaseExecutionInput {
  workflowId: string;
  orderId: string;
  phaseCode: WorkflowPhaseCode;
  tier: MotionTier;
  orderContext: OrderContext;
  previousPhaseOutputs: Record<WorkflowPhaseCode, unknown>;
  revisionLoop?: number;
}

export interface PhaseExecutionOutput {
  success: boolean;
  phaseCode: WorkflowPhaseCode;
  status: PhaseStatus;
  output: unknown;
  nextPhase?: WorkflowPhaseCode;
  checkpoint?: 'HOLD' | 'CP1' | 'CP2' | 'CP3';
  requiresReview?: boolean;
  tokensUsed?: { input: number; output: number };
  modelUsed?: string;
  thinkingTokens?: number;
  durationMs?: number;
  error?: string;
}

// ============================================================================
// SUPERPROMPT RETRIEVAL
// ============================================================================

let cachedSuperprompt: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Get the superprompt from the admin-editable database
 */
async function getSuperprompt(): Promise<string | null> {
  // Check cache
  if (cachedSuperprompt && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSuperprompt;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error('Supabase not configured');
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the default superprompt template
    const { data, error } = await supabase
      .from('superprompt_templates')
      .select('template, system_prompt')
      .eq('is_default', true)
      .single();

    if (error || !data) {
      logger.error('Failed to fetch superprompt', { error });
      return null;
    }

    cachedSuperprompt = data.template;
    cacheTimestamp = Date.now();

    return data.template;
  } catch (error) {
    logger.error('Error fetching superprompt', { error });
    return null;
  }
}

/**
 * Get system prompt from superprompt template
 */
async function getSystemPrompt(): Promise<string> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return 'You are a legal motion generation system. Follow the superprompt instructions precisely.';
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data } = await supabase
      .from('superprompt_templates')
      .select('system_prompt')
      .eq('is_default', true)
      .single();

    return data?.system_prompt || 'You are a legal motion generation system. Follow the superprompt instructions precisely.';
  } catch {
    return 'You are a legal motion generation system. Follow the superprompt instructions precisely.';
  }
}

// ============================================================================
// MODEL ROUTING
// ============================================================================

/**
 * Determine which model to use for a phase
 */
function getModelForPhase(phaseCode: WorkflowPhaseCode, tier: MotionTier): string {
  // Tier A always uses Sonnet
  if (tier === 'A') {
    // Exception: Phase VII always uses Opus
    if (phaseCode === 'VII') {
      return OPUS_MODEL;
    }
    return SONNET_MODEL;
  }

  // Tier B/C: Use Opus for specific phases
  if (OPUS_PHASES.includes(phaseCode)) {
    return OPUS_MODEL;
  }

  return SONNET_MODEL;
}

/**
 * Determine if extended thinking should be used
 * MAXIMIZED: All phases now use extended thinking for production legal workloads
 */
function shouldUseExtendedThinking(_phaseCode: WorkflowPhaseCode, _tier: MotionTier): boolean {
  // All phases benefit from extended thinking in legal work
  return shouldUseExtendedThinkingFromConfig(_phaseCode);
}

/**
 * Get extended thinking token budget
 * MAXIMIZED: Complex phases get 128K, supporting phases get 64K
 */
function getThinkingBudget(phaseCode: WorkflowPhaseCode): number {
  return getThinkingBudgetFromConfig(phaseCode);
}

// ============================================================================
// PLACEHOLDER REPLACEMENT
// ============================================================================

/**
 * Replace placeholders in superprompt with order context
 */
function replacePlaceholders(template: string, context: OrderContext): string {
  const replacements: Record<string, string> = {
    '{{CASE_NUMBER}}': context.caseNumber || '',
    '{{CASE_CAPTION}}': context.caseCaption || '',
    '{{COURT}}': context.court || '',
    '{{JURISDICTION}}': context.jurisdiction || '',
    '{{COURT_DIVISION}}': context.courtDivision || '',
    '{{MOTION_TYPE}}': context.motionType || '',
    '{{MOTION_TIER}}': context.motionTier || '',
    '{{FILING_DEADLINE}}': context.filingDeadline || 'Not specified',
    '{{FILING_POSTURE}}': context.filingPosture || '',
    '{{ALL_PARTIES}}': context.allParties || '',
    '{{PLAINTIFF_NAMES}}': context.plaintiffNames || '',
    '{{DEFENDANT_NAMES}}': context.defendantNames || '',
    '{{STATEMENT_OF_FACTS}}': context.statementOfFacts || '[No statement of facts provided]',
    '{{PROCEDURAL_HISTORY}}': context.proceduralHistory || '[No procedural history provided]',
    '{{CLIENT_INSTRUCTIONS}}': context.clientInstructions || '[No special instructions]',
    '{{DOCUMENT_CONTENT}}': context.documentContent || '[No documents uploaded]',
    '{{DOCUMENT_SUMMARIES}}': context.documentSummaries || '[No document summaries]',
    '{{KEY_FACTS}}': context.keyFacts || '[No key facts extracted]',
    '{{LEGAL_ISSUES}}': context.legalIssues || '[No legal issues identified]',
    '{{ORDER_ID}}': context.orderId || '',
    '{{ORDER_NUMBER}}': context.orderNumber || '',
    '{{ATTORNEY_NAME}}': context.attorneyName || '[Attorney Name]',
    '{{BAR_NUMBER}}': context.barNumber || '[Bar Number]',
    '{{FIRM_NAME}}': context.firmName || '[Law Firm]',
    '{{FIRM_ADDRESS}}': context.firmAddress || '[Address]',
    '{{FIRM_PHONE}}': context.firmPhone || '[Phone]',
    '{{TODAY_DATE}}': new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(value);
  }

  return result;
}

// ============================================================================
// PHASE-SPECIFIC PROMPT CONSTRUCTION
// ============================================================================

/**
 * Build the prompt for a specific phase
 */
function buildPhasePrompt(
  superprompt: string,
  phaseCode: WorkflowPhaseCode,
  context: OrderContext,
  previousOutputs: Record<WorkflowPhaseCode, unknown>,
  revisionLoop?: number
): string {
  // Replace placeholders with order context
  const contextualSuperprompt = replacePlaceholders(superprompt, context);

  // Build phase-specific instruction
  const phaseInstruction = `
================================================================================
CURRENT EXECUTION: PHASE ${phaseCode}
================================================================================

You are executing Phase ${phaseCode} of the Motion Granted workflow.
Refer to the superprompt above for detailed instructions on what this phase must accomplish.

TIER: ${context.motionTier} (${context.motionTier === 'A' ? 'Simple/Procedural' : context.motionTier === 'B' ? 'Intermediate' : 'Complex/Dispositive'})
PATH: ${context.filingPosture === 'FILING' ? 'A (Initiating)' : 'B (Responding)'}
${revisionLoop ? `REVISION LOOP: ${revisionLoop} of 3` : ''}

PREVIOUS PHASE OUTPUTS:
${JSON.stringify(previousOutputs, null, 2)}

INSTRUCTIONS:
1. Follow the superprompt instructions for Phase ${phaseCode} exactly
2. Use only the facts and documents provided - do not fabricate
3. Output your results in JSON format with the following structure:
   {
     "phaseComplete": boolean,
     "output": { /* phase-specific output */ },
     "checkpointTriggered": null | "HOLD" | "CP1" | "CP2" | "CP3",
     "nextPhaseRecommended": "next phase code or null",
     "notes": "any important observations"
   }

Execute Phase ${phaseCode} now.
`;

  return contextualSuperprompt + '\n\n' + phaseInstruction;
}

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

async function getAnthropicClient(): Promise<Anthropic | null> {
  try {
    const apiKey = await getAnthropicAPIKey();
    if (apiKey && !apiKey.includes('xxxxx')) {
      return new Anthropic({ apiKey });
    }
  } catch (error) {
    logger.error('Error getting Anthropic API key', { error });
  }

  // Fallback to env var
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && !envKey.includes('xxxxx')) {
    return new Anthropic({ apiKey: envKey });
  }

  return null;
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

/**
 * Execute a workflow phase using the admin superprompt
 */
export async function executePhaseWithSuperprompt(
  input: PhaseExecutionInput
): Promise<PhaseExecutionOutput> {
  const log = logger.child({
    phase: input.phaseCode,
    workflowId: input.workflowId,
    tier: input.tier,
  });

  const startTime = Date.now();

  try {
    // 1. Get the superprompt from database
    const superprompt = await getSuperprompt();
    if (!superprompt) {
      return {
        success: false,
        phaseCode: input.phaseCode,
        status: 'failed',
        output: null,
        error: 'Superprompt not found. Please configure a default superprompt in Admin > Superprompt.',
      };
    }

    // 2. Get Anthropic client
    const client = await getAnthropicClient();
    if (!client) {
      return {
        success: false,
        phaseCode: input.phaseCode,
        status: 'failed',
        output: null,
        error: 'Claude API not configured. Add your Anthropic API key in Admin Settings.',
      };
    }

    // 3. Determine model and thinking config
    const model = getModelForPhase(input.phaseCode, input.tier);
    const useExtendedThinking = shouldUseExtendedThinking(input.phaseCode, input.tier);
    const thinkingBudget = useExtendedThinking ? getThinkingBudget(input.phaseCode) : 0;

    log.info('Starting phase execution', {
      model,
      useExtendedThinking,
      thinkingBudget,
    });

    // 4. Build the prompt
    const systemPrompt = await getSystemPrompt();
    const userPrompt = buildPhasePrompt(
      superprompt,
      input.phaseCode,
      input.orderContext,
      input.previousPhaseOutputs,
      input.revisionLoop
    );

    // 5. Call Claude
    let response: Anthropic.Message;

    if (useExtendedThinking && model === OPUS_MODEL) {
      // Use extended thinking with Opus
      response = await client.messages.create({
        model,
        max_tokens: 80000, // Increased from 16000 - Opus needs full capacity for legal reasoning
        temperature: 1, // Required for extended thinking
        thinking: {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        },
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } else {
      // Standard call without extended thinking
      response = await client.messages.create({
        model,
        max_tokens: 64000, // Increased from 16000 - Minimum for comprehensive legal drafting
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
    }

    // 6. Extract response
    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    // Count thinking tokens if extended thinking was used
    let thinkingTokensUsed = 0;
    if (useExtendedThinking) {
      const thinkingContent = response.content.find(c => c.type === 'thinking');
      if (thinkingContent && 'thinking' in thinkingContent) {
        thinkingTokensUsed = (thinkingContent as { thinking: string }).thinking?.length / 4 || 0;
      }
    }

    // 7. Parse JSON output
    let parsedOutput: {
      phaseComplete?: boolean;
      output?: unknown;
      checkpointTriggered?: 'HOLD' | 'CP1' | 'CP2' | 'CP3' | null;
      nextPhaseRecommended?: string | null;
      notes?: string;
    };

    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      parsedOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { output: outputText };
    } catch {
      parsedOutput = { output: outputText };
    }

    // 8. Determine status and next phase
    const status: PhaseStatus = parsedOutput.phaseComplete === false ? 'blocked' : 'completed';
    const checkpoint = parsedOutput.checkpointTriggered || undefined;
    const nextPhase = determineNextPhase(input.phaseCode, parsedOutput, checkpoint);

    log.info('Phase execution complete', {
      status,
      checkpoint,
      nextPhase,
      tokensUsed: response.usage,
    });

    return {
      success: true,
      phaseCode: input.phaseCode,
      status,
      output: parsedOutput.output,
      nextPhase,
      checkpoint,
      requiresReview: !!checkpoint,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      modelUsed: model,
      thinkingTokens: thinkingTokensUsed,
      durationMs: Date.now() - startTime,
    };

  } catch (error) {
    log.error('Phase execution failed', { error });
    return {
      success: false,
      phaseCode: input.phaseCode,
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Determine the next phase based on current phase and output
 */
function determineNextPhase(
  currentPhase: WorkflowPhaseCode,
  output: { nextPhaseRecommended?: string | null },
  checkpoint?: 'HOLD' | 'CP1' | 'CP2' | 'CP3'
): WorkflowPhaseCode | undefined {
  // Blocking checkpoints stop progression
  if (checkpoint === 'HOLD' || checkpoint === 'CP3') {
    return undefined;
  }

  // Use recommended next phase if provided
  if (output.nextPhaseRecommended) {
    return output.nextPhaseRecommended as WorkflowPhaseCode;
  }

  // Default phase progression
  const phaseOrder: WorkflowPhaseCode[] = [
    'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X'
  ];

  const currentIndex = phaseOrder.indexOf(currentPhase);
  if (currentIndex >= 0 && currentIndex < phaseOrder.length - 1) {
    return phaseOrder[currentIndex + 1];
  }

  return undefined;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export {
  getSuperprompt,
  getSystemPrompt,
  getModelForPhase,
  shouldUseExtendedThinking,
  getThinkingBudget,
  replacePlaceholders,
};
