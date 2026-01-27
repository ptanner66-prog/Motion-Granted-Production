/**
 * SUPERPROMPT ENGINE
 *
 * This module handles merging your lawyer's superprompt with order data.
 *
 * Your lawyer has a proven superprompt that works in Claude chat.
 * This engine:
 * 1. Takes the superprompt template (stored in DB or config)
 * 2. Merges in all checkout data + uploaded documents
 * 3. Sends to Claude API
 * 4. Returns the complete motion
 *
 * The superprompt template uses placeholders like:
 * {{CASE_NUMBER}}, {{STATEMENT_OF_FACTS}}, {{DOCUMENT_CONTENT}}, etc.
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { generateMotion, MOTION_MAX_TOKENS } from '@/lib/automation/claude';
import { gatherOrderContext } from './orchestrator';
import type { OperationResult } from '@/types/automation';

// Create admin client with service role key (bypasses RLS for reading superprompt templates)
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

export interface SuperpromptTemplate {
  id: string;
  name: string;
  description: string;
  motionTypes: string[]; // Which motion types this template handles
  template: string; // The actual superprompt with {{PLACEHOLDERS}}
  systemPrompt?: string; // Optional system prompt for Claude
  maxTokens?: number;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MergedSuperprompt {
  finalPrompt: string;
  systemPrompt: string;
  placeholdersReplaced: string[];
  placeholdersMissing: string[];
  orderContext: OrderData;
}

export interface OrderData {
  // Case identifiers
  caseNumber: string;
  caseCaption: string;
  court: string;
  jurisdiction: string;
  courtDivision: string;

  // Motion info
  motionType: string;
  motionTier: string;
  filingDeadline: string;

  // Parties
  parties: Array<{ name: string; role: string }>;
  plaintiffNames: string;
  defendantNames: string;
  allPartyNames: string;

  // Client-provided content from checkout
  statementOfFacts: string;
  proceduralHistory: string;
  clientInstructions: string;

  // Uploaded documents
  documentContent: string; // All document text combined
  documentSummaries: string; // Parsed summaries
  keyFacts: string; // Extracted key facts
  legalIssues: string; // Identified legal issues

  // Order metadata
  orderId: string;
  orderNumber: string;
  clientName: string;
  clientEmail: string;

  // Attorney information (from client profile)
  attorneyName: string;
  barNumber: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
}

export interface GenerationResult {
  success: boolean;
  motion?: string;
  wordCount?: number;
  tokensUsed?: number;
  error?: string;
}

// ============================================================================
// AVAILABLE PLACEHOLDERS
// ============================================================================

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum characters for document content to avoid exceeding Claude's context
 * Claude-3 has ~200k tokens, but we leave room for the prompt and response
 * ~400k chars ≈ 100k tokens, leaving plenty for prompt + response
 */
const MAX_DOCUMENT_CONTENT_CHARS = 400000;
const MAX_PER_DOCUMENT_CHARS = 100000; // Max chars per individual document
const TRUNCATION_MESSAGE = '\n\n[... Document truncated for length. Full content available in uploaded files ...]';

/**
 * Truncate text to a maximum length with a helpful message
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength - TRUNCATION_MESSAGE.length) + TRUNCATION_MESSAGE;
}

/**
 * All available placeholders that can be used in a superprompt template.
 * Document these for your lawyer when they create the superprompt.
 */
