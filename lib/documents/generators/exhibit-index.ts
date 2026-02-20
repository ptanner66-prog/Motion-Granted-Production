/**
 * Exhibit Index Generator (Task 48)
 *
 * Generates Exhibit Index for document package.
 *
 * Format:
 * EXHIBIT INDEX
 *
 * Exhibit No.  Description                              Bates Range
 *     A        Deposition of John Smith (excerpts)      001-025
 *     B        Contract dated January 15, 2024          026-030
 *     C        Email correspondence, Feb-Mar 2024       031-045
 *
 * Numbering: Letters (A-Z) for California, Numbers (1-99) for Federal.
 *
 * Source: Chunk 7, Task 48 - Code Mode Spec Section 10
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
} from 'docx';
import { createClient } from '@/lib/supabase/server';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('documents-generators-exhibit-index');
// ============================================================================
// TYPES
// ============================================================================

export interface ExhibitEntry {
  exhibitNumber: string;
  description: string;
  batesStart: string;
  batesEnd: string;
  pageCount: number;
  sourceDocumentId: string;
}

export interface ExhibitIndexData {
  orderId: string;
  jurisdiction: string;
  exhibits: Array<{
    documentId: string;
    description: string;
    pageCount: number;
  }>;
  batesPrefix?: string;
  caseCaption?: {
    caseNumber: string;
    plaintiffs: string[];
    defendants: string[];
    courtName: string;
  };
}

export interface ExhibitIndexResult {
  path: string;
  entries: ExhibitEntry[];
  totalPages: number;
}

// ============================================================================
// EXHIBIT NUMBERING
// ============================================================================

/**
 * Assign exhibit numbers based on jurisdiction
 * California: Letters (A-Z, then AA-AZ, etc.)
 * Federal: Numbers (1, 2, 3, etc.)
 */
export function assignExhibitNumbers(
  count: number,
  jurisdiction: string
): string[] {
  const isCaliforniaState = jurisdiction.includes('ca_') &&
    !jurisdiction.includes('federal') &&
    !jurisdiction.includes('district');

  if (isCaliforniaState) {
    return assignLetterNumbers(count);
  } else {
    return assignNumericNumbers(count);
  }
}

/**
 * Generate letter-based exhibit numbers (A-Z, AA-AZ, BA-BZ, etc.)
 */
function assignLetterNumbers(count: number): string[] {
  const numbers: string[] = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (let i = 0; i < count; i++) {
    if (i < 26) {
      numbers.push(alphabet[i]);
    } else {
      // For exhibits beyond Z: AA, AB, ... AZ, BA, BB, etc.
      const firstLetter = alphabet[Math.floor((i - 26) / 26)];
      const secondLetter = alphabet[(i - 26) % 26];
      numbers.push(firstLetter + secondLetter);
    }
  }

  return numbers;
}

/**
 * Generate numeric exhibit numbers (1, 2, 3, etc.)
 */
