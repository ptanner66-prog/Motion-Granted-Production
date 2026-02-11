/**
 * Signature Block Generator
 *
 * Generates the attorney signature block appended to every motion.
 */

import { Paragraph, TextRun, AlignmentType } from 'docx';
import type { MotionData } from './types';

/**
 * Build the signature block paragraphs for a motion document.
 */
export function buildSignatureBlock(data: MotionData): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // "Respectfully submitted," line
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: 'Respectfully submitted,',
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { before: 480, after: 480 },
  }));

  // Date line
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: `Dated: ${data.filingDate}`,
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { after: 480 },
  }));

  // Signature line
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: `/s/ ${data.attorneyName}`,
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { after: 120 },
  }));

  // Underline separator
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: '________________________________',
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { after: 120 },
  }));

  // Attorney name and bar number
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: data.attorneyName,
      bold: true,
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { after: 40 },
  }));

  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: `Bar No. ${data.barNumber}`,
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { after: 120 },
  }));

  // Firm info
  if (data.firmName) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: data.firmName,
        font: 'Times New Roman',
        size: 24,
      })],
      spacing: { after: 40 },
    }));
  }

  if (data.firmAddress) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: data.firmAddress,
        font: 'Times New Roman',
        size: 24,
      })],
      spacing: { after: 40 },
    }));
  }

  if (data.firmPhone) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: `Tel: ${data.firmPhone}`,
        font: 'Times New Roman',
        size: 24,
      })],
      spacing: { after: 40 },
    }));
  }

  if (data.firmEmail) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: `Email: ${data.firmEmail}`,
        font: 'Times New Roman',
        size: 24,
      })],
      spacing: { after: 40 },
    }));
  }

  // Role line
  const roleLabel = data.clientRole === 'plaintiff' ? 'Plaintiff' :
    data.clientRole === 'defendant' ? 'Defendant' :
    data.clientRole === 'petitioner' ? 'Petitioner' : 'Respondent';

  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: `Attorney for ${roleLabel}`,
      italics: true,
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { before: 120, after: 240 },
  }));

  return paragraphs;
}
