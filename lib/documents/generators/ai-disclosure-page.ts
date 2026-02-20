/**
 * AI Disclosure Page Generator (T-66)
 *
 * Generates a standalone AI disclosure page for inclusion in filing packages.
 * This is Layer 1 of the two-layer disclosure architecture:
 *
 * Layer 1 (Toggle-Controlled): This file — separate page in the filed motion.
 *   Only generated when order.include_ai_disclosure === true.
 *
 * Layer 2 (Always-On): AIS section in instruction-sheet.ts (T-68).
 *   Always generated regardless of toggle.
 *
 * Binding decisions:
 * - IW-002-DEC: Generic language only. No specific model names in motion text.
 * - IW-003-DEC: Separate page with page break, centered header.
 *
 * @module documents/generators/ai-disclosure-page
 */

import { Paragraph, TextRun, AlignmentType, PageBreak } from 'docx';

export interface AiDisclosurePageInput {
  /** Whether the attorney opted in to the disclosure page */
  includeAiDisclosure: boolean;
  /** State-specific override text from states table (T-62, may be null) */
  stateDisclosureText?: string | null;
  /** Attorney name for the disclosure */
  attorneyName?: string;
  /** Date for the disclosure (defaults to current date) */
  disclosureDate?: string;
}

/**
 * Generic disclosure text per IW-002-DEC.
 * No specific model names — those go in the AIS (Layer 2) only.
 */
const GENERIC_DISCLOSURE_TEXT =
  'This document may have been prepared with the assistance of artificial intelligence ' +
  'tools, under the direction and supervision of the undersigned attorney. The undersigned ' +
  'attorney has reviewed the document in its entirety, verified all legal citations and ' +
  'factual representations, and takes full professional responsibility for its contents.';

/**
 * Generate AI disclosure page paragraphs for inclusion in a filing package.
 *
 * Returns null if includeAiDisclosure is false.
 * Returns Paragraph[] with page break if true.
 *
 * Never throws — returns null on any error (graceful fallback).
 */
export function generateAiDisclosurePage(
  input: AiDisclosurePageInput
): Paragraph[] | null {
  try {
    if (!input.includeAiDisclosure) {
      return null;
    }

    const paragraphs: Paragraph[] = [];

    // Page break to start on new page (IW-003-DEC: separate page)
    paragraphs.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );

    // Centered header
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'DISCLOSURE OF AI-ASSISTED PREPARATION',
            bold: true,
            size: 28,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
      })
    );

    // Disclosure text — use state-specific override if available, else generic
    const disclosureText = input.stateDisclosureText || GENERIC_DISCLOSURE_TEXT;

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: disclosureText,
            size: 24,
          }),
        ],
        spacing: { after: 480 },
      })
    );

    // Date line
    const dateStr = input.disclosureDate || new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Dated: ${dateStr}`,
            size: 24,
          }),
        ],
        spacing: { after: 480 },
      })
    );

    // Attorney name placeholder
    const attorneyLine = input.attorneyName || '[ATTORNEY NAME]';

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '____________________________',
            size: 24,
          }),
        ],
        spacing: { after: 60 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: attorneyLine,
            size: 24,
          }),
        ],
        spacing: { after: 60 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Attorney for Moving Party',
            size: 24,
            italics: true,
          }),
        ],
      })
    );

    return paragraphs;
  } catch {
    // Graceful fallback — never throw (IW-003-DEC + defensive coding)
    return null;
  }
}
