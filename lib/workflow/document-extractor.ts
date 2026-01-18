/**
 * Document Content Extraction Module
 *
 * Downloads files from Supabase storage and extracts text content
 * for processing by the document parser and workflow engine.
 */

import { createClient } from '@/lib/supabase/server';
import type { OperationResult } from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedContent {
  documentId: string;
  fileName: string;
  fileType: string;
  textContent: string;
  extractionMethod: 'direct' | 'pdf' | 'docx' | 'image_ocr' | 'fallback';
  confidence: number;
  metadata: {
    pageCount?: number;
    wordCount: number;
    characterCount: number;
    extractedAt: string;
  };
}

export interface DocumentExtractionResult {
  orderId: string;
  documents: ExtractedContent[];
  totalDocuments: number;
  successfulExtractions: number;
  failedExtractions: number;
  errors: Array<{ documentId: string; error: string }>;
}

// ============================================================================
// TEXT EXTRACTION BY FILE TYPE
// ============================================================================

/**
 * Extract text from a PDF file using pdf-parse
 * Falls back to basic text extraction if pdf-parse not available
 */
async function extractFromPdf(buffer: ArrayBuffer): Promise<{ text: string; pages?: number }> {
  try {
    // Dynamic import for pdf-parse (may not be installed)
    const pdfParse = await import('pdf-parse').catch(() => null);

    if (pdfParse) {
      const data = await pdfParse.default(Buffer.from(buffer));
      return {
        text: data.text,
        pages: data.numpages,
      };
    }

    // Fallback: try to extract readable text from raw PDF
    const textDecoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = textDecoder.decode(buffer);

    // Extract text between stream markers (very basic PDF text extraction)
    const textMatches = rawText.match(/\(([^)]+)\)/g) || [];
    const extractedText = textMatches
      .map(m => m.slice(1, -1))
      .filter(t => t.length > 2 && !/^[\\\/\d\s]+$/.test(t))
      .join(' ');

    return { text: extractedText || '[PDF content - install pdf-parse for better extraction]' };
  } catch {
    return { text: '[Failed to extract PDF content]' };
  }
}

/**
 * Extract text from a DOCX file using mammoth
 * Falls back to basic XML extraction if mammoth not available
 */
async function extractFromDocx(buffer: ArrayBuffer): Promise<string> {
  try {
    // Dynamic import for mammoth (may not be installed)
    const mammoth = await import('mammoth').catch(() => null);

    if (mammoth) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return result.value;
    }

    // Fallback: extract from document.xml in the DOCX zip
    const JSZip = await import('jszip').catch(() => null);

    if (JSZip) {
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml')?.async('text');

      if (documentXml) {
        // Strip XML tags, keep text content
        const text = documentXml
          .replace(/<w:p[^>]*>/g, '\n') // Paragraph breaks
          .replace(/<[^>]+>/g, '') // Remove all XML tags
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();
        return text;
      }
    }

    return '[DOCX content - install mammoth for better extraction]';
  } catch {
    return '[Failed to extract DOCX content]';
  }
}

/**
 * Extract text from a DOC file (legacy Word format)
 * Very basic extraction - binary format is complex
 */
