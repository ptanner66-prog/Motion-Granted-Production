/**
 * Workflow Orchestrator
 *
 * The central orchestration layer that combines:
 * 1. Client checkout data (statement of facts, procedural history, instructions)
 * 2. Uploaded document content (parsed and extracted)
 * 3. Motion templates and superprompts
 * 4. The 9-phase workflow execution
 *
 * This module automates the complete flow from order submission to draft delivery.
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { askClaude } from '@/lib/automation/claude';
import { extractOrderDocuments, getCombinedDocumentText } from './document-extractor';
import { parseOrderDocuments, getOrderParsedDocuments } from './document-parser';
import { startWorkflow, runWorkflow, getWorkflowProgress, executeCurrentPhase } from './workflow-engine';
import { getTemplateForPath, generateSectionPrompt, MOTION_TEMPLATES } from './motion-templates';
import {
  validatePhaseGate,
  enforcePhaseTransition,
  markPhaseComplete,
  getNextAllowedPhase,
  type PhaseId
} from './phase-gates';
import { alertBypassAttempt } from './violation-alerts';
import type { OperationResult } from '@/types/automation';
import type { WorkflowPath, MotionTier } from '@/types/workflow';

// ============================================================================
// TIER NORMALIZATION
// ============================================================================

/**
 * Normalize motion tier to letter format (A, B, C).
 * Database may store as numeric (0/1/2/3) or letter - this ensures letter output.
 *
 * Mapping: 0→A, 1→A, 2→B, 3→C (0 treated as A for safety)
 * Already-letter values pass through unchanged.
 */
function normalizeMotionTier(tier: unknown): 'A' | 'B' | 'C' {
  // If already a valid letter, return it
  if (tier === 'A' || tier === 'B' || tier === 'C') {
    return tier;
  }

  // Convert numeric to letter
  if (typeof tier === 'number') {
    if (tier === 1 || tier === 0) return 'A';
    if (tier === 2) return 'B';
    if (tier === 3) return 'C';
  }

  // Handle string numbers
  if (typeof tier === 'string') {
    if (tier === '1' || tier === '0') return 'A';
    if (tier === '2') return 'B';
    if (tier === '3') return 'C';
    // Check for lowercase letters
    const upper = tier.toUpperCase();
    if (upper === 'A' || upper === 'B' || upper === 'C') {
      return upper as 'A' | 'B' | 'C';
    }
  }

  // Default to B (Motion to Compel tier)
  console.warn(`[normalizeMotionTier] Unknown tier value: ${tier}, defaulting to B`);
  return 'B';
}

// Create admin client with service role key (bypasses RLS for server-side operations)
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// TYPES
// ============================================================================

export interface OrderContext {
  orderId: string;
  orderNumber: string;

  // Case information from checkout
  motionType: string;
  motionTier: MotionTier;
  jurisdiction: string;
  courtDivision: string | null;
  caseNumber: string;
  caseCaption: string;

  // Client-provided narrative from checkout
  statementOfFacts: string;
  proceduralHistory: string;
  instructions: string;
  filingDeadline: string | null;

  // Parties
  parties: Array<{
    name: string;
    role: string;
    isRepresented?: boolean;
  }>;

  // ATTORNEY INFO - For signature blocks (from profiles table)
  attorneyName: string;
  barNumber: string;
  firmName: string;
  firmAddress: string;
  firmCity: string;
  firmState: string;
  firmZip: string;
  firmPhone: string;
  firmEmail: string;
  firmFullAddress: string;  // Pre-formatted multi-line address

  // Extracted document content
  documents: {
    raw: string; // Combined raw text from all documents
    parsed: Array<{
      fileName: string;
      documentType: string;
      summary: string;
      keyFacts: unknown[];
      legalIssues: unknown[];
    }>;
  };
}

export interface SuperPromptContext {
  orderContext: OrderContext;
  motionTemplate: ReturnType<typeof getTemplateForPath>;
  workflowPath: WorkflowPath;
}

export interface OrchestrationResult {
  success: boolean;
  workflowId?: string;
  status: 'started' | 'in_progress' | 'requires_review' | 'completed' | 'failed';
  currentPhase?: number;
  message?: string;
  error?: string;
  outputs?: Record<string, unknown>;
}

// ============================================================================
// CONTEXT GATHERING
// ============================================================================

/**
 * Gather all context for an order - checkout data + documents
 * Uses service role client to bypass RLS (needed for API routes)
 */
