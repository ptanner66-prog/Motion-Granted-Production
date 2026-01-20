/**
 * Workflow Engine
 *
 * Core state machine for managing workflow phase transitions.
 * Handles document production workflow from intake to final assembly.
 *
 * v6.3 UPDATES:
 * - 12 phases (was 9)
 * - B+ (87%) minimum quality threshold (was 70%)
 * - 3 customer checkpoints (CP1, CP2, CP3)
 * - Max 3 revision loops before escalation
 */

import { createClient } from '@/lib/supabase/server';
import { askClaude, isClaudeConfigured } from '@/lib/automation/claude';
import { parseDocument, parseOrderDocuments } from './document-parser';
import {
  extractCitations,
  storeCitations,
  verifyWorkflowCitations,
  verifyWorkflowCitationsBatched,
  checkCitationRequirements,
  CITATION_HARD_STOP_MINIMUM,
  CITATION_BATCH_SIZE,
} from './citation-verifier';
import { triggerCheckpoint } from './checkpoint-service';

// ============================================================================
// v6.3 QUALITY CONSTANTS — DO NOT MODIFY WITHOUT APPROVAL
// ============================================================================

/**
 * Minimum passing grade: B+ = 87%
 * This is a non-negotiable quality gate. Motions below this threshold
 * MUST be revised before delivery.
 */
export const MINIMUM_PASSING_GRADE = 0.87;

/**
 * Maximum revision loops before escalation
 * After 3 failed attempts to reach B+, the workflow escalates to admin review.
 */
export const MAX_REVISION_LOOPS = 3;

/**
 * Total phases in v6.3 workflow
 */
export const TOTAL_PHASES = 12;

/**
 * Convert numeric score (0.00-1.00) to letter grade
 * Returns both the letter and whether it passes the minimum threshold
 */
export function scoreToGrade(score: number): { letter: string; passed: boolean } {
  const percent = score * 100;

  if (percent >= 97) return { letter: 'A+', passed: true };
  if (percent >= 93) return { letter: 'A', passed: true };
  if (percent >= 90) return { letter: 'A-', passed: true };
  if (percent >= 87) return { letter: 'B+', passed: true };  // ← MINIMUM PASSING
  if (percent >= 83) return { letter: 'B', passed: false };
  if (percent >= 80) return { letter: 'B-', passed: false };
  if (percent >= 77) return { letter: 'C+', passed: false };
  if (percent >= 73) return { letter: 'C', passed: false };
  if (percent >= 70) return { letter: 'C-', passed: false };
  if (percent >= 60) return { letter: 'D', passed: false };
  return { letter: 'F', passed: false };
}

/**
 * Check if a score meets the quality threshold
 * Use this instead of hardcoded comparisons
 */
export function meetsQualityThreshold(score: number): boolean {
  return score >= MINIMUM_PASSING_GRADE;
}
import { generateMotionFromOrder, type MotionType as SuperpromptMotionType } from './superprompt';
import type {
  WorkflowPath,
  PhaseStatus,
  OrderWorkflow,
  WorkflowPhaseDefinition,
  WorkflowPhaseExecution,
  WorkflowProgress,
  StartWorkflowRequest,
  StartWorkflowResponse,
  PhaseResult,
  MotionType,
} from '@/types/workflow';
import type { OperationResult } from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

interface PhaseExecutionContext {
  workflow: OrderWorkflow;
  phaseDefinition: WorkflowPhaseDefinition;
  previousOutputs: Record<string, unknown>;
  motionType: MotionType;
}

// ============================================================================
// WORKFLOW CREATION
// ============================================================================

/**
 * Start a new workflow for an order
 */
export async function startWorkflow(
  request: StartWorkflowRequest
): Promise<OperationResult<StartWorkflowResponse>> {
  const supabase = await createClient();

  try {
    // Check if workflow already exists
    const { data: existing } = await supabase
      .from('order_workflows')
      .select('id')
      .eq('order_id', request.orderId)
      .single();

    if (existing) {
      return {
        success: false,
        error: 'Workflow already exists for this order',
        data: { success: false, workflowId: existing.id },
      };
    }

    // Create workflow
    const { data: workflow, error: createError } = await supabase
      .from('order_workflows')
      .insert({
        order_id: request.orderId,
        motion_type_id: request.motionTypeId,
        workflow_path: request.workflowPath,
        current_phase: 1,
        status: 'pending',
        started_at: new Date().toISOString(),
        metadata: request.metadata || {},
      })
      .select()
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    // Get phase definitions for this path
    const { data: phases, error: phasesError } = await supabase
      .from('workflow_phase_definitions')
      .select('*')
      .eq('workflow_path', request.workflowPath)
      .order('phase_number', { ascending: true });

    if (phasesError) {
      return { success: false, error: phasesError.message };
    }

    // Create phase execution records
    interface PhaseRow { id: string; phase_number: number }
    const phaseExecutions = ((phases || []) as PhaseRow[]).map((phase: PhaseRow) => ({
      order_workflow_id: workflow.id,
      phase_definition_id: phase.id,
      phase_number: phase.phase_number,
      status: phase.phase_number === 1 ? 'pending' : 'pending',
    }));

    const { error: execError } = await supabase
      .from('workflow_phase_executions')
      .insert(phaseExecutions);

    if (execError) {
      return { success: false, error: execError.message };
    }

    return {
      success: true,
      data: { success: true, workflowId: workflow.id },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start workflow',
    };
  }
}

// ============================================================================
// PHASE EXECUTION
// ============================================================================

/**
 * Execute the current phase of a workflow
 */
export async function executeCurrentPhase(
  workflowId: string
): Promise<OperationResult<PhaseResult>> {
  const supabase = await createClient();

  try {
    // Get workflow with motion type
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select(`
        *,
        motion_types(*),
        orders(*)
      `)
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return { success: false, error: wfError?.message || 'Workflow not found' };
    }

    // Get current phase definition
    const { data: phaseDef, error: phaseDefError } = await supabase
      .from('workflow_phase_definitions')
      .select('*')
      .eq('workflow_path', workflow.workflow_path)
      .eq('phase_number', workflow.current_phase)
      .single();

    if (phaseDefError || !phaseDef) {
      return { success: false, error: 'Phase definition not found' };
    }

    // Get or create phase execution
    let { data: phaseExec, error: execError } = await supabase
      .from('workflow_phase_executions')
      .select('*')
      .eq('order_workflow_id', workflowId)
      .eq('phase_number', workflow.current_phase)
      .single();

    if (execError) {
      return { success: false, error: execError.message };
    }

    // Update phase to in_progress
    await supabase
      .from('workflow_phase_executions')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', phaseExec.id);

    // Get previous phase outputs
    const previousOutputs = await getPreviousPhaseOutputs(workflowId, workflow.current_phase);

    // Build execution context
    const context: PhaseExecutionContext = {
      workflow: workflow as OrderWorkflow,
      phaseDefinition: phaseDef as WorkflowPhaseDefinition,
      previousOutputs,
      motionType: workflow.motion_types as MotionType,
    };

    // Execute based on phase type
    const result = await executePhaseByType(context, phaseExec);

    // Update phase execution with results
    const finalStatus: PhaseStatus = result.success
      ? (result.requiresReview ? 'requires_review' : 'completed')
      : 'failed';

    await supabase
      .from('workflow_phase_executions')
      .update({
        status: finalStatus,
        completed_at: result.success ? new Date().toISOString() : null,
        outputs: result.outputs,
        quality_score: result.qualityScore,
        error_message: result.error || null,
        requires_review: result.requiresReview,
      })
      .eq('id', phaseExec.id);

    // Update workflow status
    if (result.success && !result.requiresReview) {
      await supabase
        .from('order_workflows')
        .update({
          current_phase: workflow.current_phase + 1,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', workflowId);
    } else if (!result.success) {
      await supabase
        .from('order_workflows')
        .update({
          status: 'blocked',
          last_error: result.error,
          error_count: (workflow.error_count || 0) + 1,
        })
        .eq('id', workflowId);
    }

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Phase execution failed',
    };
  }
}

