/**
 * Legal Document PDF Generator
 *
 * Generates court-ready PDF documents with proper legal formatting:
 * - 1-inch margins
 * - Times New Roman 12pt (or equivalent)
 * - Double-spaced body text
 * - Proper caption blocks
 * - Numbered paragraphs
 * - Signature blocks
 * - Certificate of service
 *
 * Designed for federal and state court e-filing standards.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
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

// Standard court document dimensions (8.5 x 11 inches in points)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

// Margins (1 inch = 72 points)
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;
const MARGIN_LEFT = 72;
const MARGIN_RIGHT = 72;

// Typography
const FONT_SIZE_BODY = 12;
const FONT_SIZE_HEADING = 12;
const FONT_SIZE_CAPTION = 12;
const FONT_SIZE_TITLE = 14;
const LINE_HEIGHT = 24; // Double-spaced (12pt * 2)

// Content area
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
const LINES_PER_PAGE = Math.floor(CONTENT_HEIGHT / LINE_HEIGHT);

// ============================================================================
// TYPES
// ============================================================================

export interface MotionDocument {
  // Case information
  courtName: string;
  caseNumber: string;
  caseCaption: string;

  // Parties
  plaintiffs: string[];
  defendants: string[];

  // Document info
  motionTitle: string;
  motionType: string;

  // Content sections
  introduction?: string;
  statementOfFacts?: string;
  proceduralHistory?: string;
  legalStandard?: string;
  argument: string;
  conclusion: string;

  // Optional components
  proposedOrder?: string;
  certificateOfService?: string;

  // Attorney info for signature block
  attorneyName?: string;
  attorneyBarNumber?: string;
  firmName?: string;
  firmAddress?: string;
  firmPhone?: string;
  firmEmail?: string;
}

export interface PDFGenerationResult {
  pdfBytes: Uint8Array;
  pageCount: number;
  wordCount: number;
  generatedAt: string;
}

interface TextBlock {
  text: string;
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  maxWidth?: number;
}

// ============================================================================
// TEXT UTILITIES
// ============================================================================

/**
 * Wrap text to fit within a given width
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Split text into paragraphs
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0);
}

/**
 * Calculate word count
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ============================================================================
// PDF GENERATION
// ============================================================================

/**
 * Draw caption block (court header with parties)
 */