export const AVAILABLE_PLACEHOLDERS = {
  // Case Information
  '{{CASE_NUMBER}}': 'Case number (e.g., "2:24-cv-01234")',
  '{{CASE_CAPTION}}': 'Full case caption',
  '{{COURT}}': 'Court name',
  '{{JURISDICTION}}': 'Jurisdiction (e.g., "Central District of California")',
  '{{COURT_DIVISION}}': 'Court division if applicable',

  // Motion Details
  '{{MOTION_TYPE}}': 'Type of motion being drafted',
  '{{MOTION_TIER}}': 'Complexity tier (A, B, or C)',
  '{{FILING_DEADLINE}}': 'Filing deadline date',

  // Parties
  '{{ALL_PARTIES}}': 'All parties with roles, formatted list',
  '{{PLAINTIFF_NAMES}}': 'Comma-separated plaintiff names',
  '{{DEFENDANT_NAMES}}': 'Comma-separated defendant names',
  '{{PARTIES_JSON}}': 'JSON array of all parties with names and roles',

  // Client-Provided Content (from checkout form)
  '{{STATEMENT_OF_FACTS}}': 'Client\'s statement of facts from intake form',
  '{{PROCEDURAL_HISTORY}}': 'Client\'s procedural history from intake form',
  '{{CLIENT_INSTRUCTIONS}}': 'Special instructions from client',

  // Uploaded Documents
  '{{DOCUMENT_CONTENT}}': 'Full text extracted from all uploaded documents',
  '{{DOCUMENT_SUMMARIES}}': 'AI-generated summaries of each document',
  '{{KEY_FACTS}}': 'Key facts extracted from documents',
  '{{LEGAL_ISSUES}}': 'Legal issues identified from documents',

  // Metadata
  '{{ORDER_ID}}': 'Internal order ID',
  '{{ORDER_NUMBER}}': 'Human-readable order number',
  '{{CLIENT_NAME}}': 'Client name',
  '{{TODAY_DATE}}': 'Today\'s date formatted',
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Gather all order data for placeholder replacement
 */
export async function gatherOrderData(orderId: string): Promise<OperationResult<OrderData>> {
  try {
    // Use the existing orchestrator to gather context
    const contextResult = await gatherOrderContext(orderId);

    if (!contextResult.success || !contextResult.data) {
      return { success: false, error: contextResult.error };
    }

    const ctx = contextResult.data;

    // Get client profile using admin client to bypass RLS
    const supabase = getAdminClient();
    if (!supabase) {
      return { success: false, error: 'Database not configured' };
    }
    const { data: order } = await supabase
      .from('orders')
      .select('*, profiles(full_name, email, bar_number, firm_name, firm_address, firm_phone)')
      .eq('id', orderId)
      .single();

    // Format parties
    const plaintiffs = ctx.parties.filter(p => p.role === 'plaintiff');
    const defendants = ctx.parties.filter(p => p.role === 'defendant');

    const allPartiesFormatted = ctx.parties
      .map(p => `${p.name} (${p.role})`)
      .join('\n');

    // Format document summaries
    const documentSummaries = ctx.documents.parsed
      .map(d => `[${d.documentType.toUpperCase()}]\n${d.summary}`)
      .join('\n\n');

    // Extract key facts from parsed docs
    const keyFactsList = ctx.documents.parsed
      .flatMap(d => (d.keyFacts as Array<{ fact: string }>).map(f => f.fact))
      .map(f => `• ${f}`)
      .join('\n');

    // Extract legal issues
    const legalIssuesList = ctx.documents.parsed
      .flatMap(d => (d.legalIssues as Array<{ issue: string }>).map(i => i.issue))
      .map(i => `• ${i}`)
      .join('\n');

    // Truncate document content to fit within Claude's context window
    // This ensures we don't exceed limits even with many large documents
    const rawDocumentContent = ctx.documents.raw || '[No documents uploaded]';
    const truncatedDocumentContent = truncateContent(rawDocumentContent, MAX_DOCUMENT_CONTENT_CHARS);

    const orderData: OrderData = {
      // Case info
      caseNumber: ctx.caseNumber,
      caseCaption: ctx.caseCaption,
      court: ctx.jurisdiction,
      jurisdiction: ctx.jurisdiction,
      courtDivision: ctx.courtDivision || '',

      // Motion info
      motionType: ctx.motionType,
      motionTier: ctx.motionTier,
      filingDeadline: ctx.filingDeadline || 'Not specified',

      // Parties
      parties: ctx.parties,
      plaintiffNames: plaintiffs.map(p => p.name).join(', ') || 'N/A',
      defendantNames: defendants.map(p => p.name).join(', ') || 'N/A',
      allPartyNames: allPartiesFormatted,

      // Client content from checkout
      statementOfFacts: ctx.statementOfFacts || '[No statement of facts provided]',
      proceduralHistory: ctx.proceduralHistory || '[No procedural history provided]',
      clientInstructions: ctx.instructions || '[No special instructions]',

      // Documents (truncated to fit context window)
      documentContent: truncatedDocumentContent,
      documentSummaries: documentSummaries || '[No document summaries available]',
      keyFacts: keyFactsList || '[No key facts extracted]',
      legalIssues: legalIssuesList || '[No legal issues identified]',

      // Metadata
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      clientName: order?.profiles?.full_name || 'Client',
      clientEmail: order?.profiles?.email || '',

      // Attorney information
      attorneyName: order?.profiles?.full_name || '[Attorney Name]',
      barNumber: order?.profiles?.bar_number || '[Bar Number]',
      firmName: order?.profiles?.firm_name || '[Law Firm]',
      firmAddress: order?.profiles?.firm_address || '[Address]',
      firmPhone: order?.profiles?.firm_phone || '[Phone]',
    };

    return { success: true, data: orderData };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to gather order data',
    };
  }
}

