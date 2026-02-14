/**
 * Case Appendix / Compendium Generator (Task 51)
 *
 * Generates Case Appendix (compendium of unpublished cases cited).
 *
 * Required when: Motion cites unpublished opinions that court rules permit
 * (e.g., Federal circuits allowing citation with copy attached).
 *
 * Structure:
 * 1. Cover page: "APPENDIX OF UNPUBLISHED OPINIONS"
 * 2. Index of cases included
 * 3. Full text of each unpublished opinion (from CourtListener)
 *
 * Source: Chunk 7, Task 51 - Code Mode Spec Section 13
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  PageBreak,
  convertInchesToTwip,
  HeadingLevel,
  BorderStyle,
} from 'docx';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export interface UnpublishedCase {
  citation: string;
  caseName: string;
  courtListenerId: string;
  dateDecided: string;
  court: string;
  fullText: string;
  pageCount: number;
}

export interface CaseAppendixData {
  orderId: string;
  jurisdiction: string;
  unpublishedCases: Array<{
    citation: string;
    courtListenerId: string;
  }>;
  caseCaption?: {
    caseNumber: string;
    plaintiffs: string[];
    defendants: string[];
    courtName: string;
  };
}

export interface CaseAppendixResult {
  path: string;
  cases: UnpublishedCase[];
  totalPages: number;
}

// ============================================================================
// COURTLISTENER API
// ============================================================================

const COURTLISTENER_API_BASE = 'https://www.courtlistener.com/api/rest/v3';

/**
 * Fetch unpublished opinion text from CourtListener
 */
export async function fetchUnpublishedOpinionText(
  courtListenerId: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  try {
    // Fetch opinion metadata
    const metadataResponse = await fetch(
      `${COURTLISTENER_API_BASE}/opinions/${courtListenerId}/`,
      {
        headers: {
          'Authorization': `Token ${process.env.COURTLISTENER_API_KEY || process.env.COURTLISTENER_API_TOKEN || ''}`,
        },
      }
    );

    if (!metadataResponse.ok) {
      throw new Error(`CourtListener API error: ${metadataResponse.status}`);
    }

    const metadata = await metadataResponse.json();

    // Get the opinion text - try different text fields
    let text = '';

    if (metadata.plain_text) {
      text = metadata.plain_text;
    } else if (metadata.html_with_citations) {
      // Strip HTML tags
      text = stripHtml(metadata.html_with_citations);
    } else if (metadata.html) {
      text = stripHtml(metadata.html);
    } else if (metadata.html_lawbox) {
      text = stripHtml(metadata.html_lawbox);
    } else if (metadata.html_columbia) {
      text = stripHtml(metadata.html_columbia);
    }

    return {
      text: text || '[Opinion text not available]',
      metadata: {
        caseName: metadata.case_name || extractCaseNameFromCitation(metadata.citation || ''),
        dateDecided: metadata.date_created || metadata.date_modified,
        court: metadata.court?.full_name || metadata.court?.short_name || '',
        citation: metadata.citation || '',
        docket: metadata.docket,
        cluster: metadata.cluster,
      },
    };
  } catch (error) {
    console.error(`[CaseAppendix] Error fetching from CourtListener:`, error);

    // Return placeholder if API fails
    return {
      text: '[Unable to retrieve opinion text from CourtListener. Please verify the citation and attach a copy of the opinion manually.]',
      metadata: {
        caseName: 'Unknown',
        dateDecided: '',
        court: '',
      },
    };
  }
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
    .replace(/<[^>]+>/g, '') // Remove tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract case name from citation string
 */
function extractCaseNameFromCitation(citation: string): string {
  // Try to extract "Party v. Party" pattern
  const match = citation.match(/^([^,]+\s+v\.\s+[^,]+)/i);
  if (match) {
    return match[1];
  }
  return citation.split(',')[0] || 'Unknown Case';
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate cover page for appendix
 */
export function generateAppendixCoverPage(
  cases: UnpublishedCase[],
  caseCaption?: CaseAppendixData['caseCaption']
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Caption if provided
  if (caseCaption) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: caseCaption.courtName.toUpperCase(), bold: true })],
        alignment: AlignmentType.CENTER,
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: caseCaption.plaintiffs.join(', ') }),
          new TextRun({ text: ' v. ' }),
          new TextRun({ text: caseCaption.defendants.join(', ') }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `Case No. ${caseCaption.caseNumber}` })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      })
    );
  }

  // Title
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'APPENDIX OF UNPUBLISHED OPINIONS', bold: true, size: 32 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 600 },
    })
  );

  // Introduction
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Pursuant to applicable court rules permitting citation of unpublished opinions, the following unpublished decisions cited in the accompanying brief are included in this appendix:',
          italics: true,
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // Index of cases
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'INDEX OF OPINIONS', bold: true, underline: {} })],
      spacing: { before: 400, after: 200 },
    })
  );

  let startPage = 3; // Start after cover and index pages
  for (let i = 0; i < cases.length; i++) {
    const caseData = cases[i];
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${i + 1}. ` }),
          new TextRun({ text: caseData.caseName, italics: true }),
          new TextRun({ text: `, ${caseData.citation}` }),
          new TextRun({ text: ` .......... ` }),
          new TextRun({ text: `Page ${startPage}` }),
        ],
        spacing: { after: 100 },
      })
    );
    startPage += caseData.pageCount;
  }

  // Page break after cover
  paragraphs.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  return paragraphs;
}

/**
 * Generate opinion section for a single case
 */
function generateOpinionSection(
  caseData: UnpublishedCase,
  index: number
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Case header
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: `EXHIBIT ${index + 1}`, bold: true, size: 24 }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caseData.caseName, bold: true, italics: true, size: 28 }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caseData.citation }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caseData.court }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  if (caseData.dateDecided) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Decided: ${caseData.dateDecided}` }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
  }

  // Separator line
  paragraphs.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
      spacing: { after: 400 },
    })
  );

  // Opinion text - split into paragraphs
  const textParagraphs = caseData.fullText.split(/\n\n+/);
  for (const para of textParagraphs) {
    if (para.trim()) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: para.trim() })],
          spacing: { after: 200 },
        })
      );
    }
  }

  // Page break after opinion (except last)
  paragraphs.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  return paragraphs;
}