export async function gatherOrderContext(orderId: string): Promise<OperationResult<OrderContext>> {
  // Use admin client to bypass RLS (API routes may not have user session)
  const supabase = getAdminClient();

  if (!supabase) {
    return { success: false, error: 'Database not configured. Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' };
  }

  try {
    // Get order details with parties AND client profile for attorney info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        parties (
          party_name,
          party_role
        ),
        profiles:client_id (
          full_name,
          bar_number,
          firm_name,
          firm_address,
          firm_city,
          firm_state,
          firm_zip,
          firm_phone,
          email
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return { success: false, error: orderError?.message || 'Order not found' };
    }

    // Extract attorney info from profile (with fallbacks)
    const profile = order.profiles as Record<string, string | null> | null;
    const attorneyName = profile?.full_name || '';
    const barNumber = profile?.bar_number || '';
    const firmName = profile?.firm_name || '';
    const firmAddress = profile?.firm_address || '';
    const firmCity = profile?.firm_city || '';
    const firmState = profile?.firm_state || 'LA';
    const firmZip = profile?.firm_zip || '';
    const firmPhone = profile?.firm_phone || '';
    const firmEmail = profile?.email || '';

    // Build formatted full address for signature blocks
    const firmFullAddress = [
      firmAddress,
      `${firmCity}, ${firmState} ${firmZip}`.trim()
    ].filter(Boolean).join('\n');

    // Extract document content
    const extractResult = await extractOrderDocuments(orderId);
    let rawDocumentText = '';

    if (extractResult.success && extractResult.data) {
      rawDocumentText = extractResult.data.documents
        .map(d => `=== ${d.fileName} ===\n${d.textContent}`)
        .join('\n\n');
    }

    // Get parsed documents (if they exist)
    const parsedResult = await getOrderParsedDocuments(orderId);
    const parsedDocs = parsedResult.success && parsedResult.data
      ? parsedResult.data.map(d => ({
          fileName: d.document_id, // We'd need to join with documents table for actual name
          documentType: d.document_type || 'unknown',
          summary: d.summary || '',
          keyFacts: d.key_facts || [],
          legalIssues: d.legal_issues || [],
        }))
      : [];

    const context: OrderContext = {
      orderId,
      orderNumber: order.order_number,

      // Case info
      motionType: order.motion_type || 'general',
      motionTier: normalizeMotionTier(order.motion_tier),
      jurisdiction: order.jurisdiction || 'Federal',
      courtDivision: order.court_division,
      caseNumber: order.case_number || '[CASE NUMBER]',
      caseCaption: order.case_caption || '[CASE CAPTION]',

      // Client narratives from checkout
      statementOfFacts: order.statement_of_facts || '',
      proceduralHistory: order.procedural_history || '',
      instructions: order.instructions || '',
      filingDeadline: order.filing_deadline,

      // Parties
      // NOTE: is_represented_party column removed from query (doesn't exist in DB)
      // To enable represented party detection, add column to Supabase:
      // ALTER TABLE parties ADD COLUMN is_represented_party BOOLEAN DEFAULT false;
      parties: (order.parties || []).map((p: { party_name: string; party_role: string }) => ({
        name: p.party_name,
        role: p.party_role,
        isRepresented: false, // Default until column added to DB
      })),

      // ATTORNEY INFO - For signature blocks
      attorneyName,
      barNumber,
      firmName,
      firmAddress,
      firmCity,
      firmState,
      firmZip,
      firmPhone,
      firmEmail,
      firmFullAddress,

      // Documents
      documents: {
        raw: rawDocumentText,
        parsed: parsedDocs,
      },
    };

    return { success: true, data: context };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to gather order context',
    };
  }
}

// ============================================================================
// SUPERPROMPT BUILDER
// ============================================================================

/**
 * Build the master prompt that combines all context for Claude
 * This is the "superprompt" that precisely instructs Claude on the legal task
 */