/**
 * Execute a specific phase type
 *
 * v6.3: Updated to support phase_code in addition to ai_task_type
 * Phase codes allow for more granular control over phase execution
 */
async function executePhaseByType(
  context: PhaseExecutionContext,
  phaseExec: Record<string, unknown>
): Promise<PhaseResult> {
  const { phaseDefinition } = context;

  // v6.3: Support both phase_code and ai_task_type for backwards compatibility
  const phaseCode = (phaseDefinition as unknown as Record<string, unknown>).phase_code as string | undefined;
  const taskType = phaseDefinition.ai_task_type;

  // Try phase_code first (v6.3), then fall back to ai_task_type
  switch (phaseCode || taskType) {
    // Phase 1: Intake
    case 'INTAKE':
    case 'document_parsing':
      return await executeDocumentParsingPhase(context);

    // Phase 2: Legal Standards
    case 'LEGAL_STANDARDS':
    case 'legal_analysis':
      return await executeLegalAnalysisPhase(context);

    // Phase 3: Evidence Mapping (NEW in v6.3)
    case 'EVIDENCE_MAPPING':
    case 'evidence_analysis':
      return await executeEvidenceMappingPhase(context);

    // Phase 4: Authority Research
    case 'AUTHORITY_RESEARCH':
    case 'COUNTER_RESEARCH':
    case 'legal_research':
      return await executeLegalResearchPhase(context);

    // Phase 5: Draft Motion
    case 'DRAFT_MOTION':
    case 'DRAFT_OPPOSITION':
    case 'document_generation':
      return await executeDocumentGenerationPhase(context);

    // Phase 6: Citation Verification
    case 'CITATION_CHECK':
    case 'citation_verification':
      return await executeCitationVerificationPhase(context);

    // Phase 7: Opposition/Reply Anticipation (NEW in v6.3)
    case 'OPPOSITION_ANTICIPATION':
    case 'REPLY_ANTICIPATION':
    case 'argument_analysis':
      return await executeOppositionAnticipationPhase(context);

    // Phase 8: Judge Simulation
    case 'JUDGE_SIMULATION':
    case 'quality_review':
      return await executeQualityReviewPhase(context);

    // Phase 9: Revisions
    case 'REVISIONS':
    case 'document_revision':
      return await executeDocumentRevisionPhase(context);

    // Phase 10: Caption Validation (NEW in v6.3)
    case 'CAPTION_VALIDATION':
    case 'validation':
      return await executeCaptionValidationPhase(context);

    // Phase 11: Supporting Documents (Expanded in v6.3)
    case 'SUPPORTING_DOCS':
      return await executeSupportingDocumentsPhase(context);

    // Phase 12: Final Assembly
    case 'FINAL_ASSEMBLY':
    case 'document_assembly':
      return await executeDocumentAssemblyPhase(context);

    // Phase 2B: Motion Deconstruction (Path B)
    case 'MOTION_DECONSTRUCTION':
      return await executeMotionDeconstructionPhase(context);

    // Phase 3B: Issue Identification (Path B)
    case 'ISSUE_IDENTIFICATION':
      return await executeIssueIdentificationPhase(context);

    // Legacy: Argument Structuring
    case 'argument_structuring':
      return await executeArgumentStructuringPhase(context);

    default:
      return {
        success: false,
        phaseNumber: context.phaseDefinition.phase_number,
        status: 'failed',
        outputs: {},
        requiresReview: false,
        error: `Unknown phase type: ${phaseCode || taskType}`,
      };
  }
}

// ============================================================================
// PHASE HANDLERS
// ============================================================================

/**
 * Phase 1: Document Parsing
 */
async function executeDocumentParsingPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  const orderId = context.workflow.order_id;

  // Parse all order documents
  const parseResult = await parseOrderDocuments(orderId);

  if (!parseResult.success) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: parseResult.error,
    };
  }

  const supabase = await createClient();

  // Get all parsed documents
  const { data: parsedDocs } = await supabase
    .from('parsed_documents')
    .select('*')
    .eq('order_id', orderId);

  // Aggregate key information
  const allFacts: unknown[] = [];
  const allIssues: unknown[] = [];
  const allParties: unknown[] = [];

  for (const doc of parsedDocs || []) {
    allFacts.push(...(doc.key_facts || []));
    allIssues.push(...(doc.legal_issues || []));
    allParties.push(...(doc.parties || []));
  }

  return {
    success: true,
    phaseNumber: context.phaseDefinition.phase_number,
    status: 'completed',
    outputs: {
      parsed_documents: parsedDocs?.length || 0,
      key_facts: allFacts,
      legal_issues: allIssues,
      parties: allParties,
      document_summary: parsedDocs?.map((d: { document_type: string | null; summary: string | null }) => ({
        type: d.document_type,
        summary: d.summary,
      })),
    },
    qualityScore: parseResult.data
      ? (parseResult.data.parsed / (parseResult.data.parsed + parseResult.data.failed))
      : 0,
    requiresReview: false,
  };
}

/**
 * Phase 2: Legal Analysis
 */
async function executeLegalAnalysisPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured for legal analysis',
    };
  }

  const { previousOutputs, motionType } = context;

  const prompt = `You are a legal analyst. Analyze the following case information and provide a structured legal analysis.

Motion Type: ${motionType.name} (${motionType.code})
Motion Description: ${motionType.description}

Key Facts:
${JSON.stringify(previousOutputs.key_facts || [], null, 2)}

Identified Legal Issues:
${JSON.stringify(previousOutputs.legal_issues || [], null, 2)}

Parties:
${JSON.stringify(previousOutputs.parties || [], null, 2)}

Provide a comprehensive legal analysis in JSON format:
{
  "applicable_standards": [
    {
      "standard": "Legal standard name",
      "description": "Description of the standard",
      "elements": ["element 1", "element 2"],
      "burden": "Who bears the burden and what it is"
    }
  ],
  "analysis_outline": [
    {
      "issue": "Legal issue",
      "analysis": "How the facts apply to the law",
      "strengths": ["Strength 1"],
      "weaknesses": ["Weakness 1"],
      "conclusion": "Likely outcome"
    }
  ],
  "recommended_arguments": ["Argument 1", "Argument 2"],
  "potential_counterarguments": ["Counter 1"],
  "confidence_score": 0.0-1.0
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 3000,
    systemPrompt: 'You are an expert legal analyst. Always respond with valid JSON.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Legal analysis failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        legal_analysis: analysis,
        applicable_standards: analysis.applicable_standards,
        analysis_outline: analysis.analysis_outline,
        recommended_arguments: analysis.recommended_arguments,
      },
      qualityScore: analysis.confidence_score || 0.8,
      requiresReview: false,
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse legal analysis response',
    };
  }
}

/**
 * Phase 3: Legal Research
 */
async function executeLegalResearchPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured for legal research',
    };
  }

  const { previousOutputs, motionType, workflow } = context;
  const supabase = await createClient();

  // Get order jurisdiction info
  const { data: order } = await supabase
    .from('orders')
    .select('jurisdiction, court_type, case_number')
    .eq('id', workflow.order_id)
    .single();

  const prompt = `You are a legal research expert. Based on the legal analysis, identify and cite relevant legal authority.

