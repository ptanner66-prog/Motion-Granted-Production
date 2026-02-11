/**
 * Declaration/Affidavit Generator (DOC-012)
 *
 * Generates declarations and affidavits based on jurisdiction rules.
 *
 * Jurat selection logic:
 * - Federal: Always 28 USC 1746 declaration format
 * - Affidavit states (LA, ME, AL, AR): Sworn/notarized format
 * - Wyoming: "false swearing" terminology
 * - All others: Standard declaration under penalty of perjury
 */

import { Paragraph, TextRun, AlignmentType } from 'docx';
import { FormattingRules } from '../services/formatting/types';

export interface DeclarationInput {
  declarant: {
    name: string;
    title?: string;
    relationship?: string;
  };
  content: string[];
  rules: FormattingRules;
  isFederal: boolean;
  executionCity?: string;
  executionState?: string;
  executionDate?: string;
}

/**
 * Generate a declaration or affidavit with numbered paragraphs and
 * the correct jurat for the jurisdiction.
 */
export function generateDeclaration(input: DeclarationInput): Paragraph[] {
  const fontFamily = input.rules.font.family;
  const fontSize = input.rules.font.sizePoints * 2;
  const paragraphs: Paragraph[] = [];
  const dateStr = input.executionDate ?? new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const juratType = resolveJuratType(input);

  // Title
  const title = juratType === 'affidavit'
    ? `AFFIDAVIT OF ${input.declarant.name.toUpperCase()}`
    : `DECLARATION OF ${input.declarant.name.toUpperCase()}`;

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: title, bold: true, font: fontFamily, size: fontSize }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    })
  );

  // Opening statement
  const openingText = buildOpeningStatement(input, juratType);
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: openingText, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 240, line: input.rules.font.lineSpacingDXA },
    })
  );

  // Numbered content paragraphs
  for (let i = 0; i < input.content.length; i++) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${i + 1}. `,
            bold: true,
            font: fontFamily,
            size: fontSize,
          }),
          new TextRun({
            text: input.content[i],
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 240, line: input.rules.font.lineSpacingDXA },
        indent: { left: 720, hanging: 360 },
      })
    );
  }

  // Jurat / closing
  paragraphs.push(...buildJurat(input, juratType, fontFamily, fontSize, dateStr));

  return paragraphs;
}

/**
 * Determine which jurat type to use based on jurisdiction and federal status.
 */
function resolveJuratType(input: DeclarationInput): 'federal' | 'affidavit' | 'false_swearing' | 'declaration' {
  if (input.isFederal) {
    return 'federal';
  }

  if (input.rules.jurat.type === 'affidavit') {
    return 'affidavit';
  }

  // Check for special terminology (e.g., Wyoming "false swearing")
  const juratLang = input.rules.jurat.language.toLowerCase();
  if (juratLang.includes('false swearing')) {
    return 'false_swearing';
  }

  return 'declaration';
}

function buildOpeningStatement(input: DeclarationInput, juratType: string): string {
  const name = input.declarant.name;
  const relationship = input.declarant.relationship ? `, ${input.declarant.relationship}` : '';

  if (juratType === 'affidavit') {
    return `I, ${name}${relationship}, being duly sworn, depose and state as follows:`;
  }

  return `I, ${name}${relationship}, declare as follows:`;
}

function buildJurat(
  input: DeclarationInput,
  juratType: string,
  fontFamily: string,
  fontSize: number,
  dateStr: string
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const city = input.executionCity ?? '';
  const state = input.executionState ?? '';
  const location = city && state ? `${city}, ${state}` : city || state;

  paragraphs.push(new Paragraph({ spacing: { after: 240 } }));

  switch (juratType) {
    case 'federal': {
      // 28 USC 1746 declaration format
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'I declare under penalty of perjury that the foregoing is true and correct.',
              font: fontFamily,
              size: fontSize,
            }),
          ],
          spacing: { after: 120 },
        })
      );
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Executed on ${dateStr}.`,
              font: fontFamily,
              size: fontSize,
            }),
          ],
          spacing: { after: 240 },
        })
      );
      // Signature line
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
            new TextRun({ text: input.declarant.name, font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 0 },
        })
      );
      break;
    }

    case 'affidavit': {
      // Sworn/notarized format (LA, ME, AL, AR)
      const juratText = input.rules.jurat.language
        .replace(/\{NAME\}/g, input.declarant.name)
        .replace(/\{PARISH\}/g, city || '[Parish/County]')
        .replace(/\{COUNTY\}/g, city || '[Parish/County]')
        .replace(/\{DOCUMENT_TYPE\}/g, 'affidavit')
        .replace(/\{DATE\}/g, dateStr);

      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: juratText, font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 240 },
        })
      );

      // Signature line for affiant
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
            new TextRun({ text: input.declarant.name, font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 360 },
        })
      );

      // Notary block
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
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'My commission expires: ___________', font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 0 },
        })
      );
      break;
    }

    case 'false_swearing': {
      // Wyoming format
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `I declare under penalty of false swearing that the foregoing is true and correct. Executed on ${dateStr}${location ? ` at ${location}` : ''}.`,
              font: fontFamily,
              size: fontSize,
            }),
          ],
          spacing: { after: 240 },
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
            new TextRun({ text: input.declarant.name, font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 0 },
        })
      );
      break;
    }

    default: {
      // Standard state declaration
      const juratText = input.rules.jurat.language
        .replace(/\{NAME\}/g, input.declarant.name)
        .replace(/\{STATE\}/g, state || '[State]')
        .replace(/\{DATE\}/g, dateStr)
        .replace(/\{CITY\}/g, city || '[City]')
        .replace(/\{COUNTY\}/g, city || '[County]');

      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: juratText, font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 240 },
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
            new TextRun({ text: input.declarant.name, font: fontFamily, size: fontSize }),
          ],
          spacing: { after: 0 },
        })
      );
      break;
    }
  }

  return paragraphs;
}
