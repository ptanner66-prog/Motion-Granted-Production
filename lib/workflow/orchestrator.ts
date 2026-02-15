/**
 * @deprecated This file is the original workflow orchestrator, superseded by
 * lib/inngest/workflow-orchestration.ts for all execution logic.
 * See: AUD-006, CGA6-037 in Clay's audit.
 *
 * Active imports still exist — DO NOT DELETE until imports are migrated:
 * - lib/inngest/workflow-orchestration.ts (gatherOrderContext, OrderContext type)
 * - lib/workflow/index.ts (re-exports gatherOrderContext, buildOrderSuperprompt,
 *   initializeWorkflow, orchestrateWorkflow, getWorkflowSuperprompt,
 *   OrderContext, SuperPromptContext, OrchestrationResult types)
 * - lib/workflow/superprompt-engine.ts (gatherOrderContext)
 *
 * Only active export: gatherOrderContext() and related types.
 * Everything else (executePhaseWithContext, orchestrateWorkflow, etc.) is dead code.
 * Migration plan: Move gatherOrderContext to lib/workflow/context-builder.ts, then delete.
 *
 * Workflow Orchestrator (LEGACY)
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
import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-orchestrator');
import { extractOrderDocuments, getCombinedDocumentText } from './document-extractor';
import { parseOrderDocuments, getOrderParsedDocuments } from './document-parser';
import { startWorkflow } from './workflow-state';
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
 * Normalize motion tier to letter format (A, B, C, D).
 * Database may store as numeric (0/1/2/3/4) or letter - this ensures letter output.
 *
 * Mapping: 0→A, 1→A, 2→B, 3→C, 4→D (0 treated as A for safety)
 * Already-letter values pass through unchanged.
 *
 * P0 FIX: THROWS on unknown tiers instead of silently defaulting to 'B'.
 * Silent defaults caused Tier D ($1,499) motions to be processed as Tier B ($599).
 */
