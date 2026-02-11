/**
 * Caption Block Generator
 *
 * Generates court caption block per jurisdiction-specific formatting rules.
 * Used as the opening section of every motion document.
 *
 * Louisiana State: Parish-specific formatting, left-aligned
 * California State: Left-aligned, specific spacing
 * Federal: Centered court name
 */

import {
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  TabStopType,
  convertInchesToTwip,
} from 'docx';
import type { MotionData } from './types';

/**
 * Build the caption block paragraphs for a motion document.
 */
export function buildCaptionBlock(data: MotionData): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const isFederal = data.jurisdiction.toLowerCase().includes('federal') ||
    data.jurisdiction.toLowerCase().includes('5th') ||
    data.jurisdiction.toLowerCase().includes('9th');
  const isLouisiana = data.jurisdiction.toLowerCase().includes('la');
  const alignment = isFederal ? AlignmentType.CENTER : AlignmentType.LEFT;

  // Court name line
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: data.court.toUpperCase(),
      bold: true,
      font: 'Times New Roman',
      size: 24, // 12pt
    })],
    alignment,
    spacing: { after: 120 },
  }));

  // Parish/county line (Louisiana specific)
  if (isLouisiana && data.parish) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: `PARISH OF ${data.parish.toUpperCase()}`,
        bold: true,
        font: 'Times New Roman',
        size: 24,
      })],
      alignment,
      spacing: { after: 120 },
    }));

    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: 'STATE OF LOUISIANA',
        bold: true,
        font: 'Times New Roman',
        size: 24,
      })],
      alignment,
      spacing: { after: 240 },
    }));
  }

  // Blank separator
  paragraphs.push(new Paragraph({ spacing: { after: 240 } }));

  // Plaintiff(s) names
  for (const plaintiff of data.plaintiffs) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: plaintiff.toUpperCase(),
        bold: true,
        font: 'Times New Roman',
        size: 24,
      })],
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
    }));
  }

  // VERSUS line with case number on the right using tab stops
  paragraphs.push(new Paragraph({
    children: [
      new TextRun({
        text: '',
        font: 'Times New Roman',
        size: 24,
      }),
    ],
    spacing: { after: 40 },
  }));

  paragraphs.push(new Paragraph({
    children: [
      new TextRun({
        text: '\tVERSUS',
        font: 'Times New Roman',
        size: 24,
      }),
      new TextRun({
        text: `\tNo. ${data.caseNumber}`,
        bold: true,
        font: 'Times New Roman',
        size: 24,
      }),
    ],
    tabStops: [
      { type: TabStopType.LEFT, position: convertInchesToTwip(0.5) },
      { type: TabStopType.RIGHT, position: convertInchesToTwip(6.5) },
    ],
    spacing: { after: 40 },
  }));

  // Division/department if applicable
  if (data.division) {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: '', font: 'Times New Roman', size: 24 }),
        new TextRun({
          text: `\t${data.division}`,
          font: 'Times New Roman',
          size: 24,
        }),
      ],
      tabStops: [
        { type: TabStopType.RIGHT, position: convertInchesToTwip(6.5) },
      ],
      spacing: { after: 40 },
    }));
  }

  paragraphs.push(new Paragraph({ spacing: { after: 40 } }));

  // Defendant(s) names
  for (const defendant of data.defendants) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: defendant.toUpperCase(),
        bold: true,
        font: 'Times New Roman',
        size: 24,
      })],
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
    }));
  }

  // Horizontal rule separator
  paragraphs.push(new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
    },
    spacing: { after: 240 },
  }));

  // Motion title
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: data.motionTitle.toUpperCase(),
      bold: true,
      font: 'Times New Roman',
      size: 24,
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 480 },
  }));

  return paragraphs;
}