export function buildSuperprompt(context: SuperPromptContext): string {
  const { orderContext, motionTemplate, workflowPath } = context;

  const isOpposition = workflowPath === 'path_b';
  const motionTitle = isOpposition
    ? `Opposition to ${orderContext.motionType}`
    : orderContext.motionType;

  // Build party block
  const partyBlock = orderContext.parties
    .map(p => `- ${p.name} (${p.role})`)
    .join('\n');

  // Get template-specific guidance
  const templateGuidance = motionTemplate
    ? `
MOTION TEMPLATE GUIDANCE:
${motionTemplate.generationPrompts.systemContext}

Required Sections: ${motionTemplate.requiredSections.join(', ')}
Citation Requirements: Minimum ${motionTemplate.citationGuidance.minimumCitations} citations
Citation Style: ${motionTemplate.citationGuidance.citationStyle}
Specific Citation Guidance: ${motionTemplate.citationGuidance.specificGuidance}

Quality Criteria:
- Word Count: ${motionTemplate.qualityCriteria.minimumWordCount} - ${motionTemplate.qualityCriteria.maximumWordCount}
- Page Count: ${motionTemplate.qualityCriteria.minimumPageCount} - ${motionTemplate.qualityCriteria.maximumPageCount}
- Required Elements: ${motionTemplate.qualityCriteria.requiredElements.join('; ')}
- Style: ${motionTemplate.qualityCriteria.styleGuidelines.join('; ')}
`
    : '';

  // Build the superprompt
  return `You are an expert legal motion drafter. Your task is to produce a complete, court-ready ${motionTitle} motion.

═══════════════════════════════════════════════════════════════════════════════
CASE INFORMATION
═══════════════════════════════════════════════════════════════════════════════

Case Number: ${orderContext.caseNumber}
Case Caption: ${orderContext.caseCaption}
Court/Jurisdiction: ${orderContext.jurisdiction}${orderContext.courtDivision ? `, ${orderContext.courtDivision}` : ''}
Motion Type: ${motionTitle}
Filing Deadline: ${orderContext.filingDeadline || 'Not specified'}

PARTIES:
${partyBlock}

═══════════════════════════════════════════════════════════════════════════════
CLIENT-PROVIDED STATEMENT OF FACTS
═══════════════════════════════════════════════════════════════════════════════

${orderContext.statementOfFacts || '[No statement of facts provided]'}

═══════════════════════════════════════════════════════════════════════════════
PROCEDURAL HISTORY
═══════════════════════════════════════════════════════════════════════════════

${orderContext.proceduralHistory || '[No procedural history provided]'}

═══════════════════════════════════════════════════════════════════════════════
CLIENT INSTRUCTIONS & SPECIAL REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

${orderContext.instructions || '[No special instructions]'}

═══════════════════════════════════════════════════════════════════════════════
UPLOADED CASE DOCUMENTS
═══════════════════════════════════════════════════════════════════════════════

${orderContext.documents.raw || '[No documents uploaded]'}

${orderContext.documents.parsed.length > 0 ? `
DOCUMENT ANALYSIS SUMMARIES:
${orderContext.documents.parsed.map(d => `
--- ${d.documentType.toUpperCase()} ---
Summary: ${d.summary}
Key Facts: ${JSON.stringify(d.keyFacts)}
Legal Issues: ${JSON.stringify(d.legalIssues)}
`).join('\n')}
` : ''}

${templateGuidance}

═══════════════════════════════════════════════════════════════════════════════
DRAFTING INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════

1. ACCURACY: Use ONLY the facts provided. Do not fabricate or assume facts.
2. CITATIONS: Cite real, verified legal authority. Use Bluebook format.
3. JURISDICTION: Prioritize binding authority from ${orderContext.jurisdiction}.
4. TONE: Professional, persuasive, concise legal writing.
5. FORMAT: Standard court filing format with proper headings.
6. COMPLETENESS: Include all required sections per the template.
7. PLACEHOLDERS: If information is missing, use [PLACEHOLDER] format clearly.

CRITICAL REQUIREMENTS:
- Do NOT invent citations - use only verifiable legal authority
- Do NOT add facts not present in the provided materials
- DO follow the specific motion template structure
- DO address all legal elements required for this motion type
- DO make persuasive arguments grounded in cited authority`;
}

// ============================================================================
// WORKFLOW ORCHESTRATION
// ============================================================================

/**
 * Start and optionally run the complete workflow for an order
 * This is the main orchestration entry point
 *
 * PHASE ENFORCEMENT: This function enforces strict phase ordering.
 * Phases cannot be skipped. All required phases must complete in order.
 */
