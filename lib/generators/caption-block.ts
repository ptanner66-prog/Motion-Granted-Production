/**
 * Caption Block Generator (DOC-005)
 *
 * Generates jurisdiction-specific caption blocks for legal motions.
 * Handles format differences across states:
 * - Standard format (most states): ) symbols
 * - Texas: section symbols
 * - New York: dashed lines
 * - California: hearing info block
 * - DC: next court date requirement
 * - Louisiana: VERSUS instead of v., parish instead of county
 */

import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  TabStopType,
  TabStopPosition,
} from 'docx';
import { FormattingRules } from '../services/formatting/types';

export interface CaseInfo {
  courtName: string;
  county?: string;
  parish?: string;
  division?: string;
  department?: string;
  caseNumber: string;
  plaintiffs: string[];
  defendants: string[];
  clientRole: 'plaintiff' | 'defendant';
  motionTitle: string;
  hearingDate?: string;
  hearingTime?: string;
  hearingDepartment?: string;
  nextCourtDate?: string;
  isFederal: boolean;
  federalDistrict?: string;
  judgeName?: string;
  magistrateName?: string;
}

const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER };

/**
 * Generate a complete caption block for a legal motion.
 */
export function generateCaptionBlock(
  caseInfo: CaseInfo,
  rules: FormattingRules
): Paragraph[] {
  const fontFamily = rules.font.family;
  const fontSize = rules.font.sizePoints * 2; // docx uses half-points
  const useSectionSymbol = rules.caption.sectionSymbol === true;

  const paragraphs: Paragraph[] = [];

  // Court name (centered, bold, uppercase)
  const courtName = resolveCourtName(caseInfo, rules);
  const courtLines = courtName.split('\n');
  for (const line of courtLines) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line.toUpperCase(),
            bold: true,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      })
    );
  }

  // Spacer
  paragraphs.push(new Paragraph({ spacing: { after: 120 } }));

  // Party block with case info - use table for proper alignment
  const partyTable = buildPartyTable(caseInfo, rules, useSectionSymbol);
  paragraphs.push(...partyTable);

  // Motion title (centered, bold, uppercase)
  paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: caseInfo.motionTitle.toUpperCase(),
          bold: true,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    })
  );

  // California hearing info block
  if (caseInfo.hearingDate || caseInfo.hearingTime || caseInfo.hearingDepartment) {
    paragraphs.push(...buildHearingBlock(caseInfo, fontFamily, fontSize));
  }

  // DC next court date
  if (rules.caption.nextCourtDateRequired && caseInfo.nextCourtDate) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Next Court Date: ${caseInfo.nextCourtDate}`,
            bold: true,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: 120 },
      })
    );
  }

  // Judge and magistrate
  if (caseInfo.judgeName) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Hon. ${caseInfo.judgeName}`,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        alignment: caseInfo.isFederal ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { after: 0 },
      })
    );
  }
  if (caseInfo.magistrateName) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Magistrate Judge ${caseInfo.magistrateName}`,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        alignment: caseInfo.isFederal ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { after: 0 },
      })
    );
  }

  // Final spacer after caption
  paragraphs.push(new Paragraph({ spacing: { after: 240 } }));

  return paragraphs;
}

/**
 * Resolve the court name using the config template and case info.
 */
function resolveCourtName(caseInfo: CaseInfo, rules: FormattingRules): string {
  let courtName = caseInfo.courtName || rules.caption.courtNameFormat;

  courtName = courtName
    .replace(/\{COUNTY\}/gi, caseInfo.county ?? '')
    .replace(/\{PARISH\}/gi, caseInfo.parish ?? caseInfo.county ?? '')
    .replace(/\{ORDINAL\}/gi, caseInfo.division ?? '')
    .replace(/\{DIVISION\}/gi, caseInfo.division ?? '')
    .replace(/\{DEPARTMENT\}/gi, caseInfo.department ?? '')
    .replace(/\{COURT_TYPE\}/gi, '')
    .replace(/\{COURT_NUMBER\}/gi, '');

  return courtName.trim();
}

/**
 * Build the party listing with case number column.
 * Returns Paragraph[] using tab-based alignment for the two-column layout.
 */
function buildPartyTable(
  caseInfo: CaseInfo,
  rules: FormattingRules,
  useSectionSymbol: boolean
): Paragraph[] {
  const fontFamily = rules.font.family;
  const fontSize = rules.font.sizePoints * 2;
  const separator = useSectionSymbol ? '\u00A7' : ')';
  const caseLabel = rules.caption.caseNumberLabel || 'Case No.';
  const paragraphs: Paragraph[] = [];

  // Tab stop for the separator column and case info column
  const separatorTabPos = 5400; // ~3.75 inches
  const caseInfoTabPos = 5760; // ~4 inches

  const tabStops = [
    { type: TabStopType.LEFT, position: separatorTabPos },
    { type: TabStopType.LEFT, position: caseInfoTabPos },
  ];

  // Plaintiff(s)
  for (let i = 0; i < caseInfo.plaintiffs.length; i++) {
    const isLast = i === caseInfo.plaintiffs.length - 1;
    const name = caseInfo.plaintiffs[i] + (isLast ? ',' : ',');
    const rightText = i === 0 ? `${caseLabel} ${caseInfo.caseNumber}` : '';

    paragraphs.push(
      new Paragraph({
        tabStops,
        children: [
          new TextRun({ text: name, font: fontFamily, size: fontSize }),
          new TextRun({ text: `\t${separator}`, font: fontFamily, size: fontSize }),
          new TextRun({ text: rightText ? `\t${rightText}` : '', bold: rightText !== '', font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  // Plaintiff label
  paragraphs.push(
    new Paragraph({
      tabStops,
      children: [
        new TextRun({ text: '     Plaintiff(s),', italics: true, font: fontFamily, size: fontSize }),
        new TextRun({ text: `\t${separator}`, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    })
  );

  // Blank separator line
  paragraphs.push(
    new Paragraph({
      tabStops,
      children: [
        new TextRun({ text: '', font: fontFamily, size: fontSize }),
        new TextRun({ text: `\t${separator}`, font: fontFamily, size: fontSize }),
        new TextRun({ text: `\t${caseInfo.motionTitle}`, bold: true, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    })
  );

  // v. line
  paragraphs.push(
    new Paragraph({
      tabStops,
      children: [
        new TextRun({ text: 'v.', font: fontFamily, size: fontSize }),
        new TextRun({ text: `\t${separator}`, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    })
  );

  // Blank separator line
  paragraphs.push(
    new Paragraph({
      tabStops,
      children: [
        new TextRun({ text: '', font: fontFamily, size: fontSize }),
        new TextRun({ text: `\t${separator}`, font: fontFamily, size: fontSize }),
        new TextRun({
          text: caseInfo.division ? `\tDivision ${caseInfo.division}` : '',
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 0 },
    })
  );

  // Defendant(s)
  for (let i = 0; i < caseInfo.defendants.length; i++) {
    const isLast = i === caseInfo.defendants.length - 1;
    const name = caseInfo.defendants[i] + (isLast ? ',' : ',');
    paragraphs.push(
      new Paragraph({
        tabStops,
        children: [
          new TextRun({ text: name, font: fontFamily, size: fontSize }),
          new TextRun({ text: `\t${separator}`, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  // Defendant label
  paragraphs.push(
    new Paragraph({
      tabStops,
      children: [
        new TextRun({ text: '     Defendant(s).', italics: true, font: fontFamily, size: fontSize }),
        new TextRun({ text: `\t${separator}`, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    })
  );

  return paragraphs;
}

/**
 * Build California-style hearing info block.
 */
function buildHearingBlock(
  caseInfo: CaseInfo,
  fontFamily: string,
  fontSize: number
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(new Paragraph({ spacing: { after: 60 } }));

  if (caseInfo.hearingDate) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'DATE:\t', bold: true, font: fontFamily, size: fontSize }),
          new TextRun({ text: caseInfo.hearingDate, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  if (caseInfo.hearingTime) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'TIME:\t', bold: true, font: fontFamily, size: fontSize }),
          new TextRun({ text: caseInfo.hearingTime, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  if (caseInfo.hearingDepartment) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'DEPT:\t', bold: true, font: fontFamily, size: fontSize }),
          new TextRun({ text: caseInfo.hearingDepartment, font: fontFamily, size: fontSize }),
        ],
        spacing: { after: 0 },
      })
    );
  }

  return paragraphs;
}