Motion Type: ${motionType.name}
Jurisdiction: ${order?.jurisdiction || 'Federal'}
Court: ${order?.court_type || 'District Court'}

Applicable Standards:
${JSON.stringify(previousOutputs.applicable_standards || [], null, 2)}

Analysis Outline:
${JSON.stringify(previousOutputs.analysis_outline || [], null, 2)}

Recommended Arguments:
${JSON.stringify(previousOutputs.recommended_arguments || [], null, 2)}

CRITICAL: You must provide at least ${CITATION_HARD_STOP_MINIMUM} verified, relevant case citations.

Respond with JSON:
{
  "citations": [
    {
      "citation_text": "Full legal citation in Bluebook format",
      "case_name": "Case name",
      "court": "Court name",
      "year": 2020,
      "citation_type": "case" | "statute" | "regulation",
      "authority_level": "binding" | "persuasive",
      "relevance": "Why this citation supports the argument",
      "key_quote": "Relevant quote from the case",
      "supports_argument": "Which argument this supports"
    }
  ],
  "research_summary": "Summary of research findings",
  "research_confidence": 0.0-1.0
}

Ensure citations are:
1. Accurate and properly formatted
2. Relevant to the jurisdiction
3. Current (not overruled)
4. Directly supportive of the arguments`;

  const result = await askClaude({
    prompt,
    maxTokens: 4000,
    systemPrompt: 'You are an expert legal researcher. Always respond with valid JSON and accurate citations.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Legal research failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const research = JSON.parse(jsonMatch[0]);

    // Get phase execution ID
    const { data: phaseExec } = await supabase
      .from('workflow_phase_executions')
      .select('id')
      .eq('order_workflow_id', workflow.id)
      .eq('phase_number', context.phaseDefinition.phase_number)
      .single();

    // Store citations
    if (research.citations && research.citations.length > 0 && phaseExec) {
      await storeCitations(
        workflow.id,
        phaseExec.id,
        research.citations.map((c: Record<string, unknown>) => ({
          text: c.citation_text as string,
          type: (c.citation_type as string) || 'case',
          court: c.court as string,
          year: c.year as number,
          caseName: c.case_name as string,
        }))
      );
    }

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        citations: research.citations,
        research_summary: research.research_summary,
        citation_count: research.citations?.length || 0,
      },
      qualityScore: research.research_confidence || 0.8,
      requiresReview: (research.citations?.length || 0) < CITATION_HARD_STOP_MINIMUM,
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse legal research response',
    };
  }
}

/**
 * Phase 4: Citation Verification (HARD STOP GATE)
 */
async function executeCitationVerificationPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  const { workflow, motionType } = context;

  // Verify all citations
  const verifyResult = await verifyWorkflowCitations(workflow.id);

  if (!verifyResult.success) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: verifyResult.error,
    };
  }

  // Check HARD STOP requirement
  const minimum = motionType.citation_requirements?.minimum || CITATION_HARD_STOP_MINIMUM;
  const requirementCheck = await checkCitationRequirements(workflow.id, minimum);

  if (!requirementCheck.success || !requirementCheck.data) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: requirementCheck.error || 'Failed to check citation requirements',
    };
  }

  const { meetsRequirement, verifiedCount, currentCount, blockedReason } = requirementCheck.data;

  // Update workflow citation count
  const supabase = await createClient();
  await supabase
    .from('order_workflows')
    .update({ citation_count: verifiedCount })
    .eq('id', workflow.id);

  if (!meetsRequirement) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'blocked',
      outputs: {
        total_citations: currentCount,
        verified_citations: verifiedCount,
        minimum_required: minimum,
        hard_stop: true,
      },
      requiresReview: true,
      error: blockedReason,
    };
  }

  return {
    success: true,
    phaseNumber: context.phaseDefinition.phase_number,
    status: 'completed',
    outputs: {
      total_citations: currentCount,
      verified_citations: verifiedCount,
      verification_results: verifyResult.data,
      hard_stop_passed: true,
    },
    qualityScore: verifiedCount / Math.max(currentCount, 1),
    requiresReview: false,
  };
}

/**
 * Phase 5: Argument Structuring
 */
async function executeArgumentStructuringPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  const { previousOutputs, motionType } = context;

  const prompt = `Create a detailed outline for a ${motionType.name} motion.

Legal Analysis:
${JSON.stringify(previousOutputs.legal_analysis || {}, null, 2)}

Verified Citations:
${JSON.stringify(previousOutputs.citations || [], null, 2)}

Create a comprehensive argument outline in JSON format:
{
  "motion_title": "Full title of the motion",
  "introduction_outline": {
    "thesis": "Main argument thesis",
    "key_points": ["Point 1", "Point 2"]
  },
  "argument_sections": [
    {
      "section_number": "I",
      "heading": "Section heading",
      "subheadings": [
        {
          "letter": "A",
          "heading": "Subheading",
          "key_points": ["Point"],
          "supporting_citations": ["Citation text"],
          "estimated_paragraphs": 2
        }
      ]
    }
  ],
  "conclusion_outline": {
    "summary_points": ["Point 1"],
    "requested_relief": "What the motion asks for"
  },
  "estimated_page_count": 10
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 3000,
    systemPrompt: 'You are an expert legal writer. Create clear, organized argument structures.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Argument structuring failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const outline = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        argument_outline: outline,
        section_count: outline.argument_sections?.length || 0,
        estimated_pages: outline.estimated_page_count,
      },
      qualityScore: 0.85,
      requiresReview: false,
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse argument outline',
    };
  }
}

/**
 * Phase 6: Document Generation
 * Uses the SUPERPROMPT system for production-grade motion drafting
 */
async function executeDocumentGenerationPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  const { motionType, workflow } = context;

  // Map motion type code to superprompt motion type
  const motionTypeMap: Record<string, SuperpromptMotionType> = {
    'MTD_12B6': 'MTD_12B6',
    'MTD_12B1': 'MTD_12B1',
    'MTD_12B2': 'MTD_12B2',
    'MTD_12B3': 'MTD_12B3',
    'MSJ': 'MSJ',
    'PMSJ': 'PMSJ',
    'MCOMPEL': 'MCOMPEL',
    'MTC': 'MTC',
    'MEXT': 'MEXT',
    'MSTRIKE': 'MSTRIKE',
    'MIL': 'MIL',
    'MTR': 'MTR',
    'MSEAL': 'MSEAL',
    'MREMAND': 'MREMAND',
    'MPRO_HAC': 'MPRO_HAC',
    'OPP_MTD': 'OPP_MTD',
    'OPP_MSJ': 'OPP_MSJ',
    'REPLY_MTD': 'REPLY_MTD',
    'REPLY_MSJ': 'REPLY_MSJ',
  };

  const superpromptMotionType = motionTypeMap[motionType.code] || 'MTD_12B6';

  // Use the SUPERPROMPT system for production-grade generation
  const generationResult = await generateMotionFromOrder(
    workflow.order_id,
    superpromptMotionType
  );

  if (!generationResult.success || !generationResult.data) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: generationResult.error || 'Document generation failed',
    };
  }

  const { fullText, wordCount, estimatedPages, citations, qualityChecklist } = generationResult.data;

  // Check quality requirements
  const passesQuality = qualityChecklist.hasCaption &&
    qualityChecklist.hasArgumentSection &&
    qualityChecklist.hasConclusion &&
    qualityChecklist.noPlaceholders;

  // Calculate quality score based on checklist
  const checklistItems = Object.values(qualityChecklist);
  const passedChecks = checklistItems.filter(Boolean).length;
  const qualityScore = passedChecks / checklistItems.length;

  return {
    success: true,
    phaseNumber: context.phaseDefinition.phase_number,
    status: 'completed',
    outputs: {
      draft_document: fullText,
      word_count: wordCount,
      estimated_pages: estimatedPages,
      citations_used: citations.length,
      citation_details: citations,
      quality_checklist: qualityChecklist,
      generation_method: 'superprompt_v2',
    },
    qualityScore,
    requiresReview: !passesQuality, // Only require review if quality issues detected
  };
}