export async function orchestrateWorkflow(
  orderId: string,
  options: {
    autoRun?: boolean; // If true, runs all phases automatically
    workflowPath?: WorkflowPath;
    // NOTE: skipDocumentParsing has been REMOVED - phases cannot be skipped
  } = {}
): Promise<OperationResult<OrchestrationResult>> {
  const supabase = await createClient();

  console.log(`[ORCHESTRATOR] Starting workflow for order ${orderId}`);

  try {
    // Step 1: Gather all order context
    const contextResult = await gatherOrderContext(orderId);
    if (!contextResult.success || !contextResult.data) {
      return {
        success: false,
        error: contextResult.error || 'Failed to gather order context',
      };
    }

    const orderContext = contextResult.data;

    // Step 2: Parse documents - ALWAYS REQUIRED (no skip option)
    // Document parsing is part of Phase II and cannot be bypassed
    await parseOrderDocuments(orderId);
    // Refresh parsed docs in context
    const refreshedParsed = await getOrderParsedDocuments(orderId);
    if (refreshedParsed.success && refreshedParsed.data) {
      orderContext.documents.parsed = refreshedParsed.data.map(d => ({
        fileName: d.document_id,
        documentType: d.document_type || 'unknown',
        summary: d.summary || '',
        keyFacts: d.key_facts || [],
        legalIssues: d.legal_issues || [],
      }));
    }

    // Step 3: Determine motion type and get template
    const motionCode = mapMotionTypeToCode(orderContext.motionType, orderContext.motionTier);
    const workflowPath = options.workflowPath || 'path_a';
    const motionTemplate = getTemplateForPath(motionCode, workflowPath);

    // Step 4: Get or lookup motion type ID
    let motionTypeId: string | null = null;

    const { data: motionTypeData } = await supabase
      .from('motion_types')
      .select('id')
      .eq('code', motionCode)
      .single();

    if (motionTypeData) {
      motionTypeId = motionTypeData.id;
    } else {
      // Fallback to first motion type
      const { data: fallback } = await supabase
        .from('motion_types')
        .select('id')
        .limit(1)
        .single();

      if (fallback) {
        motionTypeId = fallback.id;
      }
    }

    if (!motionTypeId) {
      return {
        success: false,
        error: 'No motion types configured in database',
      };
    }

    // Step 5: Check if workflow already exists
    const { data: existingWorkflow } = await supabase
      .from('order_workflows')
      .select('id, status, current_phase')
      .eq('order_id', orderId)
      .single();

    let workflowId: string;

    if (existingWorkflow) {
      workflowId = existingWorkflow.id;
    } else {
      // Step 6: Get admin superprompt and merge with order context
      const templateResult = await getAdminSuperpromptTemplate();
      let superprompt: string;

      if (templateResult.success && templateResult.data) {
        // Use admin-editable superprompt merged with order context
        superprompt = mergeSuperpromptWithContext(templateResult.data.template, orderContext);
      } else {
        // Fall back to built-in superprompt builder
        superprompt = buildSuperprompt({
          orderContext,
          motionTemplate,
          workflowPath,
        });
      }

      // Step 7: Start the workflow
      const startResult = await startWorkflow({
        orderId,
        motionTypeId,
        workflowPath,
        metadata: {
          superprompt,
          orderContext: {
            caseNumber: orderContext.caseNumber,
            caseCaption: orderContext.caseCaption,
            jurisdiction: orderContext.jurisdiction,
            motionType: orderContext.motionType,
            motionTier: orderContext.motionTier,
          },
        },
      });

      if (!startResult.success || !startResult.data || !startResult.data.workflowId) {
        return {
          success: false,
          error: startResult.error || 'Failed to start workflow',
        };
      }

      workflowId = startResult.data.workflowId;
    }

    // Step 7: Update order status to in_progress
    await supabase
      .from('orders')
      .update({ status: 'in_progress' })
      .eq('id', orderId);

    // Step 8: Optionally run the workflow automatically
    if (options.autoRun) {
      const runResult = await runWorkflow(workflowId);

      if (!runResult.success) {
        return {
          success: false,
          error: runResult.error,
          data: {
            success: false,
            workflowId,
            status: 'failed',
            error: runResult.error,
          },
        };
      }

      const status = runResult.data?.status || 'in_progress';

      return {
        success: true,
        data: {
          success: true,
          workflowId,
          status: status as OrchestrationResult['status'],
          currentPhase: runResult.data?.currentPhase,
          message: runResult.data?.message,
        },
      };
    }

    // Return started state
    return {
      success: true,
      data: {
        success: true,
        workflowId,
        status: 'started',
        message: 'Workflow initialized. Call with autoRun: true to execute phases.',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Orchestration failed',
    };
  }
}

/**
 * Execute a single phase with full context injection
 */
export async function executePhaseWithContext(
  workflowId: string
): Promise<OperationResult<{ phaseNumber: number; status: string; outputs: unknown }>> {
  const supabase = await createClient();

  // Get workflow and order info
  const { data: workflow, error: wfError } = await supabase
    .from('order_workflows')
    .select('*, orders(*)')
    .eq('id', workflowId)
    .single();

  if (wfError || !workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // Gather fresh context
  const contextResult = await gatherOrderContext(workflow.order_id);
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: 'Failed to gather context' };
  }

  // Store context in workflow metadata for phase handlers to access
  await supabase
    .from('order_workflows')
    .update({
      metadata: {
        ...(workflow.metadata || {}),
        orderContext: contextResult.data,
        lastContextRefresh: new Date().toISOString(),
      },
    })
    .eq('id', workflowId);

  // Execute the phase
  const result = await executeCurrentPhase(workflowId);

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      phaseNumber: result.data.phaseNumber,
      status: result.data.status,
      outputs: result.data.outputs,
    },
  };
}

