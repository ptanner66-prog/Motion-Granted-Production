/**
 * Document Parsing Module
 *
 * Parses and classifies uploaded documents, extracting key information
 * for workflow processing including facts, legal issues, parties, and dates.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { askClaude } from '@/lib/automation/claude';
import { extractCitations } from '@/lib/workflow/citation-verifier';
import { extractDocumentContent } from './document-extractor';
import type {
  ParsedDocument,
  KeyFact,
  LegalIssue,
  Party,
  ExtractedDate,
  ExtractedAmount,
  DocumentSection,
  ParseError,
  CitationType,
} from '@/types/workflow';
import type { OperationResult } from '@/types/automation';

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
// CONSTANTS
// ============================================================================

const PARSER_VERSION = '1.0.0';

// Document type patterns
const DOCUMENT_TYPE_PATTERNS: Record<string, RegExp[]> = {
  complaint: [
    /complaint/i,
    /plaintiff\s+v\./i,
    /cause\s+of\s+action/i,
    /prayer\s+for\s+relief/i,
  ],
  answer: [
    /answer\s+to\s+complaint/i,
    /defendant.*answers/i,
    /affirmative\s+defense/i,
  ],
  motion: [
    /motion\s+(to|for)/i,
    /memorandum\s+(of\s+points\s+and\s+authorities|in\s+support)/i,
    /notice\s+of\s+motion/i,
  ],
  opposition: [
    /opposition\s+to/i,
    /response\s+to\s+motion/i,
    /memorandum\s+in\s+opposition/i,
  ],
  reply: [
    /reply\s+(to|in\s+support)/i,
    /reply\s+brief/i,
    /reply\s+memorandum/i,
  ],
  declaration: [
    /declaration\s+of/i,
    /affidavit\s+of/i,
    /i\s+declare\s+under\s+penalty/i,
  ],
  exhibit: [
    /exhibit\s+[a-z0-9]/i,
    /attachment\s+[a-z0-9]/i,
  ],
  order: [
    /order\s+(granting|denying|on)/i,
    /court\s+order/i,
    /it\s+is\s+(so\s+)?ordered/i,
  ],
  subpoena: [
    /subpoena/i,
    /commanded\s+to\s+(appear|produce)/i,
  ],
  discovery: [
    /interrogator(y|ies)/i,
    /request\s+for\s+(production|admission)/i,
    /deposition\s+(notice|transcript)/i,
  ],
};

// ============================================================================
// DOCUMENT CLASSIFICATION
// ============================================================================

interface ClassificationResult {
  documentType: string;
  documentSubtype: string | null;
  confidence: number;
}

/**
 * Classify a document based on its content
 */
function classifyDocument(text: string): ClassificationResult {
  const normalizedText = text.toLowerCase();

  // Check each document type pattern
  for (const [docType, patterns] of Object.entries(DOCUMENT_TYPE_PATTERNS)) {
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        matchCount++;
      }
    }

    if (matchCount >= 2) {
      return {
        documentType: docType,
        documentSubtype: null,
        confidence: Math.min(0.9, 0.5 + matchCount * 0.2),
      };
    } else if (matchCount === 1) {
      return {
        documentType: docType,
        documentSubtype: null,
        confidence: 0.6,
      };
    }
  }

  return {
    documentType: 'unknown',
    documentSubtype: null,
    confidence: 0.3,
  };
}

// ============================================================================
// TEXT EXTRACTION HELPERS
// ============================================================================

/**
 * Extract parties from document text
 */
function extractParties(text: string): Party[] {
  const parties: Party[] = [];
  const seen = new Set<string>();

  // Pattern: "JOHN DOE, Plaintiff," or "ABC CORP., Defendant"
  const partyPattern = /([A-Z][A-Z\s.,]+(?:INC\.|LLC|CORP\.|CO\.)?)\s*,\s*(Plaintiff|Defendant|Petitioner|Respondent|Appellant|Appellee)s?/gi;

  let match;
  while ((match = partyPattern.exec(text)) !== null) {
    const name = match[1].trim().replace(/,\s*$/, '');
    const role = match[2].toLowerCase();

    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      parties.push({
        name,
        role,
        type: name.includes('INC.') || name.includes('LLC') || name.includes('CORP.')
          ? 'corporation'
          : 'individual',
      });
    }
  }

  // Also look for "v." pattern
  const vPattern = /([A-Z][A-Za-z\s]+(?:et\s+al\.)?)\s+v\.\s+([A-Z][A-Za-z\s]+(?:et\s+al\.)?)/;
  const vMatch = text.match(vPattern);
  if (vMatch) {
    const plaintiff = vMatch[1].trim();
    const defendant = vMatch[2].trim();

    if (!seen.has(plaintiff.toLowerCase())) {
      seen.add(plaintiff.toLowerCase());
      parties.push({ name: plaintiff, role: 'plaintiff' });
    }
    if (!seen.has(defendant.toLowerCase())) {
      seen.add(defendant.toLowerCase());
      parties.push({ name: defendant, role: 'defendant' });
    }
  }

  return parties;
}