/**
 * Merge a superprompt template with order data
 */
export function mergeSuperprompt(
  template: string,
  orderData: OrderData,
  systemPrompt?: string
): MergedSuperprompt {
  const placeholdersReplaced: string[] = [];
  const placeholdersMissing: string[] = [];

  // Build replacement map
  const replacements: Record<string, string> = {
    '{{CASE_NUMBER}}': orderData.caseNumber,
    '{{CASE_CAPTION}}': orderData.caseCaption,
    '{{COURT}}': orderData.court,
    '{{JURISDICTION}}': orderData.jurisdiction,
    '{{COURT_DIVISION}}': orderData.courtDivision,
    '{{MOTION_TYPE}}': orderData.motionType,
    '{{MOTION_TIER}}': orderData.motionTier,
    '{{FILING_DEADLINE}}': orderData.filingDeadline,
    '{{ALL_PARTIES}}': orderData.allPartyNames,
    '{{PLAINTIFF_NAMES}}': orderData.plaintiffNames,
    '{{DEFENDANT_NAMES}}': orderData.defendantNames,
    '{{PARTIES_JSON}}': JSON.stringify(orderData.parties, null, 2),
    '{{STATEMENT_OF_FACTS}}': orderData.statementOfFacts,
    '{{PROCEDURAL_HISTORY}}': orderData.proceduralHistory,
    '{{CLIENT_INSTRUCTIONS}}': orderData.clientInstructions,
    '{{DOCUMENT_CONTENT}}': orderData.documentContent,
    '{{DOCUMENT_SUMMARIES}}': orderData.documentSummaries,
    '{{KEY_FACTS}}': orderData.keyFacts,
    '{{LEGAL_ISSUES}}': orderData.legalIssues,
    '{{ORDER_ID}}': orderData.orderId,
    '{{ORDER_NUMBER}}': orderData.orderNumber,
    '{{CLIENT_NAME}}': orderData.clientName,
    '{{TODAY_DATE}}': new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };

  // Replace placeholders
  let finalPrompt = template;

  for (const [placeholder, value] of Object.entries(replacements)) {
    if (finalPrompt.includes(placeholder)) {
      finalPrompt = finalPrompt.split(placeholder).join(value);
      placeholdersReplaced.push(placeholder);
    }
  }

  // Check for any remaining unreplaced placeholders
  const remainingPlaceholders = finalPrompt.match(/\{\{[A-Z_]+\}\}/g) || [];
  placeholdersMissing.push(...remainingPlaceholders);

  return {
    finalPrompt,
    systemPrompt: systemPrompt || 'You are an expert legal motion drafter. Produce professional, court-ready legal documents.',
    placeholdersReplaced,
    placeholdersMissing,
    orderContext: orderData,
  };
}

