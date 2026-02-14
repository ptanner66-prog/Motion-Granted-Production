/**
 * Table of Authorities Generator (Task 47)
 *
 * Generates Table of Authorities from verified citations.
 *
 * Format:
 * CASES                                           Page(s)
 * Celotex Corp. v. Catrett, 477 U.S. 317 (1986)   5, 8, 12
 *
 * Categories (in order):
 * 1. Cases (alphabetical by first party)
 * 2. Constitutional Provisions
 * 3. Statutes (by jurisdiction, then code)
 * 4. Rules (Federal, then State)
 * 5. Secondary Sources (treatises, law reviews)
 *
 * Source: Chunk 7, Task 47 - Code Mode Spec Section 9
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  TabStopType,
  TabStopPosition,
  convertInchesToTwip,
  HeadingLevel,
} from 'docx';
import { createClient } from '@/lib/supabase/server';
import { extractTextFromPDF, extractTextFromDOCX } from '@/lib/workflow/phases/phase-ii';

// ============================================================================
// TYPES
// ============================================================================

export interface TOAEntry {
  citation: string;
  normalizedCitation: string;
  category: 'CASES' | 'CONSTITUTIONAL' | 'STATUTES' | 'RULES' | 'SECONDARY';
  pageNumbers: number[];
  sortKey: string;
}

export interface TableOfAuthoritiesData {
  orderId: string;
  motionDocumentPath: string;
  citations: string[];
}

export interface TableOfAuthoritiesResult {
  path: string;
  entries: TOAEntry[];
  pageCount: number;
}

// ============================================================================
// CITATION CATEGORIZATION
// ============================================================================

/**
 * Patterns for categorizing citations
 */
const CITATION_PATTERNS = {
  CASES: [
    /v\.\s+/i, // Contains "v." (versus)
    /\d+\s+(U\.?S\.?|F\.\d+|Cal\.\d*|So\.\d*|S\.W\.\d*|N\.E\.\d*|A\.\d*|P\.\d*)\s+\d+/i,
    /\d+\s+(S\.?\s*Ct\.?|L\.?\s*Ed\.?)\s+\d+/i,
    /\d+\s+(Cal\.?\s*App\.?|Cal\.?\s*Rptr\.?)\s+\d+/i,
    /\d+\s+WL\s+\d+/i, // WL-format citations (unpublished)
    /\d+\s+LEXIS\s+\d+/i, // LEXIS-format citations (unpublished)
    /In\s+re\s+/i, // In re cases
    /Ex\s+parte\s+/i, // Ex parte cases
  ],
  CONSTITUTIONAL: [
    /U\.?S\.?\s+Const\.?/i,
    /Cal\.?\s+Const\.?/i,
    /La\.?\s+Const\.?/i,
    /Const\.?\s+art\./i,
    /Amendment\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|\d+)/i,
    /Amend\.\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|\d+)/i,
  ],
  STATUTES: [
    /\d+\s+U\.?S\.?C\.?\s+§?\s*\d+/i, // Federal statutes
    /Cal\.?\s*(Civ\.?\s*Code|Civ\.?\s*Proc\.?\s*Code|Penal\s*Code|Evid\.?\s*Code|Bus\.?\s*&\s*Prof\.?\s*Code|Gov\.?\s*Code|Health\s*&\s*Safety\s*Code|Lab\.?\s*Code|Fam\.?\s*Code|Prob\.?\s*Code|Veh\.?\s*Code|Welf\.?\s*&\s*Inst\.?\s*Code)\s*§?\s*\d+/i,
    /CCP\s*§?\s*\d+/i, // California Code of Civil Procedure shorthand
    /La\.?\s*(Civ\.?\s*Code|Code\s*Civ\.?\s*Proc\.?|R\.?S\.?)\s*(\d+:)?\s*§?\s*\d+/i,
    /Pub\.?\s*L\.?\s*No\.?\s*\d+-\d+/i, // Public Laws
    /§\s*\d+(\.\d+)?/i, // Generic statute references
  ],
  RULES: [
    /Fed\.?\s*R\.?\s*(Civ\.?\s*P\.?|Evid\.?|App\.?\s*P\.?|Crim\.?\s*P\.?)\s*\d+/i,
    /F\.?R\.?C\.?P\.?\s*\d+/i, // FRCP shorthand
    /F\.?R\.?E\.?\s*\d+/i, // FRE shorthand
    /Cal\.?\s*Rules?\s*(of\s+Court|Ct\.?)\s*(,?\s*rule)?\s*\d+(\.\d+)?/i,
    /CRC\s*\d+(\.\d+)?/i, // California Rules of Court shorthand
    /Local\s+Rule\s+\d+/i,
    /L\.?R\.?\s*\d+/i,
  ],
  SECONDARY: [
    /Witkin/i,
    /Restatement/i,
    /Am\.?\s*Jur\.?\s*2d/i,
    /C\.?J\.?S\.?/i,
    /A\.?L\.?R\.?\s*\d*/i,
    /\d+\s+\w+\s+L\.?\s*Rev\.?\s+\d+/i, // Law review articles
    /\d+\s+\w+\s+L\.?J\.?\s+\d+/i, // Law journal articles
    /Wright\s*&\s*Miller/i,
    /Moore's/i,
    /Prosser/i,
    /Corbin/i,
    /Williston/i,
  ],
};