/**
 * Phase 7: Quality Review
 */
async function executeQualityReviewPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  const { previousOutputs, motionType } = context;
  const draftDocument = previousOutputs.draft_document as string;

  if (!draftDocument) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'No draft document to review',
    };
  }

  const prompt = `Review this ${motionType.name} motion draft for quality and accuracy.

Draft Document:
${draftDocument.substring(0, 10000)}${draftDocument.length > 10000 ? '\n[Document truncated...]' : ''}

Review criteria:
1. Legal accuracy and soundness of arguments
2. Proper citation format and usage
3. Grammar, spelling, and punctuation
4. Logical flow and organization
5. Professional tone and formatting
6. Completeness of required sections

Respond with JSON:
{
  "overall_score": 0.0-1.0,
  "category_scores": {
    "legal_accuracy": 0.0-1.0,
    "citations": 0.0-1.0,
    "grammar": 0.0-1.0,
    "organization": 0.0-1.0,
    "professionalism": 0.0-1.0,
    "completeness": 0.0-1.0
  },
  "issues_found": [
    {
      "severity": "critical" | "major" | "minor",
      "type": "legal" | "citation" | "grammar" | "format" | "content",
      "description": "Description of the issue",
      "location": "Where in document",
      "suggestion": "How to fix"
    }
  ],
  "strengths": ["Strength 1"],
  "revision_suggestions": ["Suggestion 1"],
  "ready_for_delivery": true/false
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 2000,
    systemPrompt: 'You are an expert legal editor. Provide thorough, constructive reviews.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Quality review failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const review = JSON.parse(jsonMatch[0]);
    const hasCriticalIssues = (review.issues_found || []).some(
      (i: { severity: string }) => i.severity === 'critical'
    );

    // v6.3: Convert score to grade and check against B+ minimum
    const grade = scoreToGrade(review.overall_score);
    const passesQuality = meetsQualityThreshold(review.overall_score);

    // Update workflow with judge simulation results
    const supabase = await createClient();
    await supabase
      .from('order_workflows')
      .update({
        judge_sim_grade: grade.letter,
        judge_sim_grade_numeric: review.overall_score,
        judge_sim_passed: passesQuality && !hasCriticalIssues,
      })
      .eq('id', context.workflow.id);

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        review_results: review,
        overall_score: review.overall_score,
        grade: grade.letter,                    // v6.3: Letter grade
        grade_numeric: review.overall_score,    // v6.3: Numeric score
        passed: grade.passed,                   // v6.3: Whether it passed B+ threshold
        issues_found: review.issues_found,
        revision_suggestions: review.revision_suggestions,
        ready_for_delivery: passesQuality && !hasCriticalIssues,
      },
      qualityScore: review.overall_score,
      // v6.3: Use B+ (0.87) threshold instead of 0.7
      requiresReview: hasCriticalIssues || !passesQuality,
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse quality review',
    };
  }
}

/**
 * Phase 8: Document Revision
 */
async function executeDocumentRevisionPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  const { previousOutputs, motionType } = context;
  const draftDocument = previousOutputs.draft_document as string;
  const reviewResults = previousOutputs.review_results as Record<string, unknown>;

  if (!draftDocument) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'No draft document to revise',
    };
  }

  // If no major issues, pass through
  const issues = (reviewResults?.issues_found || []) as Array<{ severity: string }>;
  const needsRevision = issues.some(i => i.severity === 'critical' || i.severity === 'major');

  if (!needsRevision && (reviewResults?.overall_score as number) >= 0.85) {
    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        revised_document: draftDocument,
        revisions_made: 0,
        revision_summary: 'No significant revisions needed',
      },
      qualityScore: reviewResults?.overall_score as number,
      requiresReview: false,
    };
  }

  const prompt = `Revise this ${motionType.name} motion based on the review feedback.

Original Document:
${draftDocument}

Review Feedback:
${JSON.stringify(reviewResults, null, 2)}

Apply all suggested revisions and improvements. Fix all identified issues.
Return the COMPLETE revised document with all corrections applied.
Maintain the same overall structure and length.`;

  const result = await askClaude({
    prompt,
    maxTokens: 8000,
    systemPrompt: 'You are an expert legal editor. Apply revisions precisely and professionally.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Document revision failed',
    };
  }

  return {
    success: true,
    phaseNumber: context.phaseDefinition.phase_number,
    status: 'completed',
    outputs: {
      revised_document: result.result.content,
      revisions_made: issues.length,
      revision_summary: `Applied ${issues.length} revisions based on quality review`,
    },
    qualityScore: 0.9,
    requiresReview: false,
  };
}

/**
 * Phase 9: Document Assembly
 */
async function executeDocumentAssemblyPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  const { previousOutputs, motionType, workflow } = context;
  const supabase = await createClient();

  const revisedDocument = previousOutputs.revised_document as string ||
                         previousOutputs.draft_document as string;

  if (!revisedDocument) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'No document to assemble',
    };
  }

  // Get order info
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', workflow.order_id)
    .single();

  // Generate proposed order if required
  let proposedOrder = '';
  if (motionType.requires_proposed_order && isClaudeConfigured) {
    const orderResult = await askClaude({
      prompt: `Generate a proposed order for this ${motionType.name} motion.

Case Number: ${order?.case_number || '[CASE NUMBER]'}
Court: ${order?.court_type || 'United States District Court'}

The proposed order should grant the relief requested in the motion.
Format as a proper court order with signature lines for the judge.`,
      maxTokens: 1000,
      systemPrompt: 'You are a legal document drafter. Create concise, proper proposed orders.',
    });

    if (orderResult.success && orderResult.result) {
      proposedOrder = orderResult.result.content;
    }
  }

  // Generate certificate of service
  let certificateOfService = '';
  if (motionType.requires_certificate_of_service) {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    certificateOfService = `CERTIFICATE OF SERVICE

I hereby certify that on ${today}, I caused a true and correct copy of the foregoing ${motionType.name} to be served upon all counsel of record via the Court's CM/ECF electronic filing system.

Dated: ${today}

_______________________________
[Attorney Name]
[Bar Number]
[Firm Name]
[Address]
[Phone]
[Email]`;
  }

  // Update workflow as completed
  await supabase
    .from('order_workflows')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      quality_score: 0.9,
    })
    .eq('id', workflow.id);

  return {
    success: true,
    phaseNumber: context.phaseDefinition.phase_number,
    status: 'completed',
    outputs: {
      final_motion: revisedDocument,
      proposed_order: proposedOrder || null,
      certificate_of_service: certificateOfService || null,
      assembly_complete: true,
      total_documents: 1 + (proposedOrder ? 1 : 0) + (certificateOfService ? 1 : 0),
    },
    qualityScore: 0.95,
    requiresReview: true, // Final human review before delivery
  };
}

/**
 * Argument Analysis (Path B)
 */
async function executeArgumentAnalysisPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  const { previousOutputs } = context;

  const prompt = `Analyze the opposing party's arguments for weaknesses and opportunities.

Opponent Arguments:
${JSON.stringify(previousOutputs.opponent_arguments || [], null, 2)}

Opponent Citations:
${JSON.stringify(previousOutputs.opponent_citations || [], null, 2)}

Document Summary:
${JSON.stringify(previousOutputs.document_summary || [], null, 2)}

