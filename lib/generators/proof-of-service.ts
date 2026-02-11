/**
 * Proof of Service Generator
 *
 * Generates proof of service documents for legal filings.
 * Supports electronic, mail, personal, and fax service methods.
 */

import { Paragraph, TextRun, AlignmentType } from 'docx';
import { FormattingRules } from '../services/formatting/types';

export interface ServiceInfo {
  serverName: string;
  serverTitle?: string;
  serviceDate: string;
  serviceMethod: 'electronic' | 'mail' | 'personal' | 'fax';
  servedParties: {
    name: string;
    firmName?: string;
    address?: string[];
    email?: string;
  }[];
  documentsServed: string[];
  rules: FormattingRules;
  isFederal: boolean;
  stateCode: string;
}

const SERVICE_METHOD_TEXT: Record<string, string> = {
  electronic: 'electronic transmission via the Court\'s CM/ECF system',
  mail: 'United States mail, postage prepaid',
  personal: 'personal service',
  fax: 'facsimile transmission',
};

/**
 * Generate a Proof of Service document.
 */
export function generateProofOfService(info: ServiceInfo): Paragraph[] {
  const fontFamily = info.rules.font.family;
  const fontSize = info.rules.font.sizePoints * 2;
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'PROOF OF SERVICE',
          bold: true,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    })
  );

  // Build document list
  const docListText = info.documentsServed.length === 1
    ? info.documentsServed[0]
    : info.documentsServed.map((d, i) => `(${i + 1}) ${d}`).join('; ');

  // Service method description
  const methodText = SERVICE_METHOD_TEXT[info.serviceMethod] ?? info.serviceMethod;

  // Opening paragraph
  const openingText = `I, ${info.serverName}${info.serverTitle ? `, ${info.serverTitle}` : ''}, declare that on ${info.serviceDate}, I served the foregoing ${docListText} on the following parties by ${methodText}:`;

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: openingText, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 360, line: info.rules.font.lineSpacingDXA },
    })
  );

  // List of served parties
  for (const party of info.servedParties) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: party.name, bold: true, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
        indent: { left: 720 },
      })
    );

    if (party.firmName) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: party.firmName, font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 0 },
          indent: { left: 720 },
        })
      );
    }

    if (party.address) {
      for (const line of party.address) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: line, font: fontFamily, size: fontSize }),
            ],
            spacing: { after: 0 },
            indent: { left: 720 },
          })
        );
      }
    }

    if (party.email) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: party.email, font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 0 },
          indent: { left: 720 },
        })
      );
    }

    // Spacer between parties
    paragraphs.push(new Paragraph({ spacing: { after: 240 }, indent: { left: 720 } }));
  }

  // Jurat
  paragraphs.push(new Paragraph({ spacing: { after: 120 } }));

  const juratType = info.rules.jurat.type;

  if (juratType === 'affidavit' && !info.isFederal) {
    // Affidavit-state POS jurat
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'SWORN TO AND SUBSCRIBED before me',
            bold: true,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 0 },
      })
    );
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `this ___ day of _______, ${new Date().getFullYear()}`,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 360 },
      })
    );
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: '_________________________________', font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'NOTARY PUBLIC', bold: true, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  } else {
    // Declaration format
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'I declare under penalty of perjury that the foregoing is true and correct.',
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 360 },
      })
    );
  }

  // Signature
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: `/s/ ${info.serverName}`, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    })
  );

  return paragraphs;
}
