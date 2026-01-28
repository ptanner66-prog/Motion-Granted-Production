/**
 * Superprompt Template Engine (Task 65)
 *
 * Assembles phase prompts with order context using template variables.
 *
 * Template variables:
 * - {{CASE_CAPTION}} — from Phase I
 * - {{MOTION_TYPE}} — from order
 * - {{JURISDICTION}} — from order
 * - {{FACTS_SUMMARY}} — from Phase I
 * - {{EVIDENCE_LIST}} — from Phase II
 * - {{CITATION_BANK}} — from Phase IV
 * - {{LEGAL_STANDARDS}} — from Phase III
 * - {{PREVIOUS_DRAFT}} — for revision phases
 * - {{GRADING_FEEDBACK}} — from Phase VII
 *
 * Source: Chunk 9, Task 65 - Gap Analysis B-3, CMS Section 20.4
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface SuperpromptContext {
  orderId: string;
  phase: string;
  tier: 'A' | 'B' | 'C';
  caseCaption: string;
  motionType: string;
  jurisdiction: string;
  factsSummary: string;
  evidenceList: string[];
  citationBank: string[];
  legalStandards?: string;
  previousDraft?: string;
  gradingFeedback?: string;
  customVariables?: Record<string, string>;
}

export interface ValidationResult {
  valid: boolean;
  missingVariables: string[];
  warnings: string[];
}

export interface PhasePromptTemplate {
  id: string;
  phase_code: string;
  template_name: string;
  system_prompt: string;
  user_prompt_template: string;
  motion_types: string[] | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// TEMPLATE VARIABLES
// ============================================================================

/**
 * All supported template variables
 */
export const TEMPLATE_VARIABLES = {
  // Core case info
  '{{CASE_CAPTION}}': 'Full case caption from Phase I',
  '{{MOTION_TYPE}}': 'Motion type from order',
  '{{JURISDICTION}}': 'Jurisdiction from order',

  // Phase I output
  '{{FACTS_SUMMARY}}': 'Fact summary extracted in Phase I',
  '{{PROCEDURAL_HISTORY}}': 'Procedural history from intake',
  '{{KEY_FACTS}}': 'Key facts identified in Phase I',

  // Phase II output
  '{{EVIDENCE_LIST}}': 'Evidence inventory from Phase II',
  '{{DOCUMENT_SUMMARIES}}': 'Document summaries from Phase II',

  // Phase III output
  '{{LEGAL_STANDARDS}}': 'Legal standards/elements from Phase III',
  '{{LEGAL_ISSUES}}': 'Legal issues identified in Phase III',

  // Phase IV output
  '{{CITATION_BANK}}': 'Verified citations from Phase IV',
  '{{BINDING_CITATIONS}}': 'Binding authority citations',
  '{{PERSUASIVE_CITATIONS}}': 'Persuasive authority citations',

  // Revision phases
  '{{PREVIOUS_DRAFT}}': 'Previous draft for revision',
  '{{GRADING_FEEDBACK}}': 'Grading feedback from Phase VII',
  '{{REVISION_INSTRUCTIONS}}': 'Specific revision instructions',

  // Metadata
  '{{ORDER_ID}}': 'Order ID',
  '{{ORDER_NUMBER}}': 'Order number',
  '{{TODAY_DATE}}': 'Current date',
  '{{TIER}}': 'Motion tier (A, B, C)',
  '{{PHASE}}': 'Current phase code',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get admin supabase client
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseKey);
}

/**
 * Format evidence list for template
 */
function formatEvidenceList(evidence: string[]): string {
  if (!evidence || evidence.length === 0) {
    return '[No evidence catalogued]';
  }

  return evidence.map((e, i) => `${i + 1}. ${e}`).join('\n');
}

/**
 * Format citation bank for template
 */