Provide analysis in JSON format:
{
  "argument_weaknesses": [
    {
      "argument": "The opponent's argument",
      "weakness": "Why it's weak",
      "counter_strategy": "How to counter it",
      "priority": "high" | "medium" | "low"
    }
  ],
  "factual_disputes": [
    {
      "claim": "Opponent's factual claim",
      "problem": "Issue with the claim",
      "evidence_needed": "What evidence counters it"
    }
  ],
  "citation_issues": [
    {
      "citation": "The citation",
      "issue": "What's wrong (distinguishable, overruled, misapplied)"
    }
  ],
  "counterargument_opportunities": ["Opportunity 1"],
  "recommended_response_strategy": "Overall strategy"
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 3000,
    systemPrompt: 'You are an expert legal strategist. Identify weaknesses and opportunities.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Argument analysis failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        argument_weaknesses: analysis.argument_weaknesses,
        factual_disputes: analysis.factual_disputes,
        citation_issues: analysis.citation_issues,
        counterargument_opportunities: analysis.counterargument_opportunities,
        response_strategy: analysis.recommended_response_strategy,
      },
      qualityScore: 0.85,
      requiresReview: false,
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse argument analysis',
    };
  }
}

// ============================================================================
// v6.3 NEW PHASE HANDLERS
// ============================================================================

/**
 * Phase 3: Evidence Mapping (NEW in v6.3)
 * Maps available evidence to legal elements and identifies gaps
 */
async function executeEvidenceMappingPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured for evidence mapping',
    };
  }

  const { previousOutputs, motionType } = context;

  const prompt = `You are a legal evidence analyst. Map the available evidence to the legal elements for this ${motionType.name}.

Legal Standards and Elements:
${JSON.stringify(previousOutputs.applicable_standards || [], null, 2)}

Key Facts from Documents:
${JSON.stringify(previousOutputs.key_facts || [], null, 2)}

Document Summaries:
${JSON.stringify(previousOutputs.document_summary || [], null, 2)}

Provide a comprehensive evidence mapping in JSON format:
{
  "element_mapping": [
    {
      "element": "Legal element name",
      "description": "What must be proven",
      "available_evidence": [
        {
          "evidence": "Description of evidence",
          "source": "Which document/fact",
          "strength": "strong" | "moderate" | "weak",
          "authentication_status": "authenticated" | "needs_authentication" | "hearsay_issue"
        }
      ],
      "evidence_gap": true/false,
      "gap_description": "What evidence is missing (if any)"
    }
  ],
  "evidentiary_issues": [
    {
      "issue_type": "hearsay" | "authentication" | "relevance" | "privilege" | "foundation",
      "description": "Description of the issue",
      "affected_evidence": "Which evidence is affected",
      "possible_solution": "How to address it"
    }
  ],
  "exhibits_needed": [
    {
      "exhibit": "Description of exhibit needed",
      "purpose": "Why it's needed",
      "priority": "critical" | "important" | "helpful"
    }
  ],
  "declarations_needed": [
    {
      "declarant": "Who should provide declaration",
      "topics": ["Topic 1", "Topic 2"],
      "purpose": "Why this declaration is needed"
    }
  ],
  "evidence_sufficiency_score": 0.0-1.0,
  "overall_assessment": "Summary of evidence strength"
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 4000,
    systemPrompt: 'You are an expert legal evidence analyst. Map evidence to elements thoroughly.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Evidence mapping failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const mapping = JSON.parse(jsonMatch[0]);
    const hasGaps = mapping.element_mapping?.some((e: { evidence_gap: boolean }) => e.evidence_gap);

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        evidence_mapping: mapping,
        element_mapping: mapping.element_mapping,
        evidentiary_issues: mapping.evidentiary_issues,
        exhibits_needed: mapping.exhibits_needed,
        declarations_needed: mapping.declarations_needed,
        has_evidence_gaps: hasGaps,
        evidence_sufficiency: mapping.evidence_sufficiency_score,
      },
      qualityScore: mapping.evidence_sufficiency_score || 0.8,
      requiresReview: hasGaps,
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse evidence mapping response',
    };
  }
}

/**
 * Phase 7: Opposition Anticipation (v6.3)
 * Anticipates opposing arguments and prepares strategic responses
 */
async function executeOppositionAnticipationPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  const { previousOutputs, motionType, workflow } = context;
  const isOpposition = workflow.workflow_path === 'path_b';

  const prompt = `You are a legal strategist. ${isOpposition ? 'Anticipate how the moving party will reply to this opposition.' : 'Anticipate how the opposing party will respond to this motion.'}

Motion Type: ${motionType.name}
${isOpposition ? 'This is an opposition/response.' : 'This is an initiating motion.'}

Our Arguments:
${JSON.stringify(previousOutputs.recommended_arguments || previousOutputs.argument_outline || [], null, 2)}

Our Citations:
${JSON.stringify(previousOutputs.citations || [], null, 2)}

Draft Document Summary:
${(previousOutputs.draft_document as string)?.substring(0, 3000) || 'Not available'}

Provide a comprehensive anticipation analysis in JSON format:
{
  "anticipated_arguments": [
    {
      "argument": "The argument they're likely to make",
      "likelihood": "high" | "medium" | "low",
      "our_weakness_exploited": "Which weakness in our position they'll attack",
      "preemptive_response": "How to address this in our brief",
      "supporting_authority": "Cases/statutes that help our response"
    }
  ],
  "anticipated_objections": [
    {
      "objection_type": "procedural" | "evidentiary" | "substantive",
      "objection": "What they might object to",
      "response": "How to counter this objection"
    }
  ],
  "case_distinctions": [
    {
      "our_case": "Case we cited",
      "their_distinction": "How they might distinguish it",
      "our_response": "Why the distinction fails"
    }
  ],
  "strengthening_recommendations": [
    {
      "recommendation": "What to add or modify",
      "priority": "critical" | "important" | "nice_to_have",
      "implementation": "How to implement"
    }
  ],
  "risk_assessment": {
    "overall_risk": "low" | "medium" | "high",
    "primary_vulnerabilities": ["Vulnerability 1"],
    "mitigation_strategies": ["Strategy 1"]
  }
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 4000,
    systemPrompt: 'You are an expert legal strategist specializing in motion practice.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Opposition anticipation failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const anticipation = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        opposition_anticipation: anticipation,
        anticipated_arguments: anticipation.anticipated_arguments,
        anticipated_objections: anticipation.anticipated_objections,
        case_distinctions: anticipation.case_distinctions,
        strengthening_recommendations: anticipation.strengthening_recommendations,
        risk_assessment: anticipation.risk_assessment,
      },
      qualityScore: 0.85,
      requiresReview: anticipation.risk_assessment?.overall_risk === 'high',
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse opposition anticipation response',
    };
  }
}

/**
 * Phase 10: Caption Validation (NEW in v6.3)
 * Verifies caption consistency across all documents
 */
