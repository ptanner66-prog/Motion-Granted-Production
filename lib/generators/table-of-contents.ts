/**
 * Table of Contents / Table of Authorities Generator (DOC-007)
 *
 * Generates:
 * - Table of Contents with dot leaders and right-aligned page numbers
 * - Table of Authorities grouped by type (cases, statutes, rules, other)
 *
 * Uses docx tab stops for proper dot leader alignment.
 */

import { Paragraph, TextRun, AlignmentType, TabStopType, TabStopPosition } from 'docx';

export interface TOCEntry {
  title: string;
  level: number;
  pageNumber: number;
}

export interface TOAEntry {
  citation: string;
  type: 'case' | 'statute' | 'rule' | 'other';
  pageNumbers: number[];
}

const FONT_FAMILY = 'Times New Roman';
const FONT_SIZE = 24; // 12pt in half-points
const RIGHT_TAB_POS = 9360; // ~6.5 inches (standard for letter with 1" margins)

/**
 * Generate a Table of Contents.
 */
export function generateTableOfContents(entries: TOCEntry[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'TABLE OF CONTENTS',
          bold: true,
          font: FONT_FAMILY,
          size: FONT_SIZE,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
    })
  );

  // Entries
  for (const entry of entries) {
    const indent = entry.level > 1 ? (entry.level - 1) * 720 : 0;
    const prefix = entry.level === 1 ? '' : '';

    paragraphs.push(
      new Paragraph({
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: RIGHT_TAB_POS - indent,
            leader: 'dot' as unknown as undefined,
          },
        ],
        children: [
          new TextRun({
            text: `${prefix}${entry.title}`,
            font: FONT_FAMILY,
            size: FONT_SIZE,
            bold: entry.level === 1,
          }),
          new TextRun({
            text: `\t${entry.pageNumber}`,
            font: FONT_FAMILY,
            size: FONT_SIZE,
          }),
        ],
        indent: { left: indent },
        spacing: { after: entry.level === 1 ? 120 : 60 },
      })
    );
  }

  // Page break after TOC
  paragraphs.push(new Paragraph({ spacing: { after: 0 } }));

  return paragraphs;
}

/**
 * Generate a Table of Authorities grouped by type.
 */
export function generateTableOfAuthorities(entries: TOAEntry[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'TABLE OF AUTHORITIES',
          bold: true,
          font: FONT_FAMILY,
          size: FONT_SIZE,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
    })
  );

  // Group by type
  const groups: Record<string, TOAEntry[]> = {
    case: [],
    statute: [],
    rule: [],
    other: [],
  };

  for (const entry of entries) {
    const group = groups[entry.type];
    if (group) {
      group.push(entry);
    } else {
      groups.other.push(entry);
    }
  }

  // Sort each group alphabetically
  for (const group of Object.values(groups)) {
    group.sort((a, b) => a.citation.localeCompare(b.citation));
  }

  // Render each non-empty group
  const groupLabels: Record<string, string> = {
    case: 'CASES',
    statute: 'STATUTES',
    rule: 'RULES',
    other: 'OTHER AUTHORITIES',
  };

  const groupOrder = ['case', 'statute', 'rule', 'other'];

  for (const groupKey of groupOrder) {
    const group = groups[groupKey];
    if (group.length === 0) continue;

    // Group header with "Page(s)" right-aligned
    paragraphs.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB_POS }],
        children: [
          new TextRun({
            text: groupLabels[groupKey],
            bold: true,
            underline: {},
            font: FONT_FAMILY,
            size: FONT_SIZE,
          }),
          new TextRun({
            text: '\tPage(s)',
            bold: true,
            font: FONT_FAMILY,
            size: FONT_SIZE,
          }),
        ],
        spacing: { before: 360, after: 240 },
      })
    );

    // Entries
    for (const entry of group) {
      const pageStr = entry.pageNumbers.join(', ');

      // Format cases in italics
      const isCase = entry.type === 'case';

      paragraphs.push(
        new Paragraph({
          tabStops: [
            {
              type: TabStopType.RIGHT,
              position: RIGHT_TAB_POS,
              leader: 'dot' as unknown as undefined,
            },
          ],
          children: [
            new TextRun({
              text: entry.citation,
              italics: isCase,
              font: FONT_FAMILY,
              size: FONT_SIZE,
            }),
            new TextRun({
              text: `\t${pageStr}`,
              font: FONT_FAMILY,
              size: FONT_SIZE,
            }),
          ],
          spacing: { after: 120 },
        })
      );
    }
  }

  // Page break after TOA
  paragraphs.push(new Paragraph({ spacing: { after: 0 } }));

  return paragraphs;
}