async function drawCaption(
  page: PDFPage,
  doc: MotionDocument,
  font: PDFFont,
  boldFont: PDFFont
): Promise<number> {
  let y = PAGE_HEIGHT - MARGIN_TOP;

  // Court name (centered)
  const courtWidth = boldFont.widthOfTextAtSize(doc.courtName.toUpperCase(), FONT_SIZE_CAPTION);
  page.drawText(doc.courtName.toUpperCase(), {
    x: (PAGE_WIDTH - courtWidth) / 2,
    y,
    size: FONT_SIZE_CAPTION,
    font: boldFont,
  });
  y -= LINE_HEIGHT * 1.5;

  // Parties block
  const captionLeft = MARGIN_LEFT;
  const captionMiddle = MARGIN_LEFT + CONTENT_WIDTH / 2 - 20;
  const captionRight = MARGIN_LEFT + CONTENT_WIDTH / 2 + 20;

  // Plaintiffs
  for (const plaintiff of doc.plaintiffs) {
    page.drawText(plaintiff.toUpperCase() + ',', {
      x: captionLeft,
      y,
      size: FONT_SIZE_CAPTION,
      font: font,
    });
    y -= LINE_HEIGHT;
  }

  // Plaintiff label
  const plaintiffY = y + LINE_HEIGHT * (doc.plaintiffs.length / 2);
  page.drawText('Plaintiff(s),', {
    x: captionLeft + 200,
    y: plaintiffY,
    size: FONT_SIZE_CAPTION,
    font: font,
  });

  // vs.
  page.drawText('v.', {
    x: captionLeft + 100,
    y,
    size: FONT_SIZE_CAPTION,
    font: boldFont,
  });

  // Case number (right side)
  page.drawText(`Case No. ${doc.caseNumber}`, {
    x: captionRight,
    y: PAGE_HEIGHT - MARGIN_TOP - LINE_HEIGHT * 2,
    size: FONT_SIZE_CAPTION,
    font: boldFont,
  });

  y -= LINE_HEIGHT;

  // Defendants
  for (const defendant of doc.defendants) {
    page.drawText(defendant.toUpperCase() + ',', {
      x: captionLeft,
      y,
      size: FONT_SIZE_CAPTION,
      font: font,
    });
    y -= LINE_HEIGHT;
  }

  // Defendant label
  page.drawText('Defendant(s).', {
    x: captionLeft + 200,
    y: y + LINE_HEIGHT,
    size: FONT_SIZE_CAPTION,
    font: font,
  });

  // Draw box around caption
  const boxTop = PAGE_HEIGHT - MARGIN_TOP + 10;
  const boxBottom = y - 10;
  const boxHeight = boxTop - boxBottom;

  // Vertical line
  page.drawLine({
    start: { x: captionMiddle, y: boxTop },
    end: { x: captionMiddle, y: boxBottom },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  // Horizontal lines
  page.drawLine({
    start: { x: MARGIN_LEFT, y: boxTop },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: boxTop },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page.drawLine({
    start: { x: MARGIN_LEFT, y: boxBottom },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: boxBottom },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  return boxBottom - LINE_HEIGHT * 2;
}

/**
 * Draw motion title
 */
function drawTitle(
  page: PDFPage,
  title: string,
  y: number,
  boldFont: PDFFont
): number {
  const titleUpper = title.toUpperCase();
  const titleWidth = boldFont.widthOfTextAtSize(titleUpper, FONT_SIZE_TITLE);

  page.drawText(titleUpper, {
    x: (PAGE_WIDTH - titleWidth) / 2,
    y,
    size: FONT_SIZE_TITLE,
    font: boldFont,
  });

  return y - LINE_HEIGHT * 2;
}

/**
 * Draw a section with heading and body
 */
function drawSection(
  page: PDFPage,
  heading: string,
  body: string,
  startY: number,
  font: PDFFont,
  boldFont: PDFFont,
  paragraphNumber?: number
): { y: number; overflow: string | null } {
  let y = startY;

  // Section heading
  const headingText = heading.toUpperCase();
  page.drawText(headingText, {
    x: MARGIN_LEFT,
    y,
    size: FONT_SIZE_HEADING,
    font: boldFont,
  });
  y -= LINE_HEIGHT * 1.5;

  // Body paragraphs
  const paragraphs = splitParagraphs(body);
  let currentParagraphNum = paragraphNumber || 1;

  for (const paragraph of paragraphs) {
    // Check if we have room for at least 3 lines
    if (y < MARGIN_BOTTOM + LINE_HEIGHT * 3) {
      // Return overflow text
      const remainingParagraphs = paragraphs.slice(paragraphs.indexOf(paragraph));
      return { y, overflow: remainingParagraphs.join('\n\n') };
    }

    // Paragraph number
    const numText = `${currentParagraphNum}.`;
    page.drawText(numText, {
      x: MARGIN_LEFT,
      y,
      size: FONT_SIZE_BODY,
      font: font,
    });

    // Paragraph text (indented)
    const textX = MARGIN_LEFT + 36; // 0.5 inch indent
    const textMaxWidth = CONTENT_WIDTH - 36;
    const lines = wrapText(paragraph, font, FONT_SIZE_BODY, textMaxWidth);

    for (const line of lines) {
      if (y < MARGIN_BOTTOM) {
        return { y, overflow: paragraph };
      }

      page.drawText(line, {
        x: textX,
        y,
        size: FONT_SIZE_BODY,
        font: font,
      });
      y -= LINE_HEIGHT;
    }

    y -= LINE_HEIGHT * 0.5; // Extra space between paragraphs
    currentParagraphNum++;
  }

  return { y, overflow: null };
}

/**
 * Draw body text (for arguments without numbered paragraphs)
 */
function drawBodyText(
  page: PDFPage,
  text: string,
  startY: number,
  font: PDFFont
): { y: number; overflow: string | null } {
  let y = startY;
  const paragraphs = splitParagraphs(text);

  for (const paragraph of paragraphs) {
    if (y < MARGIN_BOTTOM + LINE_HEIGHT * 2) {
      const remainingParagraphs = paragraphs.slice(paragraphs.indexOf(paragraph));
      return { y, overflow: remainingParagraphs.join('\n\n') };
    }

    const lines = wrapText(paragraph, font, FONT_SIZE_BODY, CONTENT_WIDTH);

    for (const line of lines) {
      if (y < MARGIN_BOTTOM) {
        return { y, overflow: paragraph };
      }

      // First line indent
      const isFirstLine = lines.indexOf(line) === 0;
      const indent = isFirstLine ? 36 : 0;

      page.drawText(line, {
        x: MARGIN_LEFT + indent,
        y,
        size: FONT_SIZE_BODY,
        font: font,
      });
      y -= LINE_HEIGHT;
    }

    y -= LINE_HEIGHT * 0.5;
  }

  return { y, overflow: null };
}

/**
 * Draw signature block
 */
function drawSignatureBlock(
  page: PDFPage,
  doc: MotionDocument,
  y: number,
  font: PDFFont
): number {
  const signatureX = PAGE_WIDTH / 2;

  // Respectfully submitted
  page.drawText('Respectfully submitted,', {
    x: signatureX,
    y,
    size: FONT_SIZE_BODY,
    font: font,
  });
  y -= LINE_HEIGHT * 3;

  // Signature line
  page.drawLine({
    start: { x: signatureX, y: y + 10 },
    end: { x: signatureX + 180, y: y + 10 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  y -= LINE_HEIGHT;

  // Attorney info
  if (doc.attorneyName) {
    page.drawText(doc.attorneyName, {
      x: signatureX,
      y,
      size: FONT_SIZE_BODY,
      font: font,
    });
    y -= LINE_HEIGHT;
  }

  if (doc.attorneyBarNumber) {
    page.drawText(`Bar No. ${doc.attorneyBarNumber}`, {
      x: signatureX,
      y,
      size: FONT_SIZE_BODY,
      font: font,
    });
    y -= LINE_HEIGHT;
  }

  if (doc.firmName) {
    page.drawText(doc.firmName, {
      x: signatureX,
      y,
      size: FONT_SIZE_BODY,
      font: font,
    });
    y -= LINE_HEIGHT;
  }

  if (doc.firmAddress) {
    const addressLines = doc.firmAddress.split('\n');
    for (const line of addressLines) {
      page.drawText(line, {
        x: signatureX,
        y,
        size: FONT_SIZE_BODY,
        font: font,
      });
      y -= LINE_HEIGHT;
    }
  }

  if (doc.firmPhone) {
    page.drawText(`Tel: ${doc.firmPhone}`, {
      x: signatureX,
      y,
      size: FONT_SIZE_BODY,
      font: font,
    });
    y -= LINE_HEIGHT;
  }

  if (doc.firmEmail) {
    page.drawText(`Email: ${doc.firmEmail}`, {
      x: signatureX,
      y,
      size: FONT_SIZE_BODY,
      font: font,
    });
    y -= LINE_HEIGHT;
  }

  // Attorney for
  y -= LINE_HEIGHT;
  const partyType = doc.plaintiffs.length > 0 ? 'Plaintiff(s)' : 'Defendant(s)';
  page.drawText(`Attorney for ${partyType}`, {
    x: signatureX,
    y,
    size: FONT_SIZE_BODY,
    font: font,
  });

  return y - LINE_HEIGHT * 2;
}

/**
 * Draw certificate of service
 */
function drawCertificateOfService(
  page: PDFPage,
  content: string,
  y: number,
  font: PDFFont,
  boldFont: PDFFont
): number {
  // Heading
  const heading = 'CERTIFICATE OF SERVICE';
  const headingWidth = boldFont.widthOfTextAtSize(heading, FONT_SIZE_HEADING);

  page.drawText(heading, {
    x: (PAGE_WIDTH - headingWidth) / 2,
    y,
    size: FONT_SIZE_HEADING,
    font: boldFont,
  });
  y -= LINE_HEIGHT * 2;

  // Content
  const lines = wrapText(content, font, FONT_SIZE_BODY, CONTENT_WIDTH);
  for (const line of lines) {
    page.drawText(line, {
      x: MARGIN_LEFT,
      y,
      size: FONT_SIZE_BODY,
      font: font,
    });
    y -= LINE_HEIGHT;
  }

  return y;
}

/**
 * Draw page number
 */
function drawPageNumber(page: PDFPage, pageNum: number, totalPages: number, font: PDFFont): void {
  const text = `Page ${pageNum} of ${totalPages}`;
  const textWidth = font.widthOfTextAtSize(text, 10);

  page.drawText(text, {
    x: (PAGE_WIDTH - textWidth) / 2,
    y: MARGIN_BOTTOM / 2,
    size: 10,
    font: font,
  });
}

// ============================================================================
// WORKFLOW PDF GENERATOR
// ============================================================================

/**
 * Generate PDF from workflow outputs
 */
export async function generatePDFFromWorkflow(
  orderId: string,
  workflowId: string
): Promise<OperationResult<PDFGenerationResult>> {
  // Use admin client to bypass RLS
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        parties (party_name, party_role),
        profiles (full_name, email)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return { success: false, error: 'Order not found' };
    }

    // Get workflow outputs
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get phase outputs
    const { data: phases, error: phasesError } = await supabase
      .from('workflow_phase_executions')
      .select('phase_number, outputs')
      .eq('order_workflow_id', workflowId)
      .eq('status', 'completed')
      .order('phase_number', { ascending: true });

    if (phasesError) {
      return { success: false, error: 'Failed to fetch workflow phases' };
    }

    // Aggregate outputs
    const allOutputs: Record<string, unknown> = {};
    for (const phase of phases || []) {
      if (phase.outputs) {
        Object.assign(allOutputs, phase.outputs);
      }
    }

    // Get the draft document from outputs
    const draftDocument = (allOutputs.revised_document || allOutputs.draft_document || allOutputs.final_motion) as string;

    if (!draftDocument) {
      return { success: false, error: 'No draft document found in workflow outputs' };
    }

    // Parse parties
    const plaintiffs: string[] = [];
    const defendants: string[] = [];

    for (const party of order.parties || []) {
      if (party.party_role === 'plaintiff') {
        plaintiffs.push(party.party_name);
      } else if (party.party_role === 'defendant') {
        defendants.push(party.party_name);
      }
    }

    // Build document structure
    const motionDoc: MotionDocument = {
      courtName: order.jurisdiction || 'United States District Court',
      caseNumber: order.case_number || '[CASE NUMBER]',
      caseCaption: order.case_caption || 'PARTIES v. PARTIES',
      plaintiffs: plaintiffs.length > 0 ? plaintiffs : ['[PLAINTIFF]'],
      defendants: defendants.length > 0 ? defendants : ['[DEFENDANT]'],
      motionTitle: order.motion_type || 'Motion',
      motionType: order.motion_type || 'motion',
      argument: draftDocument,
      conclusion: (allOutputs.certificate_of_service as string)
        ? 'For the foregoing reasons, the Court should grant this Motion.'
        : 'WHEREFORE, for the foregoing reasons, this Motion should be granted.',
      certificateOfService: allOutputs.certificate_of_service as string || generateDefaultCertificate(),
      attorneyName: order.profiles?.full_name || '[ATTORNEY NAME]',
      attorneyBarNumber: '[BAR NUMBER]',
      firmName: '[FIRM NAME]',
      firmAddress: '[ADDRESS]',
      firmPhone: '[PHONE]',
      firmEmail: order.profiles?.email || '[EMAIL]',
    };

    return await generateDetailedMotionPDF(motionDoc);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PDF generation from workflow failed',
    };
  }
}

// ============================================================================
// SIMPLE PDF GENERATOR (for Claude Chat approve flow)
// ============================================================================

/**
 * Simple interface for text-to-PDF conversion
 * Used by the approve route for Claude-generated motions
 */
export interface SimpleMotionPDF {
  title: string;
  content: string;
  caseNumber?: string;
  caseCaption?: string;
  court?: string;
  filingDate?: string;
}

/**
 * Generate a simple PDF from text content
 * This is used when Claude generates the complete motion text
 */
export async function generateMotionPDF(
  options: SimpleMotionPDF
): Promise<OperationResult<{ pdfBuffer: Uint8Array; pageCount: number }>> {
  try {
    const pdfDoc = await PDFDocument.create();
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    let pageCount = 0;

    // Helper to add a new page
    const addPage = (): PDFPage => {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageCount++;
      return page;
    };

    // Start first page
    let page = addPage();
    let y = PAGE_HEIGHT - MARGIN_TOP;

    // Draw title
    if (options.title) {
      const titleText = options.title.toUpperCase();
      const titleWidth = timesBold.widthOfTextAtSize(titleText, FONT_SIZE_TITLE);
      page.drawText(titleText, {
        x: (PAGE_WIDTH - titleWidth) / 2,
        y,
        size: FONT_SIZE_TITLE,
        font: timesBold,
      });
      y -= LINE_HEIGHT * 2;
    }

    // Draw court info if provided
    if (options.court) {
      page.drawText(options.court, {
        x: MARGIN_LEFT,
        y,
        size: FONT_SIZE_BODY,
        font: timesRoman,
      });
      y -= LINE_HEIGHT;
    }

    if (options.caseCaption) {
      page.drawText(options.caseCaption, {
        x: MARGIN_LEFT,
        y,
        size: FONT_SIZE_BODY,
        font: timesRoman,
      });
      y -= LINE_HEIGHT;
    }

    if (options.caseNumber) {
      page.drawText(`Case No. ${options.caseNumber}`, {
        x: MARGIN_LEFT,
        y,
        size: FONT_SIZE_BODY,
        font: timesRoman,
      });
      y -= LINE_HEIGHT * 2;
    }

    // Draw main content
    const paragraphs = options.content.split(/\n\n+/);

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      // Check for section headers (all caps lines)
      const isHeader = /^[A-Z\s]+$/.test(trimmed) && trimmed.length < 100;

      if (isHeader) {
        // Add space before headers
        if (y < PAGE_HEIGHT - MARGIN_TOP - LINE_HEIGHT * 3) {
          y -= LINE_HEIGHT;
        }

        // Check if we need a new page
        if (y < MARGIN_BOTTOM + LINE_HEIGHT * 3) {
          page = addPage();
          y = PAGE_HEIGHT - MARGIN_TOP;
        }

        page.drawText(trimmed, {
          x: MARGIN_LEFT,
          y,
          size: FONT_SIZE_HEADING,
          font: timesBold,
        });
        y -= LINE_HEIGHT * 1.5;
      } else {
        // Regular paragraph - wrap text
        const lines = wrapText(trimmed.replace(/\n/g, ' '), timesRoman, FONT_SIZE_BODY, CONTENT_WIDTH);

        for (let i = 0; i < lines.length; i++) {
          // Check if we need a new page
          if (y < MARGIN_BOTTOM) {
            page = addPage();
            y = PAGE_HEIGHT - MARGIN_TOP;
          }

          // First line indent for paragraphs
          const indent = i === 0 ? 36 : 0;

          page.drawText(lines[i], {
            x: MARGIN_LEFT + indent,
            y,
            size: FONT_SIZE_BODY,
            font: timesRoman,
          });
          y -= LINE_HEIGHT;
        }

        y -= LINE_HEIGHT * 0.5; // Space between paragraphs
      }
    }

    // Add page numbers
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const pageNumText = `Page ${i + 1} of ${pages.length}`;
      const textWidth = timesRoman.widthOfTextAtSize(pageNumText, 10);
      pages[i].drawText(pageNumText, {
        x: (PAGE_WIDTH - textWidth) / 2,
        y: MARGIN_BOTTOM / 2,
        size: 10,
        font: timesRoman,
      });
    }

    const pdfBytes = await pdfDoc.save();

    return {
      success: true,
      data: {
        pdfBuffer: pdfBytes,
        pageCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PDF generation failed',
    };
  }
}

/**
 * Generate a detailed court-ready PDF from a MotionDocument structure
 * Use this when you have structured motion data with all sections
 */
export async function generateDetailedMotionPDF(
  doc: MotionDocument
): Promise<OperationResult<PDFGenerationResult>> {
  try {
    const pdfDoc = await PDFDocument.create();

    // Embed fonts
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    // Calculate word count
    const allText = [
      doc.introduction,
      doc.statementOfFacts,
      doc.proceduralHistory,
      doc.legalStandard,
      doc.argument,
      doc.conclusion,
    ].filter(Boolean).join(' ');
    const wordCount = countWords(allText);

    // Create first page
    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let pageCount = 1;

    // Draw caption
    let y = await drawCaption(page, doc, timesRoman, timesBold);

    // Draw title
    y = drawTitle(page, doc.motionTitle, y, timesBold);

    // Helper to add new page
    const addNewPage = (): PDFPage => {
      const newPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageCount++;
      return newPage;
    };

    // Draw introduction
    if (doc.introduction) {
      const result = drawBodyText(page, doc.introduction, y, timesRoman);
      y = result.y;

      if (result.overflow) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
        const overflowResult = drawBodyText(page, result.overflow, y, timesRoman);
        y = overflowResult.y;
      }

      y -= LINE_HEIGHT;
    }

    // Draw statement of facts
    if (doc.statementOfFacts) {
      if (y < MARGIN_BOTTOM + LINE_HEIGHT * 5) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
      }

      const heading = 'STATEMENT OF FACTS';
      page.drawText(heading, {
        x: MARGIN_LEFT,
        y,
        size: FONT_SIZE_HEADING,
        font: timesBold,
      });
      y -= LINE_HEIGHT * 1.5;

      const result = drawBodyText(page, doc.statementOfFacts, y, timesRoman);
      y = result.y;

      if (result.overflow) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
        const overflowResult = drawBodyText(page, result.overflow, y, timesRoman);
        y = overflowResult.y;
      }

      y -= LINE_HEIGHT;
    }

    // Draw procedural history
    if (doc.proceduralHistory) {
      if (y < MARGIN_BOTTOM + LINE_HEIGHT * 5) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
      }

      const heading = 'PROCEDURAL HISTORY';
      page.drawText(heading, {
        x: MARGIN_LEFT,
        y,
        size: FONT_SIZE_HEADING,
        font: timesBold,
      });
      y -= LINE_HEIGHT * 1.5;

      const result = drawBodyText(page, doc.proceduralHistory, y, timesRoman);
      y = result.y;

      if (result.overflow) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
        const overflowResult = drawBodyText(page, result.overflow, y, timesRoman);
        y = overflowResult.y;
      }

      y -= LINE_HEIGHT;
    }

    // Draw legal standard
    if (doc.legalStandard) {
      if (y < MARGIN_BOTTOM + LINE_HEIGHT * 5) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
      }

      const heading = 'LEGAL STANDARD';
      page.drawText(heading, {
        x: MARGIN_LEFT,
        y,
        size: FONT_SIZE_HEADING,
        font: timesBold,
      });
      y -= LINE_HEIGHT * 1.5;

      const result = drawBodyText(page, doc.legalStandard, y, timesRoman);
      y = result.y;

      if (result.overflow) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
        const overflowResult = drawBodyText(page, result.overflow, y, timesRoman);
        y = overflowResult.y;
      }

      y -= LINE_HEIGHT;
    }

    // Draw argument (main body)
    if (doc.argument) {
      if (y < MARGIN_BOTTOM + LINE_HEIGHT * 5) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
      }

      const heading = 'ARGUMENT';
      page.drawText(heading, {
        x: MARGIN_LEFT,
        y,
        size: FONT_SIZE_HEADING,
        font: timesBold,
      });
      y -= LINE_HEIGHT * 1.5;

      let remainingText: string | null = doc.argument;
      while (remainingText) {
        const result = drawBodyText(page, remainingText, y, timesRoman);
        y = result.y;
        remainingText = result.overflow;

        if (remainingText) {
          page = addNewPage();
          y = PAGE_HEIGHT - MARGIN_TOP;
        }
      }

      y -= LINE_HEIGHT;
    }

    // Draw conclusion
    if (doc.conclusion) {
      if (y < MARGIN_BOTTOM + LINE_HEIGHT * 5) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
      }

      const heading = 'CONCLUSION';
      page.drawText(heading, {
        x: MARGIN_LEFT,
        y,
        size: FONT_SIZE_HEADING,
        font: timesBold,
      });
      y -= LINE_HEIGHT * 1.5;

      const result = drawBodyText(page, doc.conclusion, y, timesRoman);
      y = result.y;

      y -= LINE_HEIGHT;
    }

    // Draw signature block
    if (y < MARGIN_BOTTOM + LINE_HEIGHT * 10) {
      page = addNewPage();
      y = PAGE_HEIGHT - MARGIN_TOP;
    }

    y = drawSignatureBlock(page, doc, y, timesRoman);

    // Draw certificate of service on new page if needed
    if (doc.certificateOfService) {
      if (y < MARGIN_BOTTOM + LINE_HEIGHT * 8) {
        page = addNewPage();
        y = PAGE_HEIGHT - MARGIN_TOP;
      }

      y = drawCertificateOfService(page, doc.certificateOfService, y, timesRoman, timesBold);
    }

    // Add page numbers to all pages
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
      drawPageNumber(pages[i], i + 1, pages.length, timesRoman);
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    return {
      success: true,
      data: {
        pdfBytes,
        pageCount,
        wordCount,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PDF generation failed',
    };
  }
}