function assignNumericNumbers(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

// ============================================================================
// BATES NUMBERING
// ============================================================================

/**
 * Generate Bates numbers for exhibits
 */
export function generateBatesNumbers(
  exhibits: Omit<ExhibitEntry, 'batesStart' | 'batesEnd'>[],
  prefix: string
): ExhibitEntry[] {
  const result: ExhibitEntry[] = [];
  let currentPage = 1;

  for (const exhibit of exhibits) {
    const startPage = currentPage;
    const endPage = currentPage + exhibit.pageCount - 1;

    result.push({
      ...exhibit,
      batesStart: formatBatesNumber(prefix, startPage),
      batesEnd: formatBatesNumber(prefix, endPage),
    });

    currentPage = endPage + 1;
  }

  return result;
}

/**
 * Format a Bates number with prefix and zero-padding
 */
function formatBatesNumber(prefix: string, page: number): string {
  const paddedNumber = String(page).padStart(4, '0');
  return prefix ? `${prefix}${paddedNumber}` : paddedNumber;
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate Exhibit Index document
 */
function generateExhibitIndexDocument(
  entries: ExhibitEntry[],
  caseCaption?: ExhibitIndexData['caseCaption']
): Document {
  const children: Paragraph[] = [];

  // Caption if provided
  if (caseCaption) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: caseCaption.courtName.toUpperCase(), bold: true })],
        alignment: AlignmentType.CENTER,
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: caseCaption.plaintiffs.join(', ').toUpperCase() }),
          new TextRun({ text: ', Plaintiff(s),' }),
        ],
        spacing: { before: 200 },
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'v.' })],
        alignment: AlignmentType.CENTER,
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: caseCaption.defendants.join(', ').toUpperCase() }),
          new TextRun({ text: ', Defendant(s).' }),
        ],
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Case No. ${caseCaption.caseNumber}`, bold: true })],
        alignment: AlignmentType.RIGHT,
        spacing: { before: 200, after: 400 },
      })
    );
  }

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'EXHIBIT INDEX', bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );

  // Create table
  const table = createExhibitTable(entries);
  children.push(new Paragraph({ children: [] })); // Spacer before table

  return new Document({
    sections: [{
      properties: {
        page: {
          size: {
            width: 12240,  // 8.5 inches (US Letter)
            height: 15840, // 11 inches (US Letter)
          },
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
        },
      },
      children: [
        ...children,
        table,
      ],
    }],
  });
}

/**
 * Create exhibit table
 */
function createExhibitTable(entries: ExhibitEntry[]): Table {
  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: '000000',
  };

  const rows: TableRow[] = [];

  // Header row
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Exhibit No.', bold: true })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: 'E8E8E8' },
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Description', bold: true })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          width: { size: 55, type: WidthType.PERCENTAGE },
          shading: { fill: 'E8E8E8' },
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Bates Range', bold: true })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { fill: 'E8E8E8' },
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
        }),
      ],
    })
  );

  // Data rows
  for (const entry of entries) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: entry.exhibitNumber, bold: true })],
                alignment: AlignmentType.CENTER,
              }),
            ],
            borders: {
              top: borderStyle,
              bottom: borderStyle,
              left: borderStyle,
              right: borderStyle,
            },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: entry.description })],
              }),
            ],
            borders: {
              top: borderStyle,
              bottom: borderStyle,
              left: borderStyle,
              right: borderStyle,
            },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `${entry.batesStart}-${entry.batesEnd}` })],
                alignment: AlignmentType.CENTER,
              }),
            ],
            borders: {
              top: borderStyle,
              bottom: borderStyle,
              left: borderStyle,
              right: borderStyle,
            },
          }),
        ],
      })
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate Exhibit Index document
 */
export async function generateExhibitIndex(
  data: ExhibitIndexData
): Promise<ExhibitIndexResult> {
  log.info(`[ExhibitIndex] Generating for order ${data.orderId}, ${data.exhibits.length} exhibits`);

  // Assign exhibit numbers based on jurisdiction
  const exhibitNumbers = assignExhibitNumbers(data.exhibits.length, data.jurisdiction);

  // Create exhibit entries without Bates numbers
  const partialEntries: Omit<ExhibitEntry, 'batesStart' | 'batesEnd'>[] = data.exhibits.map((exhibit, index) => ({
    exhibitNumber: exhibitNumbers[index],
    description: exhibit.description,
    pageCount: exhibit.pageCount,
    sourceDocumentId: exhibit.documentId,
  }));

  // Generate Bates numbers
  const prefix = data.batesPrefix || generateDefaultPrefix(data);
  const entries = generateBatesNumbers(partialEntries, prefix);

  // Calculate total pages
  const totalPages = entries.reduce((sum, entry) => sum + entry.pageCount, 0);

  // Generate document
  const document = generateExhibitIndexDocument(entries, data.caseCaption);
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `exhibit_index_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    log.error('[ExhibitIndex] Upload error:', uploadError);
    throw new Error(`Failed to upload exhibit index: ${uploadError.message}`);
  }

  log.info(`[ExhibitIndex] Generated successfully: ${storagePath}, ${entries.length} exhibits, ${totalPages} total pages`);

  return {
    path: storagePath,
    entries,
    totalPages,
  };
}

/**
 * Generate default Bates prefix from case information
 */
function generateDefaultPrefix(data: ExhibitIndexData): string {
  // Try to extract plaintiff name for prefix
  if (data.caseCaption?.plaintiffs?.[0]) {
    const firstName = data.caseCaption.plaintiffs[0].split(/\s+/)[0];
    return firstName.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6);
  }

  // Fallback to order ID prefix
  return data.orderId.substring(0, 4).toUpperCase();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create exhibit entries from Phase II evidence inventory
 */
export function createExhibitEntriesFromInventory(
  inventory: Array<{
    documentId: string;
    filename: string;
    type: string;
    pageCount: number;
    summary?: string;
  }>
): ExhibitIndexData['exhibits'] {
  return inventory
    .filter(item => item.type === 'exhibit' || item.type === 'supporting')
    .map(item => ({
      documentId: item.documentId,
      description: item.summary || cleanFilenameForDescription(item.filename),
      pageCount: item.pageCount || 1,
    }));
}

/**
 * Clean up filename for use as exhibit description
 */
function cleanFilenameForDescription(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[-_]/g, ' ') // Replace separators with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateExhibitIndex,
  assignExhibitNumbers,
  generateBatesNumbers,
  createExhibitEntriesFromInventory,
};
