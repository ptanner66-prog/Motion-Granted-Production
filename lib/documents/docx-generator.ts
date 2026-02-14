/**
 * DOCX Generator — Motion Granted
 *
 * Core document generation engine. Takes MotionData (assembled from
 * Phase V/VIII output) and produces a court-ready DOCX file with
 * jurisdiction-specific formatting.
 *
 * Uses the `docx` npm package (docx-js).
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  convertInchesToTwip,
} from 'docx';
import type { MotionData, MotionSection } from './types';
import { getFormattingRules, type FormattingRules } from './formatting-engine';
import { buildCaptionBlock } from './caption-block';
import { buildSignatureBlock } from './signature-block';
import { buildCertificateOfService } from './certificate-of-service';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('documents-docx-generator');
import {
  sanitizePartyName,
  sanitizeForDocument,
  sanitizeSectionContent,
} from '@/lib/utils/text-sanitizer';

/**
 * Generate a complete DOCX file for a motion.
 *
 * @param data - All motion data from the workflow pipeline
 * @returns Buffer containing the DOCX file
 */
export async function generateMotionDocx(data: MotionData): Promise<Buffer> {
  // Sanitize all user-provided text before document generation (SP20: XSS-001–003)
  const sanitizedData = sanitizeMotionData(data);
  const jurisdiction = normalizeJurisdiction(sanitizedData.jurisdiction);
  const rules = getFormattingRules(jurisdiction);

  log.info(`[DOCX-GEN] Jurisdiction: ${jurisdiction} → paper: ${rules.paperSize?.name ?? 'letter'} (${rules.paperSize?.widthDXA ?? 12240}×${rules.paperSize?.heightDXA ?? 15840}), margins: T${rules.margins.top}" B${rules.margins.bottom}" L${rules.margins.left}" R${rules.margins.right}"`);

  // Build all document sections using sanitized data
  const captionParagraphs = buildCaptionBlock(sanitizedData);
  const bodyParagraphs = buildBodyParagraphs(sanitizedData, rules);
  const signatureParagraphs = buildSignatureBlock(sanitizedData);
  const certParagraphs = buildCertificateOfService(sanitizedData);

  // Line spacing value
  const lineSpacingValue = getLineSpacingDxa(rules.lineSpacing);

  // Create the document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: rules.font.name,
            size: rules.font.size * 2, // docx uses half-points
          },
          paragraph: {
            spacing: { line: lineSpacingValue },
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: rules.paperSize?.widthDXA ?? 12240,
            height: rules.paperSize?.heightDXA ?? 15840,
          },
          margin: {
            top: convertInchesToTwip(rules.margins.top),
            bottom: convertInchesToTwip(rules.margins.bottom),
            left: convertInchesToTwip(rules.margins.left),
            right: convertInchesToTwip(rules.margins.right),
          },
        },
        lineNumbers: rules.lineNumbers ? {
          countBy: 1,
          restart: 'newPage' as const,
        } : undefined,
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Page ', font: 'Times New Roman', size: 20 }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 20 }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children: [
        ...captionParagraphs,
        ...bodyParagraphs,
        ...signatureParagraphs,
        ...certParagraphs,
      ],
    }],
  });

  // Pack to buffer
  const buffer = await Packer.toBuffer(doc);
  log.info(`[DOCX-GEN] Generated ${buffer.length} bytes for order ${sanitizedData.orderId}`);
  return buffer;
}

/**
 * Sanitize all user-provided fields in MotionData before document generation.
 * Party names get aggressive sanitization; freeform text gets HTML stripping
 * and control character removal.
 */
function sanitizeMotionData(data: MotionData): MotionData {
  return {
    ...data,
    // Party names: aggressive sanitization
    plaintiffs: data.plaintiffs.map(sanitizePartyName),
    defendants: data.defendants.map(sanitizePartyName),
    // Attorney info: general sanitization
    attorneyName: sanitizeForDocument(data.attorneyName),
    firmName: sanitizeForDocument(data.firmName),
    firmAddress: sanitizeForDocument(data.firmAddress),
    firmPhone: sanitizeForDocument(data.firmPhone),
    firmEmail: sanitizeForDocument(data.firmEmail),
    barNumber: sanitizeForDocument(data.barNumber),
    // Case info: general sanitization
    court: sanitizeForDocument(data.court),
    caseNumber: sanitizeForDocument(data.caseNumber),
    caseCaption: sanitizeForDocument(data.caseCaption),
    motionTitle: sanitizeForDocument(data.motionTitle),
    parish: data.parish ? sanitizeForDocument(data.parish) : undefined,
    division: data.division ? sanitizeForDocument(data.division) : undefined,
    department: data.department ? sanitizeForDocument(data.department) : undefined,
    // Body content: section-level sanitization (preserves newlines/formatting)
    motionBody: sanitizeSectionContent(data.motionBody),
    sections: data.sections.map((section) => ({
      ...section,
      heading: sanitizeForDocument(section.heading),
      content: sanitizeSectionContent(section.content),
    })),
  };
}

/**
 * Parse motion body text (markdown-ish) into docx paragraphs.
 */