/**
 * Extract dates from document text
 */
function extractDates(text: string): ExtractedDate[] {
  const dates: ExtractedDate[] = [];
  const seen = new Set<string>();

  // Various date patterns
  const datePatterns = [
    // "January 15, 2024" or "Jan. 15, 2024"
    /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s+\d{1,2},?\s+\d{4}/gi,
    // "01/15/2024" or "1/15/24"
    /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
    // "2024-01-15"
    /\d{4}-\d{2}-\d{2}/g,
  ];

  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const dateStr = match[0];
      if (!seen.has(dateStr)) {
        seen.add(dateStr);

        // Try to determine context
        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = Math.min(text.length, match.index + dateStr.length + 50);
        const context = text.substring(contextStart, contextEnd);

        let type: ExtractedDate['type'] = 'other';
        if (/filed|filing/i.test(context)) type = 'filing';
        else if (/deadline|due|must be/i.test(context)) type = 'deadline';
        else if (/hearing|trial|conference/i.test(context)) type = 'event';

        dates.push({
          date: dateStr,
          context: context.trim(),
          type,
        });
      }
    }
    pattern.lastIndex = 0;
  }

  return dates;
}

/**
 * Extract monetary amounts from document text
 */
function extractAmounts(text: string): ExtractedAmount[] {
  const amounts: ExtractedAmount[] = [];

  // Pattern: $1,234.56 or $1,234,567
  const amountPattern = /\$[\d,]+(?:\.\d{2})?/g;

  let match;
  while ((match = amountPattern.exec(text)) !== null) {
    const amountStr = match[0];
    const numericValue = parseFloat(amountStr.replace(/[$,]/g, ''));

    // Get context
    const contextStart = Math.max(0, match.index - 50);
    const contextEnd = Math.min(text.length, match.index + amountStr.length + 50);
    const context = text.substring(contextStart, contextEnd);

    let type: ExtractedAmount['type'] = 'other';
    if (/damage|compensat|loss/i.test(context)) type = 'damages';
    else if (/fee|cost|attorney/i.test(context)) type = 'fee';
    else if (/settl/i.test(context)) type = 'settlement';

    amounts.push({
      amount: numericValue,
      currency: 'USD',
      context: context.trim(),
      type,
    });
  }

  return amounts;
}

/**
 * Extract document sections/headings
 */
function extractSections(text: string): DocumentSection[] {
  const sections: DocumentSection[] = [];

  // Pattern for numbered sections: I., II., 1., 2., A., B.
  const sectionPattern = /^(?:([IVX]+|[A-Z]|\d+)\.)\s+([A-Z][A-Z\s]+)$/gm;

  let match;
  while ((match = sectionPattern.exec(text)) !== null) {
    sections.push({
      title: match[2].trim(),
    });
  }

  // Also look for all-caps headings
  const headingPattern = /^([A-Z][A-Z\s]{5,})$/gm;
  while ((match = headingPattern.exec(text)) !== null) {
    const heading = match[1].trim();
    // Avoid duplicates and common non-heading phrases
    if (!sections.some(s => s.title === heading) &&
        !['THE', 'AND', 'FOR', 'WITH'].includes(heading)) {
      sections.push({ title: heading });
    }
  }

  return sections;
}

// ============================================================================
// AI-POWERED EXTRACTION
// ============================================================================

interface AIExtractionResult {
  summary: string;
  keyFacts: KeyFact[];
  legalIssues: LegalIssue[];
}

/**
 * Use AI to extract detailed information from document
 */