/**
 * Categorize a citation into one of the 5 categories
 */
export function categorizeCitation(citation: string): TOAEntry['category'] {
  // Check in order of specificity (most specific patterns first)

  // Constitutional first (very specific)
  for (const pattern of CITATION_PATTERNS.CONSTITUTIONAL) {
    if (pattern.test(citation)) {
      return 'CONSTITUTIONAL';
    }
  }

  // Rules (before statutes, as rules can look like statutes)
  for (const pattern of CITATION_PATTERNS.RULES) {
    if (pattern.test(citation)) {
      return 'RULES';
    }
  }

  // Statutes
  for (const pattern of CITATION_PATTERNS.STATUTES) {
    if (pattern.test(citation)) {
      return 'STATUTES';
    }
  }

  // Secondary sources
  for (const pattern of CITATION_PATTERNS.SECONDARY) {
    if (pattern.test(citation)) {
      return 'SECONDARY';
    }
  }

  // Cases (check last as they're the default)
  for (const pattern of CITATION_PATTERNS.CASES) {
    if (pattern.test(citation)) {
      return 'CASES';
    }
  }

  // Default to cases if no other category matches
  return 'CASES';
}

/**
 * Generate sort key for alphabetical ordering within categories
 */
function generateSortKey(citation: string, category: TOAEntry['category']): string {
  switch (category) {
    case 'CASES':
      // Sort by first party name (before "v.")
      const vMatch = citation.match(/^([^v]+)\s+v\./i);
      if (vMatch) {
        return vMatch[1].trim().toLowerCase().replace(/^(in\s+re\s+|ex\s+parte\s+)/i, '');
      }
      return citation.toLowerCase();

    case 'CONSTITUTIONAL':
      // Sort by article/amendment number
      const amendMatch = citation.match(/amend(?:ment)?\s+(\d+|[IVXL]+)/i);
      if (amendMatch) {
        const num = romanToNumber(amendMatch[1]) || parseInt(amendMatch[1], 10);
        return `amendment_${String(num).padStart(3, '0')}`;
      }
      const artMatch = citation.match(/art(?:icle)?\.?\s+(\d+|[IVXL]+)/i);
      if (artMatch) {
        const num = romanToNumber(artMatch[1]) || parseInt(artMatch[1], 10);
        return `article_${String(num).padStart(3, '0')}`;
      }
      return citation.toLowerCase();

    case 'STATUTES':
      // Sort by code name, then section number
      const usMatch = citation.match(/(\d+)\s+U\.?S\.?C\.?\s+§?\s*(\d+)/i);
      if (usMatch) {
        return `a_federal_${usMatch[1].padStart(3, '0')}_${usMatch[2].padStart(6, '0')}`;
      }
      const calMatch = citation.match(/Cal\.?\s*([^§]+)\s*§?\s*(\d+)/i);
      if (calMatch) {
        return `b_california_${calMatch[1].trim().toLowerCase()}_${calMatch[2].padStart(6, '0')}`;
      }
      const laMatch = citation.match(/La\.?\s*([^§]+)\s*§?\s*(\d+)/i);
      if (laMatch) {
        return `c_louisiana_${laMatch[1].trim().toLowerCase()}_${laMatch[2].padStart(6, '0')}`;
      }
      return `z_${citation.toLowerCase()}`;

    case 'RULES':
      // Sort by rule type, then number
      const fedMatch = citation.match(/Fed\.?\s*R\.?\s*(Civ\.?\s*P\.?|Evid\.?|App\.?\s*P\.?|Crim\.?\s*P\.?)\s*(\d+)/i);
      if (fedMatch) {
        return `a_federal_${fedMatch[1].toLowerCase()}_${fedMatch[2].padStart(4, '0')}`;
      }
      const calRuleMatch = citation.match(/Cal\.?\s*Rules?\s*(of\s+Court|Ct\.?)?\s*,?\s*rule?\s*(\d+(\.\d+)?)/i);
      if (calRuleMatch) {
        return `b_california_${calRuleMatch[2].padStart(6, '0')}`;
      }
      return `z_${citation.toLowerCase()}`;

    case 'SECONDARY':
      // Sort alphabetically
      return citation.toLowerCase();

    default:
      return citation.toLowerCase();
  }
}