function buildBodyParagraphs(data: MotionData, rules: FormattingRules): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const fontSize = rules.font.size * 2; // half-points
  const lineSpacing = getLineSpacingDxa(rules.lineSpacing);

  // If structured sections are provided, use them
  if (data.sections.length > 0) {
    for (const section of data.sections) {
      // Section heading
      const headingLevel = section.level === 1 ? HeadingLevel.HEADING_1 :
        section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;

      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: section.heading,
          bold: true,
          font: rules.font.name,
          size: fontSize,
        })],
        heading: headingLevel,
        spacing: { before: 360, after: 240, line: lineSpacing },
      }));

      // Section content — split by double newlines into paragraphs
      const contentParagraphs = section.content.split(/\n\n+/);
      for (const para of contentParagraphs) {
        if (!para.trim()) continue;
        paragraphs.push(buildContentParagraph(para.trim(), rules));
      }
    }
    return paragraphs;
  }

  // Fallback: parse motionBody as markdown-style text
  if (!data.motionBody) return paragraphs;

  const lines = data.motionBody.split('\n');
  let currentParagraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Heading detection
    if (trimmed.startsWith('# ')) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        paragraphs.push(buildContentParagraph(currentParagraph.join(' '), rules));
        currentParagraph = [];
      }
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: trimmed.replace(/^#+\s*/, ''),
          bold: true,
          font: rules.font.name,
          size: fontSize,
        })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 240, line: lineSpacing },
      }));
    } else if (trimmed.startsWith('## ')) {
      if (currentParagraph.length > 0) {
        paragraphs.push(buildContentParagraph(currentParagraph.join(' '), rules));
        currentParagraph = [];
      }
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: trimmed.replace(/^#+\s*/, ''),
          bold: true,
          font: rules.font.name,
          size: fontSize,
        })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120, line: lineSpacing },
      }));
    } else if (trimmed.startsWith('### ')) {
      if (currentParagraph.length > 0) {
        paragraphs.push(buildContentParagraph(currentParagraph.join(' '), rules));
        currentParagraph = [];
      }
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: trimmed.replace(/^#+\s*/, ''),
          bold: true,
          font: rules.font.name,
          size: fontSize,
        })],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120, line: lineSpacing },
      }));
    } else if (trimmed === '') {
      // Empty line = paragraph break
      if (currentParagraph.length > 0) {
        paragraphs.push(buildContentParagraph(currentParagraph.join(' '), rules));
        currentParagraph = [];
      }
    } else {
      currentParagraph.push(trimmed);
    }
  }

  // Flush remaining content
  if (currentParagraph.length > 0) {
    paragraphs.push(buildContentParagraph(currentParagraph.join(' '), rules));
  }

  return paragraphs;
}

/**
 * Build a single body text paragraph, handling inline citation formatting.
 */
function buildContentParagraph(text: string, rules: FormattingRules): Paragraph {
  const fontSize = rules.font.size * 2;
  const lineSpacing = getLineSpacingDxa(rules.lineSpacing);

  // Match citation patterns like "Smith v. Jones, 123 F.3d 456 (5th Cir. 2020)"
  const citationPattern = /([A-Z][a-zA-Z'-]+\s+v\.\s+[A-Z][a-zA-Z'-]+),\s+(\d+\s+\S+\s+\d+)\s+(\([^)]+\))/g;
  const runs: TextRun[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    // Text before the citation
    if (match.index > lastIndex) {
      runs.push(new TextRun({
        text: text.slice(lastIndex, match.index),
        font: rules.font.name,
        size: fontSize,
      }));
    }

    // Case name (italic)
    runs.push(new TextRun({
      text: match[1],
      italics: true,
      font: rules.font.name,
      size: fontSize,
    }));

    // Reporter citation (normal)
    runs.push(new TextRun({
      text: `, ${match[2]} ${match[3]}`,
      font: rules.font.name,
      size: fontSize,
    }));

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last citation
  if (lastIndex < text.length) {
    runs.push(new TextRun({
      text: text.slice(lastIndex),
      font: rules.font.name,
      size: fontSize,
    }));
  }

  // If no citations found, single run
  if (runs.length === 0) {
    runs.push(new TextRun({
      text,
      font: rules.font.name,
      size: fontSize,
    }));
  }

  return new Paragraph({
    children: runs,
    spacing: { after: 240, line: lineSpacing },
  });
}

/**
 * Normalize jurisdiction string to the format used by formatting-engine.
 */
function normalizeJurisdiction(jurisdiction: string): string {
  const j = jurisdiction.toLowerCase().replace(/[\s_-]+/g, '_');
  if (j.includes('la') && j.includes('state')) return 'la_state';
  if (j.includes('ca') && j.includes('federal')) return 'ca_federal';
  if (j.includes('ca') && (j.includes('state') || j.includes('superior'))) return 'ca_superior';
  if (j.includes('5th') || j.includes('fifth')) return 'federal_5th';
  if (j.includes('9th') || j.includes('ninth')) return 'federal_9th';
  // Pass through as-is for already normalized strings
  return j;
}

/**
 * Convert line spacing string to DXA value.
 */
function getLineSpacingDxa(spacing: string): number {
  switch (spacing) {
    case 'single': return 240;
    case '1.5': return 360;
    case 'double': return 480;
    default: return 480;
  }
}
