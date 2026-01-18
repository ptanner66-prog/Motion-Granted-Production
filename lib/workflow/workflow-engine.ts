/**
 * Workflow Engine
 *
 * Core state machine for managing workflow phase transitions.
 * Handles document production workflow from intake to final assembly.
 */

import { createClient } from '@/lib/supabase/server';
import { askClaude, isClaudeConfigured } from '@/lib/automation/claude';
import { parseDocument, parseOrderDocuments } from './document-parser';
import {
  extractCitations,
  storeCitations,
  verifyWorkflowCitations,
  checkCitationRequirements,
  CITATION_HARD_STOP_MINIMUM,
} from './citation-verifier';
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
 */
async function executePhaseByType(
  context: PhaseExecutionContext,
  phaseExec: Record<string, unknown>
): Promise<PhaseResult> {
  const { phaseDefinition } = context;

  switch (phaseDefinition.ai_task_type) {
    case 'document_parsing':
      return await executeDocumentParsingPhase(context);

    case 'legal_analysis':
      return await executeLegalAnalysisPhase(context);

    case 'legal_research':
      return await executeLegalResearchPhase(context);

    case 'citation_verification':
      return await executeCitationVerificationPhase(context);

    case 'argument_structuring':
      return await executeArgumentStructuringPhase(context);

    case 'document_generation':
      return await executeDocumentGenerationPhase(context);

    case 'quality_review':
      return await executeQualityReviewPhase(context);

    case 'document_revision':
      return await executeDocumentRevisionPhase(context);

    case 'document_assembly':
      return await executeDocumentAssemblyPhase(context);

    case 'argument_analysis':
      return await executeArgumentAnalysisPhase(context);

    default:
      return {
        success: false,
        phaseNumber: context.phaseDefinition.phase_number,
        status: 'failed',
        outputs: {},
        requiresReview: false,
        error: `Unknown phase type: ${phaseDefinition.ai_task_type}`,
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

    return {
      success: true,
      phaseNumber: context.phaseDefinition.phase_number,
      status: 'completed',
      outputs: {
        review_results: review,
        overall_score: review.overall_score,
        issues_found: review.issues_found,
        revision_suggestions: review.revision_suggestions,
        ready_for_delivery: review.ready_for_delivery && !hasCriticalIssues,
      },
      qualityScore: review.overall_score,
      requiresReview: hasCriticalIssues || review.overall_score < 0.7,
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