/**
 * Generate the full case appendix document
 */
function generateCaseAppendixDocument(
  cases: UnpublishedCase[],
  caseCaption?: CaseAppendixData['caseCaption']
): Document {
  const children: Paragraph[] = [];

  // Cover page with index
  children.push(...generateAppendixCoverPage(cases, caseCaption));

  // Each opinion
  for (let i = 0; i < cases.length; i++) {
    children.push(...generateOpinionSection(cases[i], i));
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
        },
      },
      children,
    }],
  });
}

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate Case Appendix document
 */
export async function generateCaseAppendix(
  data: CaseAppendixData
): Promise<CaseAppendixResult> {
  console.log(`[CaseAppendix] Generating for order ${data.orderId}, ${data.unpublishedCases.length} cases`);

  const cases: UnpublishedCase[] = [];

  // Fetch each unpublished opinion
  for (const caseRef of data.unpublishedCases) {
    console.log(`[CaseAppendix] Fetching: ${caseRef.citation}`);

    const { text, metadata } = await fetchUnpublishedOpinionText(caseRef.courtListenerId);

    // Estimate page count (rough: ~3000 chars per page)
    const pageCount = Math.max(1, Math.ceil(text.length / 3000));

    cases.push({
      citation: caseRef.citation,
      caseName: (metadata.caseName as string) || extractCaseNameFromCitation(caseRef.citation),
      courtListenerId: caseRef.courtListenerId,
      dateDecided: (metadata.dateDecided as string) || '',
      court: (metadata.court as string) || '',
      fullText: text,
      pageCount,
    });
  }

  // Calculate total pages (cover + index + all opinions)
  const totalPages = 2 + cases.reduce((sum, c) => sum + c.pageCount, 0);

  // Generate document
  const document = generateCaseAppendixDocument(cases, data.caseCaption);
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `case_appendix_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    console.error('[CaseAppendix] Upload error:', uploadError);
    throw new Error(`Failed to upload case appendix: ${uploadError.message}`);
  }

  console.log(`[CaseAppendix] Generated successfully: ${storagePath}, ${cases.length} cases, ${totalPages} pages`);

  return {
    path: storagePath,
    cases,
    totalPages,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if jurisdiction requires appendix for unpublished opinions
 */
export function requiresAppendix(jurisdiction: string): boolean {
  // Federal circuits generally require copies of unpublished opinions
  if (jurisdiction.includes('federal_') || jurisdiction.includes('district')) {
    return true;
  }

  // Some state courts also require it
  if (jurisdiction === 'ca_federal') {
    return true;
  }

  return false;
}

/**
 * Identify unpublished cases from citation list
 */
export function identifyUnpublishedCases(
  citations: Array<{ citation: string; verificationData?: Record<string, unknown> }>
): Array<{ citation: string; courtListenerId: string }> {
  const unpublished: Array<{ citation: string; courtListenerId: string }> = [];

  for (const cit of citations) {
    const isUnpublished = isUnpublishedCitation(cit.citation, cit.verificationData);
    if (isUnpublished) {
      const courtListenerId = extractCourtListenerId(cit.verificationData);
      if (courtListenerId) {
        unpublished.push({
          citation: cit.citation,
          courtListenerId,
        });
      }
    }
  }

  return unpublished;
}

/**
 * Check if a citation is for an unpublished opinion
 */
function isUnpublishedCitation(
  citation: string,
  verificationData?: Record<string, unknown>
): boolean {
  // Check verification data first
  if (verificationData?.status === 'unpublished' || verificationData?.published === false) {
    return true;
  }

  // Check citation format patterns for unpublished indicators
  const unpublishedPatterns = [
    /\d+\s+WL\s+\d+/i, // WL-format citations often indicate unpublished
    /\d+\s+U\.S\.\s*Dist\.\s*LEXIS/i,
    /\d+\s+U\.S\.\s*App\.\s*LEXIS/i,
    /Not\s+Reported/i,
    /unpublished/i,
    /slip\s*op/i,
  ];

  return unpublishedPatterns.some(pattern => pattern.test(citation));
}

/**
 * Extract CourtListener ID from verification data
 */
function extractCourtListenerId(verificationData?: Record<string, unknown>): string | null {
  if (!verificationData) return null;

  // Check various possible field names
  const idFields = ['courtListenerId', 'cl_id', 'opinion_id', 'id'];
  for (const field of idFields) {
    if (verificationData[field]) {
      return String(verificationData[field]);
    }
  }

  // Try to extract from URL if present
  const url = verificationData.url || verificationData.courtlistener_url;
  if (url && typeof url === 'string') {
    const match = url.match(/\/opinion\/(\d+)\//);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateCaseAppendix,
  fetchUnpublishedOpinionText,
  generateAppendixCoverPage,
  requiresAppendix,
  identifyUnpublishedCases,
};