async function extractWithAI(
  text: string,
  documentType: string
): Promise<OperationResult<AIExtractionResult>> {
  // Truncate text if too long (keep first 15000 chars)
  const truncatedText = text.length > 15000
    ? text.substring(0, 15000) + '\n\n[Document truncated for analysis...]'
    : text;

  const prompt = `Analyze this legal document and extract key information.

Document Type: ${documentType}

Document Text:
${truncatedText}

Respond with a JSON object containing:
{
  "summary": "A 2-3 sentence summary of the document",
  "keyFacts": [
    {
      "fact": "The key factual statement",
      "importance": "high" | "medium" | "low",
      "category": "procedural" | "substantive" | "background"
    }
  ],
  "legalIssues": [
    {
      "issue": "The legal issue or question",
      "elements": ["element 1", "element 2"],
      "applicable_law": ["relevant statute or rule"],
      "relevance": "How this issue relates to the case"
    }
  ]
}

Extract up to 10 key facts and up to 5 legal issues.`;

  const result = await askClaude({
    prompt,
    maxTokens: 32000, // MAXED OUT - comprehensive document analysis
    systemPrompt: 'You are a legal document analysis expert. Always respond with valid JSON.',
  });

  if (!result.success || !result.result) {
    return { success: false, error: result.error || 'AI extraction failed' };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: 'Could not parse AI response' };
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: {
        summary: analysis.summary || '',
        keyFacts: (analysis.keyFacts || []).map((f: Record<string, unknown>) => ({
          fact: f.fact as string,
          importance: (f.importance as string) || 'medium',
          category: f.category as string,
        })),
        legalIssues: (analysis.legalIssues || []).map((i: Record<string, unknown>) => ({
          issue: i.issue as string,
          elements: (i.elements as string[]) || [],
          applicable_law: (i.applicable_law as string[]) || [],
          relevance: (i.relevance as string) || '',
        })),
      },
    };
  } catch {
    return { success: false, error: 'Failed to parse AI extraction response' };
  }
}

// ============================================================================
// MAIN PARSING FUNCTION
// ============================================================================

/**
 * Parse a document and extract all relevant information
 */