/**
 * Generate default certificate of service
 */
function generateDefaultCertificate(): string {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `I hereby certify that on ${today}, I caused a true and correct copy of the foregoing document to be served upon all counsel of record via the Court's CM/ECF electronic filing system, which will send notification of such filing to all counsel of record.`;
}

/**
 * Save PDF as deliverable for an order
 */
export async function savePDFAsDeliverable(
  orderId: string,
  pdfBytes: Uint8Array,
  fileName: string,
  uploadedBy?: string // Optional user ID who approved/uploaded
): Promise<OperationResult<{ documentId: string; fileUrl: string }>> {
  // Use admin client to bypass RLS
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `deliverables/${orderId}/${timestamp}-${safeName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    // If no uploadedBy provided, get the order's client_id
    let uploaderUserId = uploadedBy;
    if (!uploaderUserId) {
      const { data: order } = await supabase
        .from('orders')
        .select('client_id')
        .eq('id', orderId)
        .single();
      uploaderUserId = order?.client_id;
    }

    // Create document record
    const { data: docRecord, error: dbError } = await supabase
      .from('documents')
      .insert({
        order_id: orderId,
        file_name: fileName,
        file_type: 'application/pdf',
        file_size: pdfBytes.length,
        file_url: filePath,
        document_type: 'deliverable',
        uploaded_by: uploaderUserId,
        is_deliverable: true,
      })
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file
      await supabase.storage.from('documents').remove([filePath]).catch(() => {});
      return { success: false, error: `Database error: ${dbError.message}` };
    }

    return {
      success: true,
      data: {
        documentId: docRecord.id,
        fileUrl: filePath,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save PDF',
    };
  }
}
