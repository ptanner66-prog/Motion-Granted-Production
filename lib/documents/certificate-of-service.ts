/**
 * Certificate of Service Generator
 *
 * Appended to every motion filing. Certifies that copies were served
 * to all counsel of record.
 */

import {
  Paragraph,
  TextRun,
  AlignmentType,
  PageBreak,
} from 'docx';
import type { MotionData } from './types';

/**
 * Build the certificate of service paragraphs for a motion document.
 * Starts on a new page.
 */
export function buildCertificateOfService(data: MotionData): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Page break before certificate
  paragraphs.push(new Paragraph({
    children: [new TextRun({ break: 1 })],
    pageBreakBefore: true,
  }));

  // Heading
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: 'CERTIFICATE OF SERVICE',
      bold: true,
      font: 'Times New Roman',
      size: 24,
      allCaps: true,
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 480 },
  }));

  // Body text
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: `I hereby certify that a copy of the foregoing ${data.motionTitle.toUpperCase()} was served upon all counsel of record by electronic filing through the court's electronic filing system on ${data.filingDate}.`,
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { after: 480, line: 480 },
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

  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: data.attorneyName,
      bold: true,
      font: 'Times New Roman',
      size: 24,
    })],
    spacing: { after: 40 },
  }));

  return paragraphs;
}