async function executeCaptionValidationPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  const { workflow, previousOutputs } = context;
  const supabase = await createClient();

  // Get order details for caption info
  const { data: order } = await supabase
    .from('orders')
    .select('case_number, case_caption, court_type, jurisdiction, plaintiff_name, defendant_name')
    .eq('id', workflow.order_id)
    .single();

  if (!order) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Order not found for caption validation',
    };
  }

  const draftDocument = (previousOutputs.revised_document || previousOutputs.draft_document) as string;

  // Check for placeholder patterns that should have been replaced
  const placeholderPatterns = [
    /\[CASE NUMBER\]/gi,
    /\[CASE CAPTION\]/gi,
    /\[PLAINTIFF\]/gi,
    /\[DEFENDANT\]/gi,
    /\[COURT NAME\]/gi,
    /\[JUDGE NAME\]/gi,
    /\[DATE\]/gi,
    /\[\[.*?\]\]/g,  // Double brackets
    /{{.*?}}/g,      // Mustache style
    /<.*?>/g,        // Angle brackets (but not HTML)
  ];

  const placeholdersFound: string[] = [];
  for (const pattern of placeholderPatterns) {
    const matches = draftDocument?.match(pattern);
    if (matches) {
      placeholdersFound.push(...matches.filter(m => !m.startsWith('</')));
    }
  }

  // Check caption consistency
  const captionIssues: string[] = [];

  if (order.case_number && draftDocument && !draftDocument.includes(order.case_number)) {
    captionIssues.push(`Case number "${order.case_number}" not found in document`);
  }

  // Remove duplicates from placeholders
  const uniquePlaceholders = [...new Set(placeholdersFound)];
  const hasPlaceholders = uniquePlaceholders.length > 0;

  return {
    success: true,
    phaseNumber: context.phaseDefinition.phase_number,
    status: 'completed',
    outputs: {
      caption_validated: !hasPlaceholders && captionIssues.length === 0,
      placeholders_found: uniquePlaceholders,
      caption_issues: captionIssues,
      order_caption_info: {
        case_number: order.case_number,
        case_caption: order.case_caption,
        court: order.court_type,
        jurisdiction: order.jurisdiction,
        plaintiff: order.plaintiff_name,
        defendant: order.defendant_name,
      },
    },
    qualityScore: hasPlaceholders ? 0.5 : (captionIssues.length > 0 ? 0.7 : 1.0),
    requiresReview: hasPlaceholders || captionIssues.length > 0,
  };
}

/**
 * Phase 11: Supporting Documents (Expanded in v6.3)
 * Generates declarations, proposed order, proof of service, etc.
 */
async function executeSupportingDocumentsPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  const { workflow, motionType, previousOutputs } = context;
  const supabase = await createClient();

  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  // Get order details
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', workflow.order_id)
    .single();

  const generatedDocuments: Record<string, string> = {};
  const documentList: string[] = [];

  // 1. Generate Proposed Order (if required)
  if (motionType.requires_proposed_order) {
    const orderResult = await askClaude({
      prompt: `Generate a proposed order for this ${motionType.name}.

Case Information:
- Case Number: ${order?.case_number || '[CASE NUMBER]'}
- Court: ${order?.court_type || 'United States District Court'}
- Caption: ${order?.case_caption || '[CASE CAPTION]'}

The proposed order should:
1. Have proper caption matching the motion
2. Recite that the Court has considered the motion and any opposition
3. Grant the relief requested
4. Include signature line for the judge
5. Include "IT IS SO ORDERED" language
6. Include date line

Generate a complete, court-ready proposed order.`,
      maxTokens: 1500,
      systemPrompt: 'You are a legal document drafter. Create formal court documents.',
    });

    if (orderResult.success && orderResult.result) {
      generatedDocuments.proposed_order = orderResult.result.content;
      documentList.push('Proposed Order');
    }
  }

  // 2. Generate Certificate/Proof of Service
  if (motionType.requires_certificate_of_service) {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    generatedDocuments.certificate_of_service = `CERTIFICATE OF SERVICE

I hereby certify that on ${today}, I caused a true and correct copy of the foregoing ${motionType.name} and all supporting documents to be served upon all counsel of record via the Court's CM/ECF electronic filing system, which will send notification of such filing to all counsel of record.

Dated: ${today}

_______________________________
[Attorney Name]
[State Bar No.]
[Firm Name]
[Address Line 1]
[Address Line 2]
[Phone]
[Email]

Attorney for [Plaintiff/Defendant]`;

    documentList.push('Certificate of Service');
  }

  // 3. Generate Declaration outline (if declarations needed)
  const declarationsNeeded = previousOutputs.declarations_needed as Array<{ declarant: string; topics: string[]; purpose: string }> || [];
  if (declarationsNeeded.length > 0) {
    for (const decl of declarationsNeeded) {
      const declResult = await askClaude({
        prompt: `Generate a declaration outline for ${decl.declarant}.

Purpose: ${decl.purpose}
Topics to cover:
${decl.topics.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}

Case Number: ${order?.case_number || '[CASE NUMBER]'}

Create a declaration template with:
1. Proper caption
2. Personal knowledge statement
3. Numbered paragraphs for each topic
4. Penalty of perjury statement
5. Signature block with date

Include [FILL IN] markers for information the declarant must provide.`,
        maxTokens: 2000,
        systemPrompt: 'You are a legal document drafter specializing in declarations.',
      });

      if (declResult.success && declResult.result) {
        const key = `declaration_${decl.declarant.toLowerCase().replace(/\s+/g, '_')}`;
        generatedDocuments[key] = declResult.result.content;
        documentList.push(`Declaration of ${decl.declarant}`);
      }
    }
  }

  // 4. For MSJ: Generate Separate Statement of Undisputed Facts
  if (motionType.code === 'MSJ' || motionType.code === 'PMSJ') {
    const ssuResult = await askClaude({
      prompt: `Generate a Separate Statement of Undisputed Material Facts for this Motion for Summary Judgment.

Key Facts:
${JSON.stringify(previousOutputs.key_facts || [], null, 2)}

Evidence Mapping:
${JSON.stringify(previousOutputs.element_mapping || [], null, 2)}

Format each fact as:
FACT NO. [X]: [Statement of undisputed fact]
SUPPORTING EVIDENCE: [Citation to evidence with exhibit letter/number]

Include at least the key undisputed facts that support each element of the motion.`,
      maxTokens: 3000,
      systemPrompt: 'You are a legal document drafter. Create properly formatted separate statements.',
    });

    if (ssuResult.success && ssuResult.result) {
      generatedDocuments.separate_statement = ssuResult.result.content;
      documentList.push('Separate Statement of Undisputed Material Facts');
    }
  }

  // 5. For Opposition to MSJ: Generate Statement of Genuine Disputes
  if (motionType.code === 'OPP_MSJ') {
    const sgdResult = await askClaude({
      prompt: `Generate a Statement of Genuine Disputes of Material Fact for this Opposition to Motion for Summary Judgment.

For each fact the moving party claims is undisputed, either:
1. UNDISPUTED - if we agree
2. DISPUTED - with explanation of why and citation to contrary evidence

Use the format:
FACT NO. [X]: [Moving party's statement]
RESPONSE: [UNDISPUTED/DISPUTED] [Explanation with evidence citation]`,
      maxTokens: 3000,
      systemPrompt: 'You are a legal document drafter. Create properly formatted response statements.',
    });

    if (sgdResult.success && sgdResult.result) {
      generatedDocuments.statement_of_disputes = sgdResult.result.content;
      documentList.push('Statement of Genuine Disputes');
    }
  }

  // 6. Generate Attorney Instruction Sheet with Gap Acknowledgment (v6.3 REQUIREMENT)
  const elementMapping = previousOutputs.element_mapping;
  const evidenceGaps = Array.isArray(elementMapping)
    ? elementMapping.filter((e: { evidence_gap?: boolean }) => e.evidence_gap)
    : [];
  const hasEvidenceGaps = previousOutputs.has_evidence_gaps || evidenceGaps.length > 0;

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Build gap acknowledgment section
  let gapAcknowledgmentSection = '';
  if (hasEvidenceGaps) {
    const gapList = evidenceGaps.map((gap: { element?: string; gap_description?: string }, i: number) =>
      `   ${i + 1}. ${gap.element || 'Unspecified element'}: ${gap.gap_description || 'Evidence gap identified'}`
    ).join('\n');

    gapAcknowledgmentSection = `
================================================================================
GAP ACKNOWLEDGMENT
================================================================================

The following evidentiary gaps have been identified in this motion. By signing
below, I acknowledge that I have reviewed these gaps and either:
(a) Accept them as identified, understanding they may affect the motion's strength
(b) Have additional evidence to address these gaps that I will provide

IDENTIFIED GAPS:
${gapList || '   No specific gaps identified, but evidence may be limited.'}

ATTORNEY ACKNOWLEDGMENT:

I have reviewed the identified gaps above and:

[ ] I accept these gaps and wish to proceed with filing
[ ] I have additional evidence to address these gaps (specify below)

Additional Evidence/Notes:
______________________________________________________________________________
______________________________________________________________________________
______________________________________________________________________________

Attorney Signature: _____________________________ Date: ________________

Print Name: ____________________________________

State Bar No: __________________________________
`;
  } else {
    gapAcknowledgmentSection = `
================================================================================
GAP ACKNOWLEDGMENT
================================================================================

No significant evidentiary gaps were identified during the evidence mapping phase.
All legal elements appear to have adequate evidentiary support.

ATTORNEY ACKNOWLEDGMENT:

I have reviewed the evidence mapping analysis and confirm that the evidentiary
support for this motion is satisfactory.

Attorney Signature: _____________________________ Date: ________________

Print Name: ____________________________________

State Bar No: __________________________________
`;
  }

  generatedDocuments.attorney_instruction_sheet = `
================================================================================
ATTORNEY INSTRUCTION SHEET
Motion Granted v6.3 - ${motionType.name}
================================================================================
Order Reference: ${order?.order_number || '[ORDER NUMBER]'}
Case: ${order?.case_caption || '[CASE CAPTION]'}
Case No: ${order?.case_number || '[CASE NUMBER]'}
Generated: ${today}
================================================================================

IMPORTANT: This document is for the reviewing attorney ONLY. Do not file.

--------------------------------------------------------------------------------
SECTION 1: REVIEW CHECKLIST
--------------------------------------------------------------------------------

Before filing, the attorney MUST:

[ ] 1. Read the entire motion and verify accuracy of all facts
[ ] 2. Verify all citations are accurate and still good law
[ ] 3. Confirm the legal arguments align with your case strategy
[ ] 4. Review and sign all declarations
[ ] 5. Complete any [FILL IN] placeholders
[ ] 6. Verify the case caption and case number are correct
[ ] 7. Review the proposed order for accuracy
[ ] 8. Confirm service list is complete and accurate
[ ] 9. Review the Gap Acknowledgment section below
[ ] 10. Ensure compliance with local rules for page limits and formatting

--------------------------------------------------------------------------------
SECTION 2: FILING INSTRUCTIONS
--------------------------------------------------------------------------------

1. E-Filing: File through CM/ECF or state equivalent
2. Format: PDF/A recommended for long-term archival
3. Exhibits: Attach as separate documents if required by local rules
4. Filing Fee: Verify if motion requires a filing fee
5. Proposed Order: Some courts require separate filing; check local rules

--------------------------------------------------------------------------------
SECTION 3: DEADLINE TRACKING
--------------------------------------------------------------------------------

[ ] Opposition/Response Deadline: ______________________
[ ] Reply Deadline (if applicable): ______________________
[ ] Hearing Date (if applicable): ______________________
[ ] Any other relevant deadlines: ______________________

--------------------------------------------------------------------------------
SECTION 4: DOCUMENTS INCLUDED IN THIS PACKAGE
--------------------------------------------------------------------------------

${documentList.map((doc, i) => `${(i + 1).toString().padStart(2, '0')}. ${doc}`).join('\n')}
${documentList.length + 1}. Attorney Instruction Sheet (this document - DO NOT FILE)
${gapAcknowledgmentSection}

--------------------------------------------------------------------------------
SECTION 5: MOTION GRANTED DISCLAIMER
--------------------------------------------------------------------------------

This motion was prepared by Motion Granted under the supervision and direction
of the filing attorney. Motion Granted is not a law firm and does not provide
legal advice. The filing attorney is solely responsible for:

- Reviewing and approving all content
- Verifying the accuracy of all facts and citations
- Ensuring compliance with all applicable rules and ethical obligations
- Making all strategic decisions regarding the case
- Filing the motion with the court

By using this work product, the attorney certifies they have reviewed and
approved all documents in this package.

================================================================================
END OF ATTORNEY INSTRUCTION SHEET
================================================================================
`;

  documentList.push('Attorney Instruction Sheet');

  return {
    success: true,
    phaseNumber: context.phaseDefinition.phase_number,
    status: 'completed',
    outputs: {
      supporting_documents: generatedDocuments,
      document_list: documentList,
      document_count: documentList.length,
      has_proposed_order: !!generatedDocuments.proposed_order,
      has_certificate_of_service: !!generatedDocuments.certificate_of_service,
      has_separate_statement: !!generatedDocuments.separate_statement,
      has_attorney_instruction_sheet: true,
      has_gap_acknowledgment: hasEvidenceGaps,
      evidence_gaps_count: evidenceGaps.length,
      declarations_generated: declarationsNeeded.length,
    },
    qualityScore: 0.9,
    requiresReview: false,
  };
}