async function extractFromDoc(buffer: ArrayBuffer): Promise<string> {
  try {
    const textDecoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = textDecoder.decode(buffer);

    // DOC files have embedded text - try to extract readable portions
    const cleanText = rawText
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Filter to likely text content (sentences with common words)
    const sentences = cleanText.split(/[.!?]+/).filter(s => {
      const words = s.trim().toLowerCase().split(/\s+/);
      const commonWords = ['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'that', 'is', 'was', 'for'];
      return words.length > 3 && words.some(w => commonWords.includes(w));
    });

    return sentences.join('. ') || '[DOC content - limited extraction available]';
  } catch {
    return '[Failed to extract DOC content]';
  }
}

/**
 * Extract text from plain text or similar files
 */
function extractFromText(buffer: ArrayBuffer): string {
  const textDecoder = new TextDecoder('utf-8', { fatal: false });
  return textDecoder.decode(buffer);
}

// ============================================================================
// MAIN EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Download a file from Supabase storage and extract its text content
 */
export async function extractDocumentContent(
  filePath: string,
  fileType: string
): Promise<OperationResult<{ text: string; pages?: number; method: string }>> {
  const supabase = await createClient();

  try {
    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError || !fileData) {
      return {
        success: false,
        error: `Failed to download file: ${downloadError?.message || 'No data returned'}`,
      };
    }

    // Convert Blob to ArrayBuffer
    const buffer = await fileData.arrayBuffer();

    // Extract based on file type
    const mimeType = fileType.toLowerCase();

    if (mimeType === 'application/pdf' || filePath.endsWith('.pdf')) {
      const result = await extractFromPdf(buffer);
      return {
        success: true,
        data: { text: result.text, pages: result.pages, method: 'pdf' },
      };
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filePath.endsWith('.docx')
    ) {
      const text = await extractFromDocx(buffer);
      return {
        success: true,
        data: { text, method: 'docx' },
      };
    }

    if (mimeType === 'application/msword' || filePath.endsWith('.doc')) {
      const text = await extractFromDoc(buffer);
      return {
        success: true,
        data: { text, method: 'doc' },
      };
    }

    if (mimeType.startsWith('text/')) {
      const text = extractFromText(buffer);
      return {
        success: true,
        data: { text, method: 'direct' },
      };
    }

    if (mimeType.startsWith('image/')) {
      // For images, we'd need OCR - return placeholder for now
      return {
        success: true,
        data: {
          text: '[Image file - OCR extraction not yet implemented]',
          method: 'image_ocr',
        },
      };
    }

    // Unknown file type - try text extraction
    const text = extractFromText(buffer);
    return {
      success: true,
      data: { text, method: 'fallback' },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Content extraction failed',
    };
  }
}

/**
 * Extract content from all documents associated with an order
 */
export async function extractOrderDocuments(
  orderId: string
): Promise<OperationResult<DocumentExtractionResult>> {
  const supabase = await createClient();

  try {
    // Get all non-deliverable documents for this order
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, file_name, file_type, file_url')
      .eq('order_id', orderId)
      .eq('is_deliverable', false);

    if (docsError) {
      return { success: false, error: docsError.message };
    }

    const results: ExtractedContent[] = [];
    const errors: Array<{ documentId: string; error: string }> = [];

    for (const doc of documents || []) {
      const extractResult = await extractDocumentContent(doc.file_url, doc.file_type);

      if (extractResult.success && extractResult.data) {
        const text = extractResult.data.text;
        results.push({
          documentId: doc.id,
          fileName: doc.file_name,
          fileType: doc.file_type,
          textContent: text,
          extractionMethod: extractResult.data.method as ExtractedContent['extractionMethod'],
          confidence: text.includes('[Failed') || text.includes('[') ? 0.3 : 0.9,
          metadata: {
            pageCount: extractResult.data.pages,
            wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
            characterCount: text.length,
            extractedAt: new Date().toISOString(),
          },
        });
      } else {
        errors.push({
          documentId: doc.id,
          error: extractResult.error || 'Unknown extraction error',
        });
      }
    }

    return {
      success: true,
      data: {
        orderId,
        documents: results,
        totalDocuments: documents?.length || 0,
        successfulExtractions: results.length,
        failedExtractions: errors.length,
        errors,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Order document extraction failed',
    };
  }
}

/**
 * Get combined text from all order documents
 */
export async function getCombinedDocumentText(orderId: string): Promise<OperationResult<string>> {
  const result = await extractOrderDocuments(orderId);

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  const combinedText = result.data.documents
    .map(doc => `=== ${doc.fileName} ===\n${doc.textContent}`)
    .join('\n\n');

  return {
    success: true,
    data: combinedText,
  };
}