function formatCitationBank(citations: string[]): string {
  if (!citations || citations.length === 0) {
    return '[No citations in bank]';
  }

  return citations.map((c, i) => `[${i + 1}] ${c}`).join('\n');
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get phase template from database
 */
export async function getPhaseTemplate(phase: string): Promise<string> {
  const supabase = getAdminClient();

  if (!supabase) {
    throw new Error('Database not configured');
  }

  // Try to get template from phase_prompts table
  const { data, error } = await supabase
    .from('phase_prompts')
    .select('user_prompt_template')
    .eq('phase_code', phase)
    .eq('is_default', true)
    .single();

  if (error || !data) {
    // Fall back to superprompt_templates if phase_prompts doesn't exist
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('superprompt_templates')
      .select('template')
      .eq('is_default', true)
      .single();

    if (fallbackError || !fallbackData) {
      // Return a generic template
      return getDefaultPhaseTemplate(phase);
    }

    return fallbackData.template;
  }

  return data.user_prompt_template;
}

/**
 * Get default template for a phase
 */
function getDefaultPhaseTemplate(phase: string): string {
  const templates: Record<string, string> = {
    I: `Analyze the following case for {{MOTION_TYPE}} in {{JURISDICTION}}.

Case Caption: {{CASE_CAPTION}}

Statement of Facts:
{{FACTS_SUMMARY}}

Procedural History:
{{PROCEDURAL_HISTORY}}

Extract and organize key facts, identify parties, and summarize the case.`,

    II: `Review the evidence for {{CASE_CAPTION}}.

Motion Type: {{MOTION_TYPE}}
Key Facts: {{KEY_FACTS}}

Create an evidence inventory cataloging all exhibits and supporting documents.`,

    III: `Develop legal strategy for {{MOTION_TYPE}} in {{JURISDICTION}}.

Case Caption: {{CASE_CAPTION}}
Key Facts: {{FACTS_SUMMARY}}

Identify applicable legal standards, elements, and potential arguments.`,

    IV: `Build citation bank for {{MOTION_TYPE}} in {{JURISDICTION}}.

Legal Standards: {{LEGAL_STANDARDS}}
Legal Issues: {{LEGAL_ISSUES}}

Find and verify relevant case law, statutes, and regulations.`,

    V: `Draft the {{MOTION_TYPE}} for {{CASE_CAPTION}}.

Jurisdiction: {{JURISDICTION}}
Facts: {{FACTS_SUMMARY}}
Legal Standards: {{LEGAL_STANDARDS}}
Citation Bank: {{CITATION_BANK}}

Produce a complete, court-ready motion.`,

    VI: `Format the following draft for {{JURISDICTION}} court standards.

Motion Type: {{MOTION_TYPE}}
Previous Draft: {{PREVIOUS_DRAFT}}

Apply proper formatting, headers, and citations.`,

    VII: `Grade the following {{MOTION_TYPE}} draft.

Case Caption: {{CASE_CAPTION}}
Jurisdiction: {{JURISDICTION}}
Citation Bank: {{CITATION_BANK}}

Draft:
{{PREVIOUS_DRAFT}}

Evaluate quality on accuracy, completeness, citations, and formatting.`,

    'VII.1': `Revise the {{MOTION_TYPE}} based on grading feedback.

Original Draft:
{{PREVIOUS_DRAFT}}

Grading Feedback:
{{GRADING_FEEDBACK}}

{{REVISION_INSTRUCTIONS}}

Produce an improved draft addressing all issues.`,

    VIII: `Finalize the {{MOTION_TYPE}} for filing.

Jurisdiction: {{JURISDICTION}}
Draft: {{PREVIOUS_DRAFT}}

Apply final formatting and prepare for court submission.`,
  };

  return templates[phase] || `Execute phase ${phase} for {{MOTION_TYPE}} in {{JURISDICTION}}.`;
}

/**
 * Substitute variables in template
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string | string[]>
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = key.startsWith('{{') ? key : `{{${key}}}`;
    const stringValue = Array.isArray(value) ? value.join('\n') : value;
    result = result.split(placeholder).join(stringValue);
  }

  return result;
}

/**
 * Validate superprompt for missing variables
 */
export function validateSuperprompt(prompt: string): ValidationResult {
  const missingVariables: string[] = [];
  const warnings: string[] = [];

  // Find all remaining {{VARIABLE}} patterns
  const remainingVars = prompt.match(/\{\{[A-Z_0-9]+\}\}/g) || [];

  for (const varName of remainingVars) {
    if (TEMPLATE_VARIABLES[varName as keyof typeof TEMPLATE_VARIABLES]) {
      missingVariables.push(varName);
    } else {
      warnings.push(`Unknown variable: ${varName}`);
    }
  }

  // Check for common issues
  if (prompt.length < 100) {
    warnings.push('Prompt appears very short');
  }

  if (!prompt.includes('{{MOTION_TYPE}}') && !prompt.toLowerCase().includes('motion')) {
    warnings.push('Motion type not specified in prompt');
  }

  return {
    valid: missingVariables.length === 0,
    missingVariables,
    warnings,
  };
}

/**
 * Build complete superprompt from context
 */
export async function buildSuperprompt(
  context: SuperpromptContext
): Promise<string> {
  // Get the template for this phase
  let template: string;
  try {
    template = await getPhaseTemplate(context.phase);
  } catch {
    template = getDefaultPhaseTemplate(context.phase);
  }

  // Build variable map
  const variables: Record<string, string> = {
    // Core info
    '{{CASE_CAPTION}}': context.caseCaption,
    '{{MOTION_TYPE}}': context.motionType,
    '{{JURISDICTION}}': context.jurisdiction,
    '{{FACTS_SUMMARY}}': context.factsSummary,

    // Phase outputs
    '{{EVIDENCE_LIST}}': formatEvidenceList(context.evidenceList),
    '{{CITATION_BANK}}': formatCitationBank(context.citationBank),
    '{{LEGAL_STANDARDS}}': context.legalStandards || '[Not yet determined]',

    // Revision context
    '{{PREVIOUS_DRAFT}}': context.previousDraft || '[No previous draft]',
    '{{GRADING_FEEDBACK}}': context.gradingFeedback || '[No feedback]',
    '{{REVISION_INSTRUCTIONS}}': 'Address all issues identified in grading feedback.',

    // Metadata
    '{{ORDER_ID}}': context.orderId,
    '{{ORDER_NUMBER}}': context.orderId.slice(0, 8),
    '{{TODAY_DATE}}': new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    '{{TIER}}': context.tier,
    '{{PHASE}}': context.phase,

    // Legacy variables for compatibility
    '{{KEY_FACTS}}': context.factsSummary,
    '{{PROCEDURAL_HISTORY}}': context.factsSummary,
    '{{LEGAL_ISSUES}}': context.legalStandards || '[Not yet determined]',
    '{{DOCUMENT_SUMMARIES}}': formatEvidenceList(context.evidenceList),
    '{{BINDING_CITATIONS}}': formatCitationBank(context.citationBank),
    '{{PERSUASIVE_CITATIONS}}': '[See citation bank]',
  };

  // Add custom variables
  if (context.customVariables) {
    for (const [key, value] of Object.entries(context.customVariables)) {
      variables[`{{${key.toUpperCase()}}}`] = value;
    }
  }

  // Substitute variables
  const result = substituteVariables(template, variables);

  return result;
}

/**
 * Load workflow state and build context
 */
export async function buildContextFromWorkflowState(
  orderId: string,
  phase: string
): Promise<SuperpromptContext | null> {
  const supabase = getAdminClient();

  if (!supabase) {
    return null;
  }

  // Get order and workflow state
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, order_workflow_state(*)')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return null;
  }

  const workflowState = order.order_workflow_state?.[0] || {};

  // Extract data from workflow state
  const phaseIData = (workflowState.phase_i_output as Record<string, unknown>) || {};
  const phaseIIData = (workflowState.phase_ii_output as Record<string, unknown>) || {};
  const phaseIIIData = (workflowState.phase_iii_output as Record<string, unknown>) || {};
  const phaseIVData = (workflowState.phase_iv_output as Record<string, unknown>) || {};
  const phaseVIIData = (workflowState.phase_vii_output as Record<string, unknown>) || {};

  // Build context
  return {
    orderId,
    phase,
    tier: (workflowState.current_tier as 'A' | 'B' | 'C') || 'B',
    caseCaption: (phaseIData.caseCaption as string) || order.case_caption || '',
    motionType: order.motion_type || '',
    jurisdiction: order.jurisdiction || '',
    factsSummary: (phaseIData.factsSummary as string) || order.statement_of_facts || '',
    evidenceList: (phaseIIData.evidence as string[]) || [],
    citationBank: (phaseIVData.citations as string[]) || [],
    legalStandards: (phaseIIIData.legalStandards as string) || undefined,
    previousDraft: (workflowState.current_draft as string) || undefined,
    gradingFeedback: (phaseVIIData.feedback as string) || undefined,
  };
}

/**
 * Build and validate superprompt from workflow state
 */
export async function buildSuperpromptFromOrder(
  orderId: string,
  phase: string
): Promise<{
  prompt: string;
  validation: ValidationResult;
  context: SuperpromptContext;
} | null> {
  const context = await buildContextFromWorkflowState(orderId, phase);

  if (!context) {
    return null;
  }

  const prompt = await buildSuperprompt(context);
  const validation = validateSuperprompt(prompt);

  return {
    prompt,
    validation,
    context,
  };
}