/**
 * Phase 2B: Motion Deconstruction (Path B only)
 */
async function executeMotionDeconstructionPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  const { previousOutputs } = context;

  const prompt = `Deconstruct the opposing party's motion to identify all arguments, claims, and weaknesses.

Document Summary:
${JSON.stringify(previousOutputs.document_summary || [], null, 2)}

Key Facts Claimed:
${JSON.stringify(previousOutputs.key_facts || [], null, 2)}

Legal Issues Raised:
${JSON.stringify(previousOutputs.legal_issues || [], null, 2)}

Provide a comprehensive deconstruction in JSON format:
{
  "main_arguments": [
    {
      "argument": "The main legal argument",
      "supporting_facts": ["Fact 1"],
      "citations_used": ["Citation 1"],
      "logical_structure": "How the argument is constructed",
      "potential_weaknesses": ["Weakness 1"]
    }
  ],
  "factual_claims": [
    {
      "claim": "The factual claim",
      "evidence_cited": "Evidence they cite",
      "is_disputed": true/false,
      "dispute_basis": "Why we dispute it (if applicable)"
    }
  ],
  "legal_standards_invoked": [
    {
      "standard": "The legal standard",
      "elements": ["Element 1"],
      "their_application": "How they apply it"
    }
  ],
  "procedural_issues": ["Any procedural problems with their motion"],
  "overall_strength": "weak" | "moderate" | "strong",
  "recommended_attack_vectors": ["Attack vector 1"]
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 4000,
    systemPrompt: 'You are an expert legal analyst. Deconstruct arguments thoroughly.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Motion deconstruction failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const deconstruction = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        motion_deconstruction: deconstruction,
        opponent_arguments: deconstruction.main_arguments,
        opponent_factual_claims: deconstruction.factual_claims,
        opponent_legal_standards: deconstruction.legal_standards_invoked,
        procedural_issues: deconstruction.procedural_issues,
        attack_vectors: deconstruction.recommended_attack_vectors,
        opponent_strength: deconstruction.overall_strength,
      },
      qualityScore: 0.85,
      requiresReview: false,
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse motion deconstruction',
    };
  }
}

/**
 * Phase 3B: Issue Identification (Path B only)
 */
async function executeIssueIdentificationPhase(
  context: PhaseExecutionContext
): Promise<PhaseResult> {
  if (!isClaudeConfigured) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'AI not configured',
    };
  }

  const { previousOutputs, motionType } = context;
  const isMSJOpposition = motionType.code === 'OPP_MSJ';

  const prompt = `Identify all ${isMSJOpposition ? 'genuine disputes of material fact and legal issues' : 'issues to challenge'} in response to the opposing motion.