/**
 * Execute the superprompt with Claude Opus and get the motion
 * Uses streaming for long-form content generation
 */
export async function executeSuperprompt(
  merged: MergedSuperprompt,
  options: { maxTokens?: number; onProgress?: (text: string) => void } = {}
): Promise<GenerationResult> {
  // Use the new Opus-powered generation with high token limits
  const result = await generateMotion({
    systemPrompt: merged.systemPrompt,
    userPrompt: merged.finalPrompt,
    maxOutputTokens: options.maxTokens || MOTION_MAX_TOKENS,
    onProgress: options.onProgress,
  });

  if (!result.success || !result.content) {
    return { success: false, error: result.error || 'Failed to generate motion' };
  }

  const motion = result.content;
  const wordCount = motion.split(/\s+/).length;

  return {
    success: true,
    motion,
    wordCount,
    tokensUsed: result.tokensUsed ? result.tokensUsed.input + result.tokensUsed.output : undefined,
  };
}

/**
 * Full pipeline: Gather data → Merge → Execute → Return motion
 */
export async function generateMotionWithSuperprompt(
  orderId: string,
  superpromptTemplate: string,
  options: {
    systemPrompt?: string;
    maxTokens?: number;
  } = {}
): Promise<OperationResult<{
  motion: string;
  wordCount: number;
  tokensUsed?: number;
  mergeInfo: {
    placeholdersReplaced: string[];
    placeholdersMissing: string[];
  };
}>> {
  // 1. Gather all order data
  const dataResult = await gatherOrderData(orderId);
  if (!dataResult.success || !dataResult.data) {
    return { success: false, error: dataResult.error };
  }

  // 2. Merge superprompt with data
  const merged = mergeSuperprompt(
    superpromptTemplate,
    dataResult.data,
    options.systemPrompt
  );

  // Log if there are missing placeholders
  if (merged.placeholdersMissing.length > 0) {
    console.warn('Superprompt has unrecognized placeholders:', merged.placeholdersMissing);
  }

  // 3. Execute with Claude
  const generationResult = await executeSuperprompt(merged, {
    maxTokens: options.maxTokens,
  });

  if (!generationResult.success || !generationResult.motion) {
    return { success: false, error: generationResult.error };
  }

  return {
    success: true,
    data: {
      motion: generationResult.motion,
      wordCount: generationResult.wordCount || 0,
      tokensUsed: generationResult.tokensUsed,
      mergeInfo: {
        placeholdersReplaced: merged.placeholdersReplaced,
        placeholdersMissing: merged.placeholdersMissing,
      },
    },
  };
}

// ============================================================================
// SUPERPROMPT TEMPLATE STORAGE
// ============================================================================

/**
 * Save a superprompt template to the database
 */