export async function parseDocument(
  documentId: string,
  orderId: string,
  fileContent: string
): Promise<OperationResult<ParsedDocument>> {
  // Use admin client to bypass RLS
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  // BUG-16 FIX: Fail immediately on empty/whitespace-only content.
  // An empty parse result means the document extraction failed (corrupt PDF,
  // unsupported format, etc.). Proceeding with empty content produces a
  // garbage motion. This must BLOCK the workflow, not silently continue.
  if (!fileContent || fileContent.trim().length === 0) {
    console.error(`[BUG-16] Document ${documentId} for order ${orderId} parsed to EMPTY content. Blocking workflow.`);
    return {
      success: false,
      error: `Document parsing yielded empty content (document: ${documentId}). The uploaded file may be corrupt, password-protected, or in an unsupported format. Please re-upload the document.`,
    };
  }

  // BUG-16: Also check for suspiciously short content (< 50 chars)
  // which likely indicates a parsing failure rather than a real document.
  const MINIMUM_CONTENT_LENGTH = 50;
  if (fileContent.trim().length < MINIMUM_CONTENT_LENGTH) {
    console.warn(`[BUG-16] Document ${documentId} content suspiciously short (${fileContent.trim().length} chars). May indicate parsing failure.`);
  }

  const errors: ParseError[] = [];

  try {
    // Classify document
    const classification = classifyDocument(fileContent);

    // Extract basic information
    const parties = extractParties(fileContent);
    const dates = extractDates(fileContent);
    const amounts = extractAmounts(fileContent);
    const sections = extractSections(fileContent);
    const headings = sections.map(s => s.title);

    // Extract citations
    const extractedCitations = extractCitations(fileContent);
    const citationsFound = extractedCitations.map(c => ({
      text: c.text,
      type: c.type as CitationType,
    }));

    // Calculate word count
    const wordCount = fileContent.split(/\s+/).filter(w => w.length > 0).length;

    // Try AI extraction
    let summary = '';
    let keyFacts: KeyFact[] = [];
    let legalIssues: LegalIssue[] = [];

    const aiResult = await extractWithAI(fileContent, classification.documentType);
    if (aiResult.success && aiResult.data) {
      summary = aiResult.data.summary;
      keyFacts = aiResult.data.keyFacts;
      legalIssues = aiResult.data.legalIssues;
    } else {
      errors.push({
        type: 'ai_extraction',
        message: aiResult.error || 'AI extraction unavailable',
        recoverable: true,
      });
    }

    // Calculate completeness score
    const completenessFactors = [
      parties.length > 0 ? 0.2 : 0,
      dates.length > 0 ? 0.1 : 0,
      sections.length > 0 ? 0.1 : 0,
      citationsFound.length > 0 ? 0.2 : 0,
      summary.length > 0 ? 0.2 : 0,
      keyFacts.length > 0 ? 0.1 : 0,
      legalIssues.length > 0 ? 0.1 : 0,
    ];
    const completenessScore = completenessFactors.reduce((a, b) => a + b, 0);

    // Create parsed document record
    const parsedDoc: Omit<ParsedDocument, 'id' | 'created_at' | 'updated_at'> = {
      document_id: documentId,
      order_id: orderId,
      document_type: classification.documentType,
      document_subtype: classification.documentSubtype,
      parsed_at: new Date().toISOString(),
      parser_version: PARSER_VERSION,
      full_text: fileContent,
      summary,
      key_facts: keyFacts,
      legal_issues: legalIssues,
      parties,
      dates,
      amounts,
      sections,
      headings,
      page_count: null, // Would need PDF parsing
      word_count: wordCount,
      citations_found: citationsFound,
      parse_confidence: classification.confidence,
      completeness_score: completenessScore,
      parse_errors: errors,
    };

    // Store in database
    const { data: inserted, error: insertError } = await supabase
      .from('parsed_documents')
      .insert({
        document_id: documentId,
        order_id: orderId,
        document_type: classification.documentType,
        document_subtype: classification.documentSubtype,
        parsed_at: new Date().toISOString(),
        parser_version: PARSER_VERSION,
        full_text: fileContent,
        summary,
        key_facts: keyFacts,
        legal_issues: legalIssues,
        parties,
        dates,
        amounts,
        sections,
        headings,
        word_count: wordCount,
        citations_found: citationsFound,
        parse_confidence: classification.confidence,
        completeness_score: completenessScore,
        parse_errors: errors,
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return {
      success: true,
      data: {
        ...parsedDoc,
        id: inserted.id,
        created_at: inserted.created_at,
        updated_at: inserted.updated_at,
      } as ParsedDocument,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Document parsing failed',
    };
  }
}

// ============================================================================
// BATCH PARSING
// ============================================================================

/**
 * Parse all documents for an order
 */
export async function parseOrderDocuments(
  orderId: string
): Promise<OperationResult<{ parsed: number; failed: number }>> {
  // Use admin client to bypass RLS
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Get all documents for this order
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, file_url, file_name, file_type')
      .eq('order_id', orderId)
      .neq('is_deliverable', true);

    if (docsError) {
      return { success: false, error: docsError.message };
    }

    let parsed = 0;
    let failed = 0;

    for (const doc of documents || []) {
      // Check if already parsed
      const { data: existing } = await supabase
        .from('parsed_documents')
        .select('id')
        .eq('document_id', doc.id)
        .single();

      if (existing) {
        parsed++;
        continue;
      }

      // Extract actual content from the document
      const extractResult = await extractDocumentContent(doc.file_url, doc.file_type || 'application/octet-stream');

      let fileContent: string;
      if (extractResult.success && extractResult.data) {
        fileContent = extractResult.data.text;
      } else {
        // Log extraction failure but continue with placeholder
        console.warn(`Failed to extract content from ${doc.file_name}: ${extractResult.error}`);
        fileContent = `[Content extraction failed for ${doc.file_name}]`;
      }

      const result = await parseDocument(
        doc.id,
        orderId,
        fileContent
      );

      if (result.success) {
        parsed++;
      } else {
        failed++;
      }
    }

    return { success: true, data: { parsed, failed } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Batch parsing failed',
    };
  }
}

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Get parsed document by document ID
 */
export async function getParsedDocument(
  documentId: string
): Promise<OperationResult<ParsedDocument>> {
  // Use admin client to bypass RLS
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  const { data, error } = await supabase
    .from('parsed_documents')
    .select('*')
    .eq('document_id', documentId)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data as ParsedDocument };
}

/**
 * Get all parsed documents for an order
 */
export async function getOrderParsedDocuments(
  orderId: string
): Promise<OperationResult<ParsedDocument[]>> {
  // Use admin client to bypass RLS
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  const { data, error } = await supabase
    .from('parsed_documents')
    .select('*')
    .eq('order_id', orderId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: (data || []) as ParsedDocument[] };
}
