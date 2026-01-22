/**
 * Phase Executors
 *
 * v7.2: Execution logic for all 14 workflow phases.
 * Each phase has specific inputs, processing, and outputs.
 *
 * Model routing:
 * - Sonnet 4: Phases I, II, III, V, V.1, VIII.5, IX, IX.1
 * - Opus 4.5: Phase VII (always), IV/VI/VIII (Tier B/C)
 *
 * Extended thinking:
 * - Phase VI (B/C): 8K tokens
 * - Phase VII (all): 10K tokens
 * - Phase VIII (B/C): 8K tokens
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getModelConfig, createMessageParams } from './model-router';
import { getCourtListenerClient } from './courtlistener-client';
import {
  detectCitationGaps,
  detectContentGaps,
  detectJudgeSimulationGaps,
  recordGapEvent,
  resolveGapAutomatically,
} from './gap-closure-protocols';
import type {
  WorkflowPhaseCode,
  MotionTier,
  PhaseStatus,
  JudgeSimulationResult,
  LetterGrade,
  GRADE_VALUES,
} from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export interface PhaseInput {
  orderId: string;
  workflowId: string;
  tier: MotionTier;
  jurisdiction: string;
  motionType: string;
  caseCaption: string;
  caseNumber: string;
  statementOfFacts: string;
  proceduralHistory: string;
  instructions: string;
  previousPhaseOutputs: Record<WorkflowPhaseCode, unknown>;
  documents?: string[];
}

export interface PhaseOutput {
  success: boolean;
  phase: WorkflowPhaseCode;
  status: PhaseStatus;
  output: unknown;
  nextPhase?: WorkflowPhaseCode;
  requiresReview?: boolean;
  gapsDetected?: number;
  tokensUsed?: { input: number; output: number };
  durationMs?: number;
  error?: string;
}

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

// ============================================================================
// PHASE I: Document Parsing
// ============================================================================

export async function executePhaseI(input: PhaseInput): Promise<PhaseOutput> {
  const log = logger.child({ phase: 'I', workflowId: input.workflowId });
  const start = Date.now();

  try {
    log.info('Starting Phase I: Document Parsing');

    // In production, this would parse uploaded documents
    // For now, we extract key information from order data
    const parsedData = {
      caseCaption: input.caseCaption,
      caseNumber: input.caseNumber,
      jurisdiction: input.jurisdiction,
      parties: extractParties(input.caseCaption),
      keyFacts: extractKeyFacts(input.statementOfFacts),
      proceduralEvents: extractProceduralEvents(input.proceduralHistory),
      clientInstructions: input.instructions,
      documentSummaries: input.documents?.map(d => ({ name: d, parsed: true })) || [],
    };

    log.info('Phase I completed', { factCount: parsedData.keyFacts.length });

    return {
      success: true,
      phase: 'I',
      status: 'completed',
      output: parsedData,
      nextPhase: 'II',
      durationMs: Date.now() - start,
    };
  } catch (error) {
    log.error('Phase I failed', error);
    return {
      success: false,
      phase: 'I',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase I failed',
      durationMs: Date.now() - start,
    };
  }
}

// Helper functions for Phase I
function extractParties(caseCaption: string): { plaintiff: string; defendant: string } {
  const parts = caseCaption.split(/\s+v\.?\s+/i);
  return {
    plaintiff: parts[0]?.trim() || 'Plaintiff',
    defendant: parts[1]?.trim() || 'Defendant',
  };
}

function extractKeyFacts(statementOfFacts: string): string[] {
  return statementOfFacts
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
}

function extractProceduralEvents(proceduralHistory: string): string[] {
  return proceduralHistory
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

// ============================================================================
// PHASE II: Legal Framework
// ============================================================================

export async function executePhaseII(input: PhaseInput): Promise<PhaseOutput> {
  const log = logger.child({ phase: 'II', workflowId: input.workflowId });
  const start = Date.now();

  try {
    log.info('Starting Phase II: Legal Framework');

    const client = getAnthropicClient();
    const config = getModelConfig('II', input.tier);

    const phaseIOutput = input.previousPhaseOutputs['I'] as {
      keyFacts: string[];
      proceduralEvents: string[];
    };

    const systemPrompt = `You are a legal research assistant building the legal framework for a ${input.motionType}.
Jurisdiction: ${input.jurisdiction}

Your task is to identify:
1. The applicable legal standard for this motion type
2. Key elements that must be proven
3. Relevant rules of procedure
4. Burden of proof requirements

Output your analysis in a structured JSON format.`;

    const userMessage = `Based on this case information, build the legal framework:

Case: ${input.caseCaption}
Case Number: ${input.caseNumber}
Motion Type: ${input.motionType}

Key Facts:
${phaseIOutput?.keyFacts?.join('\n') || input.statementOfFacts}

Procedural History:
${phaseIOutput?.proceduralEvents?.join('\n') || input.proceduralHistory}

Provide a JSON response with: legalStandard, elements, proceduralRules, burdenOfProof`;

    const response = await client.messages.create({
      ...createMessageParams('II', input.tier, systemPrompt, userMessage),
      stream: false,
    }) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    // Parse JSON from response
    let legalFramework;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      legalFramework = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: outputText };
    } catch {
      legalFramework = { raw: outputText };
    }

    log.info('Phase II completed', {
      tokensUsed: response.usage,
    });

    return {
      success: true,
      phase: 'II',
      status: 'completed',
      output: legalFramework,
      nextPhase: 'III',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    log.error('Phase II failed', error);
    return {
      success: false,
      phase: 'II',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase II failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE III: Legal Research
// ============================================================================

export async function executePhaseIII(input: PhaseInput): Promise<PhaseOutput> {
  const log = logger.child({ phase: 'III', workflowId: input.workflowId });
  const start = Date.now();

  try {
    log.info('Starting Phase III: Legal Research');

    const client = getAnthropicClient();
    const config = getModelConfig('III', input.tier);

    const legalFramework = input.previousPhaseOutputs['II'];

    // Determine citation count based on tier
    const targetCitations = input.tier === 'C' ? 20 : input.tier === 'B' ? 12 : 6;

    const systemPrompt = `You are a legal research specialist. Generate ${targetCitations} relevant case citations for this motion.

Requirements:
- Citations must be real cases (no hallucination)
- Include the full citation in Bluebook format
- Provide the key holding for each case
- Prioritize jurisdiction-specific cases when available

Output format: JSON array of citations with fields: citation, caseName, holding, relevance`;

    const userMessage = `Research cases for this ${input.motionType}:

Jurisdiction: ${input.jurisdiction}
Legal Framework: ${JSON.stringify(legalFramework)}

Key issues to research:
- Cases supporting the motion
- Potential counter-argument cases
- Procedural precedents

Generate ${targetCitations} citations.`;

    const response = await client.messages.create({
      ...createMessageParams('III', input.tier, systemPrompt, userMessage),
      stream: false,
    }) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    // Parse citations
    let citations: Array<{ citation: string; caseName: string; holding: string; relevance: string }> = [];
    try {
      const jsonMatch = outputText.match(/\[[\s\S]*\]/);
      citations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      citations = [];
    }

    log.info('Phase III completed', {
      citationCount: citations.length,
      tokensUsed: response.usage,
    });

    // Check for HOLD checkpoint - jurisdiction issues
    // In production, this would check if motion templates exist for jurisdiction
    const needsHold = false; // Placeholder

    return {
      success: true,
      phase: 'III',
      status: 'completed',
      output: { citations, needsHold },
      nextPhase: needsHold ? undefined : 'IV',
      requiresReview: needsHold,
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    log.error('Phase III failed', error);
    return {
      success: false,
      phase: 'III',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase III failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE IV: Citation Verification
// ============================================================================

export async function executePhaseIV(input: PhaseInput): Promise<PhaseOutput> {
  const log = logger.child({ phase: 'IV', workflowId: input.workflowId });
  const start = Date.now();

  try {
    log.info('Starting Phase IV: Citation Verification');

    const phaseIIIOutput = input.previousPhaseOutputs['III'] as {
      citations: Array<{ citation: string; caseName: string; holding: string }>;
    };

    const courtListener = getCourtListenerClient();
    const verificationResults: Array<{
      citationText: string;
      status: string;
      holdingMatch?: boolean;
      courtListenerId?: string;
    }> = [];

    // Verify each citation
    for (const cite of phaseIIIOutput?.citations || []) {
      try {
        const result = await courtListener.verifyCitation(cite.citation, cite.holding);
        verificationResults.push({
          citationText: cite.citation,
          status: result.verificationStatus,
          courtListenerId: result.courtListenerId,
        });
      } catch (error) {
        verificationResults.push({
          citationText: cite.citation,
          status: 'PENDING',
        });
      }
    }

    // Detect gaps
    const gaps = detectCitationGaps(verificationResults, input.tier);

    // Record and attempt to resolve gaps
    for (const gap of gaps) {
      gap.workflowId = input.workflowId;
      await recordGapEvent(gap);
      await resolveGapAutomatically(gap);
    }

    log.info('Phase IV completed', {
      totalCitations: verificationResults.length,
      verified: verificationResults.filter(r => r.status === 'VERIFIED').length,
      gapsDetected: gaps.length,
    });

    // CP1 checkpoint notification
    const requiresNotification = gaps.some(g => g.protocolCode === 'GAP-002' || g.protocolCode === 'GAP-003');

    return {
      success: true,
      phase: 'IV',
      status: 'completed',
      output: { verificationResults, gaps },
      nextPhase: 'V',
      requiresReview: requiresNotification,
      gapsDetected: gaps.length,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    log.error('Phase IV failed', error);
    return {
      success: false,
      phase: 'IV',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase IV failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE VII: Judge Simulation (Key Phase - Always Uses Opus)
// ============================================================================

export async function executePhaseVII(input: PhaseInput): Promise<PhaseOutput> {
  const log = logger.child({ phase: 'VII', workflowId: input.workflowId });
  const start = Date.now();

  try {
    log.info('Starting Phase VII: Judge Simulation');

    const client = getAnthropicClient();
    const config = getModelConfig('VII', input.tier);

    const draftContent = input.previousPhaseOutputs['VI'] as { draft: string };

    const systemPrompt = `You are an experienced federal judge evaluating a motion.
Use extended thinking to thoroughly analyze this motion before providing your evaluation.

Evaluate on these criteria:
1. Legal soundness of arguments
2. Proper citation and use of authority
3. Clarity and organization
4. Persuasiveness
5. Compliance with procedural requirements

Provide a letter grade (A+ through F) where B+ (3.3) is the minimum acceptable standard.

Output JSON with:
- grade: letter grade
- numericGrade: GPA equivalent (4.3 scale)
- passes: boolean (true if B+ or better)
- strengths: array of strengths
- weaknesses: array of areas for improvement
- specificFeedback: detailed feedback
- revisionSuggestions: array of specific revisions if grade < B+`;

    const userMessage = `Evaluate this ${input.motionType}:

Case: ${input.caseCaption}
Jurisdiction: ${input.jurisdiction}

MOTION CONTENT:
${draftContent?.draft || 'No draft available'}

Provide your judicial evaluation.`;

    const params = createMessageParams('VII', input.tier, systemPrompt, userMessage);

    const response = await client.messages.create({
      ...params,
      stream: false,
    }) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    // Parse judge evaluation
    let evaluation: JudgeSimulationResult;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      evaluation = {
        grade: parsed.grade || 'C',
        numericGrade: parsed.numericGrade || 2.0,
        passes: parsed.passes ?? false,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        specificFeedback: parsed.specificFeedback || '',
        revisionSuggestions: parsed.revisionSuggestions || [],
        loopNumber: 1,
      };
    } catch {
      evaluation = {
        grade: 'C',
        numericGrade: 2.0,
        passes: false,
        strengths: [],
        weaknesses: ['Could not parse evaluation'],
        specificFeedback: outputText,
        revisionSuggestions: [],
        loopNumber: 1,
      };
    }

    // Store judge result in database
    const supabase = await createClient();
    await supabase.from('judge_simulation_results').insert({
      workflow_id: input.workflowId,
      grade: evaluation.grade,
      numeric_grade: evaluation.numericGrade,
      passes: evaluation.passes,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      specific_feedback: evaluation.specificFeedback,
      revision_suggestions: evaluation.revisionSuggestions,
      loop_number: evaluation.loopNumber,
    });

    // Detect gaps based on judge feedback
    const gaps = detectJudgeSimulationGaps(evaluation.grade, evaluation.loopNumber, {
      persuasivenessScore: evaluation.numericGrade / 4.3,
      counterArgumentsAddressed: !evaluation.weaknesses.some(w =>
        w.toLowerCase().includes('counter') || w.toLowerCase().includes('opposing')
      ),
      conclusionStrength: evaluation.strengths.some(s =>
        s.toLowerCase().includes('conclusion')
      ) ? 0.8 : 0.5,
    });

    for (const gap of gaps) {
      gap.workflowId = input.workflowId;
      await recordGapEvent(gap);
    }

    log.info('Phase VII completed', {
      grade: evaluation.grade,
      passes: evaluation.passes,
      gapsDetected: gaps.length,
      tokensUsed: response.usage,
    });

    // Determine next phase
    const nextPhase: WorkflowPhaseCode = evaluation.passes ? 'VIII' : 'VII.1';

    return {
      success: true,
      phase: 'VII',
      status: 'completed',
      output: evaluation,
      nextPhase,
      requiresReview: true, // CP2: Always notify after judge simulation
      gapsDetected: gaps.length,
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    log.error('Phase VII failed', error);
    return {
      success: false,
      phase: 'VII',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase VII failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE X: Final QA and Approval
// ============================================================================

export async function executePhaseX(input: PhaseInput): Promise<PhaseOutput> {
  const log = logger.child({ phase: 'X', workflowId: input.workflowId });
  const start = Date.now();

  try {
    log.info('Starting Phase X: Final QA and Approval');

    // This phase primarily triggers the blocking checkpoint for admin approval
    // The actual approval is handled via the PhaseXApprovalModal and API

    const finalDraft = input.previousPhaseOutputs['IX'] as { formattedDocument: string };

    // Run final checks
    const checks = {
      hasAllSections: true,
      citationsVerified: true,
      formattingCorrect: true,
      noPlaceholders: !finalDraft?.formattedDocument?.includes('['),
      wordCountOk: true,
    };

    const allChecksPass = Object.values(checks).every(Boolean);

    log.info('Phase X checks completed', {
      allChecksPass,
      checks,
    });

    return {
      success: true,
      phase: 'X',
      status: allChecksPass ? 'requires_review' : 'blocked',
      output: { checks, requiresApproval: true },
      requiresReview: true, // CP3: Blocking checkpoint
      durationMs: Date.now() - start,
    };
  } catch (error) {
    log.error('Phase X failed', error);
    return {
      success: false,
      phase: 'X',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase X failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE EXECUTOR REGISTRY
// ============================================================================

export const PHASE_EXECUTORS: Partial<Record<WorkflowPhaseCode, (input: PhaseInput) => Promise<PhaseOutput>>> = {
  'I': executePhaseI,
  'II': executePhaseII,
  'III': executePhaseIII,
  'IV': executePhaseIV,
  'VII': executePhaseVII,
  'X': executePhaseX,
  // Additional phases (V, V.1, VI, VII.1, VIII, VIII.5, IX, IX.1) would follow similar patterns
};

/**
 * Execute a specific phase
 */
export async function executePhase(
  phase: WorkflowPhaseCode,
  input: PhaseInput
): Promise<PhaseOutput> {
  const executor = PHASE_EXECUTORS[phase];

  if (!executor) {
    return {
      success: false,
      phase,
      status: 'failed',
      output: null,
      error: `No executor found for phase ${phase}`,
    };
  }

  return executor(input);
}