export async function saveSuperpromptTemplate(
  template: Omit<SuperpromptTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<OperationResult<SuperpromptTemplate>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('superprompt_templates')
    .insert({
      name: template.name,
      description: template.description,
      motion_types: template.motionTypes,
      template: template.template,
      system_prompt: template.systemPrompt,
      max_tokens: template.maxTokens || 16000,
      is_default: template.isDefault || false,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      id: data.id,
      name: data.name,
      description: data.description,
      motionTypes: data.motion_types,
      template: data.template,
      systemPrompt: data.system_prompt,
      maxTokens: data.max_tokens,
      isDefault: data.is_default,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * Get superprompt template for a motion type
 * Uses service role client to bypass RLS (templates need to be read server-side)
 */
export async function getSuperpromptTemplate(
  motionType?: string
): Promise<OperationResult<SuperpromptTemplate>> {
  // Use admin client to bypass RLS (API routes may not have user session)
  const supabase = getAdminClient();

  if (!supabase) {
    console.error('Supabase not configured - missing URL or service role key');
    return { success: false, error: 'Database not configured. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.' };
  }

  let query = supabase.from('superprompt_templates').select('*');

  if (motionType) {
    // Look for template that handles this motion type
    query = query.contains('motion_types', [motionType]);
  } else {
    // Get default template
    query = query.eq('is_default', true);
  }

  const { data, error } = await query.single();

  if (error) {
    console.error('Error fetching superprompt template:', error);
    // If no specific template found, try to get default
    if (motionType) {
      return getSuperpromptTemplate(); // Recursively get default
    }
    return { success: false, error: `No superprompt template found: ${error.message}` };
  }

  return {
    success: true,
    data: {
      id: data.id,
      name: data.name,
      description: data.description,
      motionTypes: data.motion_types,
      template: data.template,
      systemPrompt: data.system_prompt,
      maxTokens: data.max_tokens,
      isDefault: data.is_default,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * Generate motion using stored template
 */
export async function generateMotionFromStoredTemplate(
  orderId: string,
  motionType?: string
): Promise<OperationResult<{
  motion: string;
  wordCount: number;
  templateUsed: string;
}>> {
  // Get template
  const templateResult = await getSuperpromptTemplate(motionType);
  if (!templateResult.success || !templateResult.data) {
    return { success: false, error: templateResult.error };
  }

  const template = templateResult.data;

  // Generate motion
  const result = await generateMotionWithSuperprompt(orderId, template.template, {
    systemPrompt: template.systemPrompt,
    maxTokens: template.maxTokens,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      motion: result.data.motion,
      wordCount: result.data.wordCount,
      templateUsed: template.name,
    },
  };
}

// ============================================================================
// EXAMPLE/DEFAULT TEMPLATE (for testing before lawyer provides theirs)
// ============================================================================

export const EXAMPLE_SUPERPROMPT_TEMPLATE = `
You are an expert litigation attorney drafting a {{MOTION_TYPE}} for federal court.

═══════════════════════════════════════════════════════════════════════════════
CASE INFORMATION
═══════════════════════════════════════════════════════════════════════════════

Case Number: {{CASE_NUMBER}}
Case Caption: {{CASE_CAPTION}}
Court: {{COURT}}
Jurisdiction: {{JURISDICTION}}
Filing Deadline: {{FILING_DEADLINE}}

PARTIES:
{{ALL_PARTIES}}

═══════════════════════════════════════════════════════════════════════════════
CLIENT'S STATEMENT OF FACTS
(Use this as the foundation - do not fabricate additional facts)
═══════════════════════════════════════════════════════════════════════════════

{{STATEMENT_OF_FACTS}}

═══════════════════════════════════════════════════════════════════════════════
PROCEDURAL HISTORY
═══════════════════════════════════════════════════════════════════════════════

{{PROCEDURAL_HISTORY}}

═══════════════════════════════════════════════════════════════════════════════
UPLOADED CASE DOCUMENTS
(Full text extracted from client's uploads)
═══════════════════════════════════════════════════════════════════════════════

{{DOCUMENT_CONTENT}}

═══════════════════════════════════════════════════════════════════════════════
KEY FACTS IDENTIFIED FROM DOCUMENTS
═══════════════════════════════════════════════════════════════════════════════

{{KEY_FACTS}}

═══════════════════════════════════════════════════════════════════════════════
LEGAL ISSUES IDENTIFIED
═══════════════════════════════════════════════════════════════════════════════

{{LEGAL_ISSUES}}

═══════════════════════════════════════════════════════════════════════════════
CLIENT'S SPECIAL INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════

{{CLIENT_INSTRUCTIONS}}

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════════════════

Draft a complete, court-ready {{MOTION_TYPE}} motion.

Requirements:
1. Use proper legal formatting with caption, headings, and signature block
2. Cite real, accurate case law (Bluebook format)
3. Base all factual statements on the materials provided above
4. Include at least 6 legal citations
5. Include Certificate of Service
6. No placeholder text - everything must be complete

Begin the motion now:
`;
