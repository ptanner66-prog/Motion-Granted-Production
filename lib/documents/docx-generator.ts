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

/**
 * Generate a complete DOCX file for a motion.
 *
 * @param data - All motion data from the workflow pipeline
 * @returns Buffer containing the DOCX file
 */
export async function generateMotionDocx(data: MotionData): Promise<Buffer> {
  const jurisdiction = normalizeJurisdiction(data.jurisdiction);
  const rules = getFormattingRules(jurisdiction);

  // Build all document sections
  const captionParagraphs = buildCaptionBlock(data);
  const bodyParagraphs = buildBodyParagraphs(data, rules);
  const signatureParagraphs = buildSignatureBlock(data);
  const certParagraphs = buildCertificateOfService(data);

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
            width: 12240,   // US Letter width in DXA (8.5 inches)
            height: 15840,  // US Letter height in DXA (11 inches)
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
  console.log(`[DOCX-GEN] Generated ${buffer.length} bytes for order ${data.orderId}`);
  return buffer;
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