/**
 * Convert Roman numerals to numbers
 */
function romanToNumber(roman: string): number | null {
  if (/^\d+$/.test(roman)) {
    return parseInt(roman, 10);
  }

  const romanMap: Record<string, number> = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
  };

  let result = 0;
  const upperRoman = roman.toUpperCase();

  for (let i = 0; i < upperRoman.length; i++) {
    const current = romanMap[upperRoman[i]];
    const next = romanMap[upperRoman[i + 1]];

    if (current === undefined) return null;

    if (next && current < next) {
      result -= current;
    } else {
      result += current;
    }
  }

  return result;
}

/**
 * Normalize citation for consistent matching
 */
function normalizeCitation(citation: string): string {
  return citation
    .replace(/\s+/g, ' ')
    .replace(/\s*§\s*/g, ' § ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

// ============================================================================
// PAGE NUMBER EXTRACTION
// ============================================================================

/**
 * Find all page numbers where a citation appears in the document
 */
export async function findCitationPages(
  documentPath: string,
  citation: string
): Promise<number[]> {
  const supabase = await createClient();

  try {
    // Download document
    const { data: fileData, error } = await supabase.storage
      .from('documents')
      .download(documentPath);

    if (error || !fileData) {
      console.warn(`[TOA] Could not download document: ${documentPath}`);
      return [];
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const extension = documentPath.toLowerCase().split('.').pop();

    // Extract text
    let text = '';
    if (extension === 'pdf') {
      text = await extractTextFromPDF(buffer);
    } else if (extension === 'docx' || extension === 'doc') {
      text = await extractTextFromDOCX(buffer);
    } else {
      text = buffer.toString('utf-8');
    }

    // Split into pages (rough estimation based on character count)
    // Average page has ~3000 characters with double spacing
    const CHARS_PER_PAGE = 3000;
    const pages = splitIntoPages(text, CHARS_PER_PAGE);

    // Find citation on each page
    const pageNumbers: number[] = [];
    const normalizedCitation = normalizeCitation(citation);
    const citationRegex = createCitationRegex(normalizedCitation);

    for (let i = 0; i < pages.length; i++) {
      if (citationRegex.test(pages[i])) {
        pageNumbers.push(i + 1); // Pages are 1-indexed
      }
    }

    return pageNumbers;
  } catch (error) {
    console.error(`[TOA] Error finding citation pages:`, error);
    return [];
  }
}

/**
 * Split text into approximate pages
 */
function splitIntoPages(text: string, charsPerPage: number): string[] {
  const pages: string[] = [];
  let currentPage = '';

  // Try to split on paragraph boundaries
  const paragraphs = text.split(/\n\s*\n/);

  for (const paragraph of paragraphs) {
    if (currentPage.length + paragraph.length > charsPerPage && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = paragraph;
    } else {
      currentPage += (currentPage ? '\n\n' : '') + paragraph;
    }
  }

  if (currentPage) {
    pages.push(currentPage);
  }

  return pages;
}

/**
 * Create a regex for flexible citation matching
 */
function createCitationRegex(citation: string): RegExp {
  // Escape special regex characters but allow flexible whitespace
  const escaped = citation
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');

  return new RegExp(escaped, 'i');
}

// ============================================================================
// ENTRY SORTING
// ============================================================================

/**
 * Sort TOA entries according to legal formatting standards
 */
export function sortEntriesForTOA(entries: TOAEntry[]): TOAEntry[] {
  const categoryOrder: TOAEntry['category'][] = [
    'CASES',
    'CONSTITUTIONAL',
    'STATUTES',
    'RULES',
    'SECONDARY',
  ];

  return [...entries].sort((a, b) => {
    // First sort by category
    const categoryDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (categoryDiff !== 0) return categoryDiff;

    // Then sort by sort key within category
    return a.sortKey.localeCompare(b.sortKey);
  });
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate Table of Authorities document
 */
function generateTOADocument(entries: TOAEntry[]): Document {
  const sortedEntries = sortEntriesForTOA(entries);
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'TABLE OF AUTHORITIES', bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 600 },
    })
  );

  // Group entries by category
  const categories: TOAEntry['category'][] = ['CASES', 'CONSTITUTIONAL', 'STATUTES', 'RULES', 'SECONDARY'];
  const categoryTitles: Record<TOAEntry['category'], string> = {
    'CASES': 'CASES',
    'CONSTITUTIONAL': 'CONSTITUTIONAL PROVISIONS',
    'STATUTES': 'STATUTES',
    'RULES': 'RULES',
    'SECONDARY': 'SECONDARY SOURCES',
  };

  for (const category of categories) {
    const categoryEntries = sortedEntries.filter(e => e.category === category);
    if (categoryEntries.length === 0) continue;

    // Category header
    children.push(
      new Paragraph({
        children: [new TextRun({ text: categoryTitles[category], bold: true, underline: {} })],
        spacing: { before: 400, after: 200 },
      })
    );

    // Column headers
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: '' }), // Citation column (left-aligned)
          new TextRun({ text: '\t' }),
          new TextRun({ text: 'Page(s)', italics: true }),
        ],
        tabStops: [
          { type: TabStopType.RIGHT, position: convertInchesToTwip(6.5) },
        ],
        spacing: { after: 100 },
      })
    );

    // Entries
    for (const entry of categoryEntries) {
      const pageStr = entry.pageNumbers.length > 0
        ? entry.pageNumbers.join(', ')
        : 'passim'; // "passim" if throughout or unknown

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: entry.citation }),
            new TextRun({ text: '\t' }),
            new TextRun({ text: pageStr }),
          ],
          tabStops: [
            { type: TabStopType.RIGHT, position: convertInchesToTwip(6.5) },
          ],
          indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.5) },
          spacing: { after: 60 },
        })
      );
    }
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
 * Generate Table of Authorities from motion document and citation list
 */
