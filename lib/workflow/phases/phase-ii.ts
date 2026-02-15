/**
 * Phase II: Document Processing (Task 41)
 *
 * Code-controlled document processing:
 * 1. Extract text from uploaded PDFs/DOCX using pdf-parse and mammoth libraries
 * 2. Parse party names, dates, key facts from caption and body
 * 3. Extract existing citations from opponent's motion (PATH B)
 * 4. Build evidence inventory with document references
 *
 * Output: parsed_documents JSONB, evidence_inventory JSONB, extracted_citations array
 *
 * CRITICAL: Customer data from Phase I is PRIMARY; document parsing is verification only.
 *
 * Source: Chunk 6, Task 41 - Code Mode Spec Section 3
 */

import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-phases-phase-ii');
// Note: pdf-parse and mammoth are already in package.json

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedDocument {
  documentId: string;
  filename: string;
  extractedText: string;
  pageCount: number;
  caption: {
    caseNumber: string | null;
    parties: string[];
    court: string | null;
  } | null;
  dates: string[];
  keyFacts: string[];
}

export interface EvidenceItem {
  id: string;
  description: string;
  sourceDocument: string;
  pageReference: string;
  type: 'testimony' | 'document' | 'declaration' | 'exhibit' | 'other';
}

export interface PhaseIIOutput {
  parsedDocuments: ParsedDocument[];
  evidenceInventory: EvidenceItem[];
  extractedCitations: string[]; // From opponent's motion in PATH B
  captionVerification: {
    matches: boolean;
    discrepancies: string[];
  };
}

// ============================================================================
// PDF TEXT EXTRACTION
// ============================================================================

/**
 * Extract text from PDF buffer using pdf-parse
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to handle server-side only module
    const { PDFParse } = await import('pdf-parse');

    // @ts-expect-error - pdf-parse constructor signature varies
    const data = await new PDFParse().parse(buffer);
    return data.text;
  } catch (error) {
    log.error('[Phase II] PDF extraction error:', error);
    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get page count from PDF
 */
export async function getPDFPageCount(buffer: Buffer): Promise<number> {
  try {
    const { PDFParse } = await import('pdf-parse');
    // @ts-expect-error - pdf-parse constructor signature varies
    const data = await new PDFParse().parse(buffer);
    return data.numpages;
  } catch (error) {
    log.error('[Phase II] PDF page count error:', error);
    return 0;
  }
}

// ============================================================================
// DOCX TEXT EXTRACTION
// ============================================================================

/**
 * Extract text from DOCX buffer using mammoth
 */