/**
 * Generate draft using superprompt
 *
 * @deprecated This function bypasses the 14-phase workflow and should NOT be used directly.
 * Use orchestrateWorkflow() with autoRun: true instead.
 *
 * PHASE ENFORCEMENT: This function now validates that prerequisites are met.
 * It will fail if called outside of proper workflow context.
 */
export async function generateDraftWithSuperprompt(
  orderId: string,
  workflowPath: WorkflowPath = 'path_a',
  options: { calledFromPhase?: string } = {}
): Promise<OperationResult<{ draft: string; tokensUsed?: number }>> {
  // Gather full context
  const contextResult = await gatherOrderContext(orderId);
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error };
  }

  const orderContext = contextResult.data;

  // Get template
  const motionCode = mapMotionTypeToCode(orderContext.motionType, orderContext.motionTier);
  const motionTemplate = getTemplateForPath(motionCode, workflowPath);

  // Build superprompt
  const superprompt = buildSuperprompt({
    orderContext,
    motionTemplate,
    workflowPath,
  });

  // Generate with Claude - MAXED OUT 128000 tokens for Opus 4.5
  const result = await askClaude({
    prompt: superprompt + '\n\nGenerate the complete motion document now:',
    maxTokens: 128000, // MAXED OUT - full motion, no truncation
    systemPrompt: 'You are an expert legal document drafter. Produce professional, court-ready legal documents.',
  });

  if (!result.success || !result.result) {
    return { success: false, error: result.error };
  }

  console.log(`[ORCHESTRATOR] Phase V draft generated for order ${orderId}`);

  return {
    success: true,
    data: {
      draft: result.result.content,
      tokensUsed: result.result.tokensUsed,
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map motion type string to template code
 */
function mapMotionTypeToCode(motionType: string, tier: MotionTier): string {
  const normalized = motionType.toUpperCase().replace(/\s+/g, '_');

  // Check if it's already a valid code
  if (MOTION_TEMPLATES[normalized]) {
    return normalized;
  }

  // Try common mappings
  const mappings: Record<string, string> = {
    'MOTION_TO_DISMISS': 'MTD_12B6',
    'DISMISS': 'MTD_12B6',
    '12B6': 'MTD_12B6',
    'SUMMARY_JUDGMENT': 'MSJ',
    'MSJ': 'MSJ',
    'MOTION_TO_COMPEL': 'MCOMPEL',
    'COMPEL': 'MCOMPEL',
    'COMPEL_DISCOVERY': 'MCOMPEL',
    'CONTINUE': 'MTC',
    'CONTINUANCE': 'MTC',
    'MOTION_TO_CONTINUE': 'MTC',
    'STRIKE': 'MSTRIKE',
    'MOTION_TO_STRIKE': 'MSTRIKE',
    'EXTENSION': 'MEXT',
    'EXTENSION_OF_TIME': 'MEXT',
    'PRO_HAC_VICE': 'MPRO_HAC',
  };

  if (mappings[normalized]) {
    return mappings[normalized];
  }

  // Default based on tier
  const tierDefaults: Record<MotionTier, string> = {
    'A': 'MTD_12B6',
    'B': 'MTC',
    'C': 'MEXT',
  };

  return tierDefaults[tier] || 'MTC';
}

/**
 * Get the admin-editable superprompt from the database
 * This is the master template that drives the 14-phase workflow
 */
export async function getAdminSuperpromptTemplate(): Promise<OperationResult<{ template: string; systemPrompt: string }>> {
  const supabase = getAdminClient();

  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  const { data, error } = await supabase
    .from('superprompt_templates')
    .select('template, system_prompt')
    .eq('is_default', true)
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || 'No default superprompt found. Configure one in Admin > Superprompt.' };
  }

  return {
    success: true,
    data: {
      template: data.template,
      systemPrompt: data.system_prompt || 'You are a legal motion generation system.',
    },
  };
}