export async function generateTableOfAuthorities(
  data: TableOfAuthoritiesData
): Promise<TableOfAuthoritiesResult> {
  console.log(`[TOA] Generating for order ${data.orderId}, ${data.citations.length} citations`);

  const entries: TOAEntry[] = [];

  // Process each citation
  for (const citation of data.citations) {
    const category = categorizeCitation(citation);
    const normalizedCitation = normalizeCitation(citation);
    const sortKey = generateSortKey(citation, category);

    // Find page numbers where citation appears
    const pageNumbers = await findCitationPages(data.motionDocumentPath, citation);

    entries.push({
      citation,
      normalizedCitation,
      category,
      pageNumbers,
      sortKey,
    });
  }

  // Deduplicate entries (same citation may appear multiple times in citation bank)
  const uniqueEntries = deduplicateEntries(entries);

  // Generate document
  const document = generateTOADocument(uniqueEntries);
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `table_of_authorities_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    console.error('[TOA] Upload error:', uploadError);
    throw new Error(`Failed to upload table of authorities: ${uploadError.message}`);
  }

  // Estimate page count
  const estimatedPageCount = Math.max(1, Math.ceil(uniqueEntries.length / 25)); // ~25 entries per page

  console.log(`[TOA] Generated successfully: ${storagePath}, ${uniqueEntries.length} unique entries`);

  return {
    path: storagePath,
    entries: uniqueEntries,
    pageCount: estimatedPageCount,
  };
}

/**
 * Remove duplicate citations, combining page numbers
 */
function deduplicateEntries(entries: TOAEntry[]): TOAEntry[] {
  const map = new Map<string, TOAEntry>();

  for (const entry of entries) {
    const key = entry.normalizedCitation.toLowerCase();
    const existing = map.get(key);

    if (existing) {
      // Combine page numbers
      const combinedPages = [...new Set([...existing.pageNumbers, ...entry.pageNumbers])].sort((a, b) => a - b);
      existing.pageNumbers = combinedPages;
    } else {
      map.set(key, { ...entry });
    }
  }

  return Array.from(map.values());
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateTableOfAuthorities,
  categorizeCitation,
  findCitationPages,
  sortEntriesForTOA,
};
