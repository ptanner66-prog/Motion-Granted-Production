/**
 * Signature Block Generator (DOC-006)
 *
 * Generates attorney signature blocks for legal filings.
 * Supports both e-filed (/s/) and paper-filed (line) formats.
 */

import { Paragraph, TextRun, AlignmentType } from 'docx';

export interface AttorneyInfo {
  name: string;
  firmName?: string;
  barNumber: string;
  barState: string;
  address: string[];
  phone: string;
  fax?: string;
  email: string;
  representingParty: string;
}

/**
 * Generate a signature block for a legal filing.
 */
export function generateSignatureBlock(
  attorney: AttorneyInfo,
  options: {
    isEfiled: boolean;
    includeDate: boolean;
    dateValue?: string;
  }
): Paragraph[] {
  const fontFamily = 'Times New Roman';
  const fontSize = 24; // 12pt in half-points

  const paragraphs: Paragraph[] = [];
  const dateStr = options.dateValue ?? new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // "Respectfully submitted,"
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Respectfully submitted,', font: fontFamily, size: fontSize }),
      ],
      spacing: { before: 480, after: 240 },
    })
  );

  // Signature line
  if (options.isEfiled) {
    // E-filed: /s/ Name
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: `/s/ ${attorney.name}`, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  } else {
    // Paper-filed: blank signature line
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: '_________________________________', font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  // Attorney name with bar info
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${attorney.name} (${attorney.barState} Bar No. ${attorney.barNumber})`,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 0 },
    })
  );

  // Firm name (if present)
  if (attorney.firmName) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: attorney.firmName, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  // Address lines
  for (const line of attorney.address) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: line, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  // Phone
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: attorney.phone, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    })
  );

  // Fax (if present)
  if (attorney.fax) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Fax: ${attorney.fax}`, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  // Email
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: attorney.email, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    })
  );

  // Attorney for [Party]
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Attorney for ${attorney.representingParty}`,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 0 },
    })
  );

  // Date (if included)
  if (options.includeDate) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Dated: ${dateStr}`, font: fontFamily, size: fontSize }),
        ],
        spacing: { before: 240, after: 0 },
      })
    );
  }

  return paragraphs;
}
