/**
 * Text extraction utilities.
 * Extracted from legacy lib/workflow/phases/phase-ii.ts during dead code cleanup (AUDIT-008).
 */

import { createLogger } from '@/lib/security/logger';

const log = createLogger('text-extraction');

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
    log.error('[TextExtraction] PDF extraction error:', error);
    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from DOCX buffer using mammoth
 */
export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');

    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    log.error('[TextExtraction] DOCX extraction error:', error);
    throw new Error(`DOCX extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