/**
 * Merge the admin superprompt template with order context
 */
export function mergeSuperpromptWithContext(
  template: string,
  orderContext: OrderContext
): string {
  // Build party strings
  const plaintiffs = orderContext.parties.filter(p => p.role === 'plaintiff');
  const defendants = orderContext.parties.filter(p => p.role === 'defendant');
  const allPartiesFormatted = orderContext.parties
    .map(p => `${p.name} (${p.role})`)
    .join('\n');

  // Build document summaries
  const documentSummaries = orderContext.documents.parsed
    .map(d => `[${d.documentType.toUpperCase()}]\n${d.summary}`)
    .join('\n\n');

  // Extract key facts
  const keyFactsList = orderContext.documents.parsed
    .flatMap(d => (d.keyFacts as Array<{ fact: string }>).map(f => f.fact || String(f)))
    .map(f => `• ${f}`)
    .join('\n');

  // Extract legal issues
  const legalIssuesList = orderContext.documents.parsed
    .flatMap(d => (d.legalIssues as Array<{ issue: string }>).map(i => i.issue || String(i)))
    .map(i => `• ${i}`)
    .join('\n');

  // Replacement map
  const replacements: Record<string, string> = {
    '{{CASE_NUMBER}}': orderContext.caseNumber || '',
    '{{CASE_CAPTION}}': orderContext.caseCaption || '',
    '{{COURT}}': orderContext.jurisdiction || '',
    '{{JURISDICTION}}': orderContext.jurisdiction || '',
    '{{COURT_DIVISION}}': orderContext.courtDivision || '',
    '{{MOTION_TYPE}}': orderContext.motionType || '',
    '{{MOTION_TIER}}': orderContext.motionTier || 'B',
    '{{FILING_DEADLINE}}': orderContext.filingDeadline || 'Not specified',
    '{{ALL_PARTIES}}': allPartiesFormatted || '',
    '{{PLAINTIFF_NAMES}}': plaintiffs.map(p => p.name).join(', ') || 'N/A',
    '{{DEFENDANT_NAMES}}': defendants.map(p => p.name).join(', ') || 'N/A',
    '{{STATEMENT_OF_FACTS}}': orderContext.statementOfFacts || '[No statement of facts provided]',
    '{{PROCEDURAL_HISTORY}}': orderContext.proceduralHistory || '[No procedural history provided]',
    '{{CLIENT_INSTRUCTIONS}}': orderContext.instructions || '[No special instructions]',
    '{{DOCUMENT_CONTENT}}': orderContext.documents.raw || '[No documents uploaded]',
    '{{DOCUMENT_SUMMARIES}}': documentSummaries || '[No document summaries]',
    '{{KEY_FACTS}}': keyFactsList || '[No key facts extracted]',
    '{{LEGAL_ISSUES}}': legalIssuesList || '[No legal issues identified]',
    '{{ORDER_ID}}': orderContext.orderId || '',
    '{{ORDER_NUMBER}}': orderContext.orderNumber || '',
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

/**
 * Get current superprompt for a workflow
 * Uses the admin-editable template merged with order context
 */
export async function getWorkflowSuperprompt(workflowId: string): Promise<OperationResult<string>> {
  const supabase = await createClient();

  const { data: workflow, error } = await supabase
    .from('order_workflows')
    .select('order_id, workflow_path, metadata')
    .eq('id', workflowId)
    .single();

  if (error || !workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // Get the admin superprompt template
  const templateResult = await getAdminSuperpromptTemplate();
  if (!templateResult.success || !templateResult.data) {
    // Fall back to cached or built superprompt
    if (workflow.metadata?.superprompt) {
      return { success: true, data: workflow.metadata.superprompt as string };
    }
    return { success: false, error: templateResult.error };
  }

  // Get order context
  const contextResult = await gatherOrderContext(workflow.order_id);
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error };
  }

  // Merge template with context
  const superprompt = mergeSuperpromptWithContext(
    templateResult.data.template,
    contextResult.data
  );

  return { success: true, data: superprompt };
}