Motion Deconstruction:
${JSON.stringify(previousOutputs.motion_deconstruction || {}, null, 2)}

Our Key Facts:
${JSON.stringify(previousOutputs.key_facts || [], null, 2)}

${isMSJOpposition ? `
For MSJ Opposition, identify:
1. Which facts are genuinely disputed (with supporting evidence)
2. Which facts, even if undisputed, don't support summary judgment
3. Missing elements the moving party hasn't established
` : `
Identify:
1. Legal errors in their argument
2. Factual errors or misrepresentations
3. Procedural defects
`}

Provide analysis in JSON format:
{
  ${isMSJOpposition ? `"genuine_disputes": [
    {
      "their_fact": "What they claim is undisputed",
      "our_position": "disputed" | "undisputed_but_immaterial",
      "our_evidence": "Evidence supporting our position",
      "why_material": "Why this dispute is material"
    }
  ],
  "missing_elements": [
    {
      "element": "Element they haven't proven",
      "deficiency": "What's missing"
    }
  ],` : `"legal_errors": [
    {
      "error": "The legal error",
      "correct_law": "What the law actually says",
      "authority": "Supporting authority"
    }
  ],`}
  "factual_issues": [
    {
      "issue": "The factual issue",
      "their_claim": "What they claim",
      "reality": "What the evidence shows"
    }
  ],
  "procedural_issues": [
    {
      "issue": "Procedural problem",
      "consequence": "Why it matters"
    }
  ],
  "strongest_arguments": ["Our strongest counter-argument 1"],
  "recommended_structure": "How to structure our response"
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 4000,
    systemPrompt: 'You are an expert legal analyst. Identify issues comprehensively.',
  });

  if (!result.success || !result.result) {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: result.error || 'Issue identification failed',
    };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const issues = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        issue_identification: issues,
        genuine_disputes: issues.genuine_disputes,
        missing_elements: issues.missing_elements,
        legal_errors: issues.legal_errors,
        factual_issues: issues.factual_issues,
        procedural_issues: issues.procedural_issues,
        strongest_arguments: issues.strongest_arguments,
        recommended_structure: issues.recommended_structure,
      },
      qualityScore: 0.85,
      requiresReview: false,
    };
  } catch {
    return {
      success: false,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'failed',
      outputs: {},
      requiresReview: false,
      error: 'Failed to parse issue identification',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get outputs from previous phases
 */
async function getPreviousPhaseOutputs(
  workflowId: string,
  currentPhase: number
): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  const { data: phases } = await supabase
    .from('workflow_phase_executions')
    .select('phase_number, outputs')
    .eq('order_workflow_id', workflowId)
    .lt('phase_number', currentPhase)
    .eq('status', 'completed')
    .order('phase_number', { ascending: true });

  const outputs: Record<string, unknown> = {};

  for (const phase of phases || []) {
    if (phase.outputs) {
      Object.assign(outputs, phase.outputs);
    }
  }

  return outputs;
}

// ============================================================================
// WORKFLOW STATUS
// ============================================================================

/**
 * Get workflow progress
 */
export async function getWorkflowProgress(
  workflowId: string
): Promise<OperationResult<WorkflowProgress>> {
  const supabase = await createClient();

  try {
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get phase definitions count
    const { count: totalPhases } = await supabase
      .from('workflow_phase_definitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_path', workflow.workflow_path);

    // Get completed phases count
    const { count: completedPhases } = await supabase
      .from('workflow_phase_executions')
      .select('*', { count: 'exact', head: true })
      .eq('order_workflow_id', workflowId)
      .eq('status', 'completed');

    // Get current phase info
    const { data: currentPhaseDef } = await supabase
      .from('workflow_phase_definitions')
      .select('*')
      .eq('workflow_path', workflow.workflow_path)
      .eq('phase_number', workflow.current_phase)
      .single();

    const { data: currentPhaseExec } = await supabase
      .from('workflow_phase_executions')
      .select('*')
      .eq('order_workflow_id', workflowId)
      .eq('phase_number', workflow.current_phase)
      .single();

    // Calculate remaining time
    const { data: remainingPhases } = await supabase
      .from('workflow_phase_definitions')
      .select('estimated_duration_minutes')
      .eq('workflow_path', workflow.workflow_path)
      .gte('phase_number', workflow.current_phase);

    interface PhaseDurationRow { estimated_duration_minutes: number | null }
    const estimatedRemainingMinutes = ((remainingPhases || []) as PhaseDurationRow[]).reduce(
      (sum: number, p: PhaseDurationRow) => sum + (p.estimated_duration_minutes || 30),
      0
    );

    const progress: WorkflowProgress = {
      workflowId,
      orderId: workflow.order_id,
      totalPhases: totalPhases || 9,
      completedPhases: completedPhases || 0,
      currentPhase: workflow.current_phase,
      currentPhaseName: currentPhaseDef?.phase_name || 'Unknown',
      currentPhaseStatus: (currentPhaseExec?.status as PhaseStatus) || 'pending',
      overallProgress: ((completedPhases || 0) / (totalPhases || 9)) * 100,
      estimatedRemainingMinutes,
      citationCount: workflow.citation_count || 0,
      qualityScore: workflow.quality_score || undefined,
    };

    return { success: true, data: progress };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get workflow progress',
    };
  }
}

/**
 * Approve a phase requiring review
 */
export async function approvePhase(
  workflowId: string,
  phaseNumber: number,
  approvedBy: string,
  notes?: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from('workflow_phase_executions')
      .update({
        status: 'completed',
        requires_review: false,
        reviewed_by: approvedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('order_workflow_id', workflowId)
      .eq('phase_number', phaseNumber);

    if (error) {
      return { success: false, error: error.message };
    }

    // Advance workflow
    await supabase
      .from('order_workflows')
      .update({
        current_phase: phaseNumber + 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve phase',
    };
  }
}

/**
 * Run the entire workflow automatically
 */
interface WorkflowRunResult {
  status: string;
  currentPhase?: number;
  message?: string;
}

export async function runWorkflow(workflowId: string): Promise<OperationResult<WorkflowRunResult>> {
  const supabase = await createClient();

  // Get workflow
  const { data: workflow, error } = await supabase
    .from('order_workflows')
    .select('*, motion_types(*)')
    .eq('id', workflowId)
    .single();

  if (error || !workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // Get total phases
  const { count: totalPhases } = await supabase
    .from('workflow_phase_definitions')
    .select('*', { count: 'exact', head: true })
    .eq('workflow_path', workflow.workflow_path);

  const maxPhases = totalPhases || 9;

  // Run until complete or blocked
  while (workflow.current_phase <= maxPhases) {
    const result = await executeCurrentPhase(workflowId);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    if (result.data?.requiresReview) {
      return {
        success: true,
        data: {
          status: 'requires_review',
          currentPhase: result.data.phaseNumber,
          message: 'Workflow paused for review',
        },
      };
    }

    if (result.data?.status === 'blocked' || result.data?.status === 'failed') {
      return {
        success: false,
        error: result.data.error || 'Workflow blocked',
      };
    }

    // Refresh workflow state
    const { data: updated } = await supabase
      .from('order_workflows')
      .select('current_phase, status')
      .eq('id', workflowId)
      .single();

    if (updated?.status === 'completed') {
      return { success: true, data: { status: 'completed' } };
    }

    workflow.current_phase = updated?.current_phase || workflow.current_phase + 1;
  }

  return { success: true, data: { status: 'completed' } };
}