function normalizeMotionTier(tier: unknown): MotionTier {
  // If already a valid letter, return it
  if (tier === 'A' || tier === 'B' || tier === 'C' || tier === 'D') {
    return tier;
  }

  // Convert numeric to letter
  if (typeof tier === 'number') {
    if (tier === 1 || tier === 0) return 'A';
    if (tier === 2) return 'B';
    if (tier === 3) return 'C';
    if (tier === 4) return 'D';
  }

  // Handle string numbers and lowercase letters
  if (typeof tier === 'string') {
    if (tier === '1' || tier === '0') return 'A';
    if (tier === '2') return 'B';
    if (tier === '3') return 'C';
    if (tier === '4') return 'D';
    // Check for lowercase letters
    const upper = tier.toUpperCase();
    if (upper === 'A' || upper === 'B' || upper === 'C' || upper === 'D') {
      return upper as MotionTier;
    }
  }

  // P0 FIX: THROW instead of defaulting. Silent defaults are how
  // Tier D motions get processed as Tier B, costing $900 per incident.
  throw new Error(
    `[TIER_NORMALIZATION] Unknown tier value: ${JSON.stringify(tier)}. ` +
    `Valid tiers are A, B, C, D (or numeric 0-4). ` +
    `This error prevents silent misrouting of orders.`
  );
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
  firmPhone: string;
  firmEmail: string;

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
    const firmPhone = profile?.firm_phone || '';
    const firmEmail = profile?.email || '';

    // Warn if critical attorney fields are empty
    const missingFields = [];
    if (!barNumber) missingFields.push('bar_number');
    if (!firmName) missingFields.push('firm_name');
    if (!firmAddress) missingFields.push('firm_address');
    if (missingFields.length > 0) {
      log.warn('Missing attorney profile fields, signature block will be incomplete', { missingFields, clientId: order.client_id });
    }

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
      firmPhone,
      firmEmail,

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
export function buildOrderSuperprompt(context: SuperPromptContext): string {
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
 * @deprecated SP8: This function is PERMANENTLY DISABLED.
 * All workflow execution MUST go through Inngest via inngest.send("order/submitted").
 * See: lib/workflow/automation-service.ts for the correct entry point.
 *
 * This function existed as the pre-Inngest orchestration path.
 * It was disabled in SP7 (Feb 2026) when all callers were migrated to Inngest.
 * The function body was removed in SP8 to prevent accidental use.
 */
/**
 * Initialize a workflow record for an order.
 *
 * Gathers order context, parses documents, creates the DB workflow record,
 * updates order status, and fires a confirmation email.
 *
 * Callers are responsible for firing the Inngest "order/submitted" event
 * after this returns successfully.
 */
export async function initializeWorkflow(
  orderId: string,
  options: {
    workflowPath?: WorkflowPath;
  } = {}
): Promise<OperationResult<OrchestrationResult>> {
  const supabase = await createClient();

  log.info('Initializing workflow', { orderId });

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

    // Step 2: Parse documents (always required)
    await parseOrderDocuments(orderId);
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

    // Step 4: Lookup motion type ID
    let motionTypeId: string | null = null;

    const { data: motionTypeData } = await supabase
      .from('motion_types')
      .select('id')
      .eq('code', motionCode)
      .single();

    if (motionTypeData) {
      motionTypeId = motionTypeData.id;
    } else {
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
      // Step 6: Build superprompt and start workflow
      const superprompt = buildOrderSuperprompt({
        orderContext,
        motionTemplate,
        workflowPath,
      });

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

    // Step 7: Update order status
    await supabase
      .from('orders')
      .update({ status: 'in_progress' })
      .eq('id', orderId);

    // Fire-and-forget confirmation email
    notifyWorkflowEvent('order_confirmed', orderId).catch(err => log.warn('Order confirmation notification failed', { error: err instanceof Error ? err.message : String(err) }));

    return {
      success: true,
      data: {
        success: true,
        workflowId,
        status: 'started',
        message: 'Workflow initialized. Fire "order/submitted" Inngest event to begin execution.',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Initialization failed',
    };
  }
}

/**
 * @deprecated REMOVED — Use initializeWorkflow() + Inngest "order/submitted" event instead.
 * This function is retained for export compatibility only. It always returns failure.
 */
export async function orchestrateWorkflow(
  _orderId: string,
  _options: {
    autoRun?: boolean;
    workflowPath?: WorkflowPath;
  } = {}
): Promise<OperationResult<OrchestrationResult>> {
  log.error('orchestrateWorkflow() is DEPRECATED. Use initializeWorkflow() + Inngest event.');
  return {
    success: false,
    error: 'DEPRECATED: orchestrateWorkflow() has been removed. Use initializeWorkflow() + Inngest event.',
  };
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

  // Phase execution is handled exclusively by the Inngest pipeline.
  // This function now only refreshes context; actual execution is triggered
  // via the "order/submitted" Inngest event.
  return {
    success: false,
    error: 'Direct phase execution is no longer supported. Use the Inngest pipeline (order/submitted event) to execute phases.',
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
    'D': 'MSJ',
  };

  return tierDefaults[tier] || 'MTC';
}

/**
 * @deprecated REMOVED — DB-driven superprompt template loading has been removed from the execution path.
 * The admin dashboard reads superprompt_templates directly via its own API routes.
 * Actual phase prompts are loaded from /prompts/PHASE_*_v75.md via phase-executors.ts.
 */

/**
 * @deprecated REMOVED — DB-driven superprompt merging has been removed from the execution path.
 * Actual phase prompts are loaded from /prompts/PHASE_*_v75.md via phase-executors.ts.
 */

/**
 * Get current superprompt for a workflow (admin preview)
 * Returns the cached superprompt from workflow metadata or builds one from order context.
 * NOTE: Actual phase prompts are loaded from /prompts/PHASE_*_v75.md via phase-executors.ts.
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

  // Return cached superprompt from workflow metadata if available
  if (workflow.metadata?.superprompt) {
    return { success: true, data: workflow.metadata.superprompt as string };
  }

  // Build superprompt from order context for preview
  const contextResult = await gatherOrderContext(workflow.order_id);
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error };
  }

  const workflowPath = (workflow.workflow_path || 'path_a') as WorkflowPath;
  const motionCode = mapMotionTypeToCode(contextResult.data.motionType, contextResult.data.motionTier);
  const motionTemplate = getTemplateForPath(motionCode, workflowPath);

  const superprompt = buildOrderSuperprompt({
    orderContext: contextResult.data,
    motionTemplate,
    workflowPath,
  });

  return { success: true, data: superprompt };
}

// ============================================================================
// EMAIL TRIGGER INTEGRATION
// ============================================================================

/**
 * Phase-to-email event mapping.
 * Called after a phase completes to send progress/milestone emails.
 */
const PHASE_EMAIL_MAP: Record<string, string> = {
  'V.1': 'research_complete',
  'VII': 'draft_reviewed',
  'X': 'documents_ready',
};

/**
 * Notify a workflow event via email.
 * Fire-and-forget — never throws, never blocks the workflow.
 *
 * @param event - The workflow event name (e.g., 'order_confirmed', 'hold_created')
 * @param orderId - The order ID
 */
export async function notifyWorkflowEvent(
  event: string,
  orderId: string
): Promise<void> {
  try {
    const { triggerEmail } = await import('../integration/email-triggers');
    const { createClient: createSbClient } = await import('@supabase/supabase-js');
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!sbUrl || !sbKey) {
      log.warn('Email trigger skipped, no Supabase creds', { event });
      return;
    }

    const adminClient = createSbClient(sbUrl, sbKey);
    triggerEmail(adminClient, event as Parameters<typeof triggerEmail>[1], orderId).catch(err =>
      log.error('Email trigger failed', { orderId, event, error: err instanceof Error ? err.message : String(err) })
    );
  } catch (err) {
    log.error('Email trigger import failed', { orderId, event, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Called after a phase completes to trigger phase-specific emails.
 * Maps phases to workflow events and fires the email trigger.
 *
 * Safe to call from phase-executor.ts or workflow-engine.ts.
 */
export function notifyPhaseComplete(phase: string, orderId: string): void {
  const event = PHASE_EMAIL_MAP[phase];
  if (!event) return;
  notifyWorkflowEvent(event, orderId).catch(err => log.warn('Phase notification failed', { event, error: err instanceof Error ? err.message : String(err) }));
}