export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');

    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    log.error('[Phase II] DOCX extraction error:', error);
    throw new Error(`DOCX extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// TEXT ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Extract citations from text using legal citation patterns
 */
export function extractCitationsFromText(text: string): string[] {
  const citations: string[] = [];

  // Case citation patterns
  const patterns = [
    // Federal Reporter citations: 123 F.3d 456
    /\d+\s+F\.\s*(?:2d|3d|4th)\s+\d+/gi,
    // U.S. Reports: 123 U.S. 456
    /\d+\s+U\.?\s*S\.?\s+\d+/gi,
    // Supreme Court Reporter: 123 S.Ct. 456
    /\d+\s+S\.?\s*Ct\.?\s+\d+/gi,
    // L.Ed.: 123 L.Ed.2d 456
    /\d+\s+L\.?\s*Ed\.?\s*(?:2d)?\s+\d+/gi,
    // California citations: 123 Cal.4th 456
    /\d+\s+Cal\.?\s*(?:2d|3d|4th|5th|App\.?\s*(?:2d|3d|4th|5th)?|Rptr\.?\s*(?:2d|3d)?)\s+\d+/gi,
    // New York citations
    /\d+\s+N\.?\s*Y\.?\s*(?:2d|3d|S\.?\s*2d)?\s+\d+/gi,
    // Federal Supplement: 123 F.Supp.3d 456
    /\d+\s+F\.?\s*Supp\.?\s*(?:2d|3d)?\s+\d+/gi,
    // Federal Appendix
    /\d+\s+Fed\.?\s*Appx\.?\s+\d+/gi,
    // WL-format citations
    /\d{4}\s+WL\s+\d+/gi,
    // U.S.C. citations
    /\d+\s+U\.?\s*S\.?\s*C\.?\s+§?\s*\d+/gi,
    // C.F.R. citations
    /\d+\s+C\.?\s*F\.?\s*R\.?\s+§?\s*\d+/gi,
    // California codes
    /Cal\.?\s*(?:Civ|Pen|Bus|Corp|Fam|Gov|Prob|Lab|Veh)\.?\s*(?:Code)?\s+§?\s*\d+/gi,
    // Federal Rules
    /Fed\.?\s*R\.?\s*(?:Civ|Crim|App|Evid)\.?\s*P\.?\s+\d+/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      citations.push(...matches);
    }
  }

  // Deduplicate and clean
  const uniqueCitations = [...new Set(citations.map(c => c.trim().replace(/\s+/g, ' ')))];

  return uniqueCitations;
}

/**
 * Extract dates from text
 */
export function extractDatesFromText(text: string): string[] {
  const dates: string[] = [];

  // Common date patterns
  const patterns = [
    // Month DD, YYYY
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
    // MM/DD/YYYY or MM-DD-YYYY
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/g,
    // YYYY-MM-DD
    /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      dates.push(...matches);
    }
  }

  return [...new Set(dates)];
}

/**
 * Extract caption information from document text
 */
export function extractCaptionFromText(text: string): {
  caseNumber: string | null;
  parties: string[];
  court: string | null;
} {
  const result = {
    caseNumber: null as string | null,
    parties: [] as string[],
    court: null as string | null,
  };

  // Look for case number patterns
  const caseNumberPatterns = [
    // Federal: 1:23-cv-12345
    /\d{1,2}:\d{2}-cv-\d+/i,
    // Federal alternate: Case No. 1:23-cv-12345
    /(?:Case\s*(?:No\.?|Number)?:?\s*)(\d{1,2}:\d{2}-(?:cv|cr|mc)-\d+(?:-\w+)?)/i,
    // State: BC123456
    /[A-Z]{2,3}\s*\d{5,8}/i,
    // General: No. 123456
    /(?:No\.?|Case\s*No\.?)\s*([A-Z0-9\-]+)/i,
  ];

  for (const pattern of caseNumberPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.caseNumber = match[1] || match[0];
      break;
    }
  }

  // Look for "v." or "vs." pattern for parties
  const vPattern = /([A-Z][A-Za-z\s,]+?)\s+v\.?\s*s?\.?\s+([A-Z][A-Za-z\s,]+?)(?:,|\n|$)/;
  const vMatch = text.match(vPattern);
  if (vMatch) {
    result.parties = [vMatch[1].trim(), vMatch[2].trim()];
  }

  // Look for court name
  const courtPatterns = [
    /(?:IN\s+THE\s+)?(UNITED\s+STATES\s+DISTRICT\s+COURT[^)]+)/i,
    /(?:IN\s+THE\s+)?(SUPERIOR\s+COURT\s+OF[^)]+)/i,
    /(?:IN\s+THE\s+)?(\d+(?:ST|ND|RD|TH)\s+JUDICIAL\s+DISTRICT\s+COURT[^)]+)/i,
    /(?:IN\s+THE\s+)?(COURT\s+OF\s+APPEAL[^)]+)/i,
  ];

  for (const pattern of courtPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.court = match[1].trim();
      break;
    }
  }

  return result;
}

/**
 * Extract key facts from document text
 * Returns sentences that appear to be factual statements
 */
export function extractKeyFacts(text: string): string[] {
  const facts: string[] = [];

  // Split into sentences
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);

  // Patterns that indicate factual statements
  const factIndicators = [
    /on\s+(?:or\s+about\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)/i,
    /plaintiff\s+(?:did|was|had|is|are)/i,
    /defendant\s+(?:did|was|had|is|are)/i,
    /on\s+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i,
    /the\s+contract\s+(?:stated|provided|required)/i,
    /the\s+parties\s+(?:agreed|entered|signed)/i,
    /pursuant\s+to/i,
    /as\s+evidenced\s+by/i,
    /the\s+evidence\s+shows/i,
    /undisputed\s+fact/i,
    /material\s+fact/i,
  ];

  for (const sentence of sentences) {
    for (const pattern of factIndicators) {
      if (pattern.test(sentence) && sentence.length < 500) {
        facts.push(sentence);
        break;
      }
    }
  }

  // Limit to most relevant facts
  return facts.slice(0, 20);
}

// ============================================================================
// DOCUMENT PROCESSING
// ============================================================================

/**
 * Process a single document
 */
async function processDocument(
  documentId: string,
  filename: string,
  buffer: Buffer
): Promise<ParsedDocument> {
  const extension = filename.toLowerCase().split('.').pop();
  let extractedText = '';
  let pageCount = 0;

  // Extract text based on file type
  if (extension === 'pdf') {
    extractedText = await extractTextFromPDF(buffer);
    pageCount = await getPDFPageCount(buffer);
  } else if (extension === 'docx' || extension === 'doc') {
    extractedText = await extractTextFromDOCX(buffer);
    // Estimate pages for DOCX (roughly 500 words per page)
    const wordCount = extractedText.split(/\s+/).length;
    pageCount = Math.ceil(wordCount / 500);
  } else {
    // For other types, try as text
    extractedText = buffer.toString('utf-8');
    pageCount = 1;
  }

  // Extract structured information
  const caption = extractCaptionFromText(extractedText);
  const dates = extractDatesFromText(extractedText);
  const keyFacts = extractKeyFacts(extractedText);

  return {
    documentId,
    filename,
    extractedText,
    pageCount,
    caption: caption.caseNumber || caption.parties.length > 0 || caption.court ? caption : null,
    dates,
    keyFacts,
  };
}

/**
 * Build evidence inventory from parsed documents
 */
function buildEvidenceInventory(
  parsedDocuments: ParsedDocument[]
): EvidenceItem[] {
  const inventory: EvidenceItem[] = [];
  let itemId = 1;

  for (const doc of parsedDocuments) {
    // Add key facts as evidence items
    for (const fact of doc.keyFacts) {
      inventory.push({
        id: `EV-${String(itemId++).padStart(3, '0')}`,
        description: fact.length > 200 ? fact.substring(0, 200) + '...' : fact,
        sourceDocument: doc.filename,
        pageReference: 'See document',
        type: 'document',
      });
    }
  }

  return inventory;
}

/**
 * Verify caption against Phase I authoritative data
 */
function verifyCaptions(
  parsedDocuments: ParsedDocument[],
  phaseIData: {
    caseNumber: string;
    parties: string[];
  }
): { matches: boolean; discrepancies: string[] } {
  const discrepancies: string[] = [];

  for (const doc of parsedDocuments) {
    if (!doc.caption) continue;

    // Check case number
    if (doc.caption.caseNumber) {
      const normalizedExtracted = doc.caption.caseNumber.toLowerCase().replace(/\s+/g, '');
      const normalizedAuth = phaseIData.caseNumber.toLowerCase().replace(/\s+/g, '');

      if (normalizedExtracted !== normalizedAuth) {
        discrepancies.push(
          `${doc.filename}: Case number mismatch - Document has "${doc.caption.caseNumber}", Phase I has "${phaseIData.caseNumber}"`
        );
      }
    }

    // Check parties (fuzzy match)
    if (doc.caption.parties.length > 0) {
      for (const extractedParty of doc.caption.parties) {
        const extractedLower = extractedParty.toLowerCase();
        const hasMatch = phaseIData.parties.some(authParty =>
          authParty.toLowerCase().includes(extractedLower) ||
          extractedLower.includes(authParty.toLowerCase())
        );

        if (!hasMatch) {
          discrepancies.push(
            `${doc.filename}: Party name "${extractedParty}" not found in Phase I data`
          );
        }
      }
    }
  }

  return {
    matches: discrepancies.length === 0,
    discrepancies,
  };
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process all documents for an order
 */
export async function processDocuments(
  orderId: string,
  documents: Array<{ id: string; storageUrl: string; filename: string }>
): Promise<PhaseIIOutput> {
  log.info(`[Phase II] Processing ${documents.length} documents for order ${orderId}`);

  const supabase = await createClient();
  const parsedDocuments: ParsedDocument[] = [];
  let allCitations: string[] = [];

  // Get Phase I data for verification
  const { data: order } = await supabase
    .from('orders')
    .select('phase_outputs, case_number')
    .eq('id', orderId)
    .single();

  const phaseIOutput = (order?.phase_outputs as Record<string, unknown>)?.['I'] as Record<string, unknown> | undefined;

  // Process each document
  for (const doc of documents) {
    try {
      // Download document from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(doc.storageUrl);

      if (downloadError || !fileData) {
        log.error(`[Phase II] Failed to download ${doc.filename}:`, downloadError);
        continue;
      }

      // Convert to buffer
      const buffer = Buffer.from(await fileData.arrayBuffer());

      // Process document
      const parsed = await processDocument(doc.id, doc.filename, buffer);
      parsedDocuments.push(parsed);

      // Extract citations (especially for PATH B opponent motion)
      const citations = extractCitationsFromText(parsed.extractedText);
      allCitations = [...allCitations, ...citations];

      log.info(`[Phase II] Processed ${doc.filename}: ${parsed.pageCount} pages, ${citations.length} citations`);
    } catch (error) {
      log.error(`[Phase II] Error processing ${doc.filename}:`, error);
    }
  }

  // Deduplicate citations
  allCitations = [...new Set(allCitations)];

  // Build evidence inventory
  const evidenceInventory = buildEvidenceInventory(parsedDocuments);

  // Verify captions against Phase I data
  const captionVerification = verifyCaptions(parsedDocuments, {
    caseNumber: order?.case_number || (phaseIOutput?.caseIdentifiers as Record<string, unknown>)?.caseNumber as string || '',
    parties: [
      ...((phaseIOutput?.parties as Record<string, unknown>)?.plaintiffs as string[] || []),
      ...((phaseIOutput?.parties as Record<string, unknown>)?.defendants as string[] || []),
    ],
  });

  const output: PhaseIIOutput = {
    parsedDocuments,
    evidenceInventory,
    extractedCitations: allCitations,
    captionVerification,
  };

  // Save Phase II output
  const phaseOutputs = (order?.phase_outputs || {}) as Record<string, unknown>;
  phaseOutputs['II'] = {
    phaseComplete: 'II',
    ...output,
    processedAt: new Date().toISOString(),
    documentCount: parsedDocuments.length,
    totalPages: parsedDocuments.reduce((sum, d) => sum + d.pageCount, 0),
    citationCount: allCitations.length,
    evidenceCount: evidenceInventory.length,
  };

  await supabase
    .from('orders')
    .update({ phase_outputs: phaseOutputs })
    .eq('id', orderId);

  log.info(`[Phase II] Complete: ${parsedDocuments.length} documents, ${allCitations.length} citations, ${evidenceInventory.length} evidence items`);

  return output;
}

/**
 * Complete Phase II and advance workflow
 */
export async function completePhaseII(
  orderId: string
): Promise<{ success: boolean; nextPhase: string; error?: string }> {
  try {
    const supabase = await createClient();

    // Get document list from order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('documents, phase_outputs')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error('Order not found');
    }

    // Process documents
    const documents = (order.documents || []) as Array<{
      id: string;
      storageUrl: string;
      filename: string;
    }>;

    if (documents.length > 0) {
      await processDocuments(orderId, documents);
    }

    // Update workflow state
    await supabase
      .from('order_workflow_state')
      .update({
        current_phase: 'III',
        phase_ii_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    log.info(`[Phase II] Completed for order ${orderId}, advancing to Phase III`);
    return {
      success: true,
      nextPhase: 'III',
    };
  } catch (error) {
    log.error('[Phase II] Error completing phase:', error);
    return {
      success: false,
      nextPhase: 'II',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractTextFromPDF,
  extractTextFromDOCX,
  extractCitationsFromText,
  extractDatesFromText,
  extractCaptionFromText,
  extractKeyFacts,
  processDocuments,
  completePhaseII,
};
