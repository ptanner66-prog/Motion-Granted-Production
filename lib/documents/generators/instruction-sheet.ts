/**
 * Instruction Sheet Generator (Task 57 + Task 65)
 *
 * @deprecated FIX-B FIX-11: This DOCX generator is NOT used by the active delivery pipeline.
 * The active instruction sheet is generated as plain text by
 * `generateInstructionSheetContent()` in `lib/inngest/workflow-orchestration.ts`.
 * This file is retained for potential future use but is not invoked during order processing.
 *
 * Generates Attorney Instruction Sheet included with every delivery.
 *
 * Contents:
 * 1. Order summary (motion type, tier, price)
 * 2. Documents included (checklist)
 * 3. Filing instructions (jurisdiction-specific)
 * 4. Deadline summary
 * 5. AI/Disclosure notices
 * 6. AI DISCLOSURE REMINDER (Task 65 - State Bar Compliance)
 * 7. PRIVILEGE PRESERVATION NOTICE (T-72 - PRIV-02)
 * 8. Revision instructions
 * 9. Contact information
 *
 * Source: Chunk 8, Task 57 - Code Mode Spec Section 19
 * Updated: Task 65 - Chen Legal & Compliance Megaprompt
 * VERSION: 1.1 — January 28, 2026
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';
import { createClient } from '@/lib/supabase/server';
import type { DeadlineResult } from '@/lib/legal/deadline-calculator';
import type { Disclosure } from '@/lib/compliance/customer-disclosures';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('documents-generators-instruction-sheet');
// ============================================================================
// TYPES
// ============================================================================

export interface InstructionSheetData {
  orderId: string;
  orderSummary: {
    orderNumber: string;
    motionType: string;
    tier: 'A' | 'B' | 'C' | 'D';
    price: number;
    generatedAt: Date;
  };
  documentsIncluded: string[];
  jurisdiction: string;
  deadlines: DeadlineResult | null;
  disclosures: Disclosure[];
  revisionPolicy: string;
  caseCaption?: {
    caseNumber: string;
    plaintiffs: string[];
    defendants: string[];
    courtName: string;
  };
  // T-68: AI disclosure fields (IW-004-DEC: always generated)
  state?: string;
  stateConfig?: {
    ai_disclosure_required?: boolean;
    ai_disclosure_text?: string;
  };
  order?: {
    include_ai_disclosure?: boolean;
  };
}

export interface InstructionSheetResult {
  path: string;
  pageCount: number;
}

// ============================================================================
// FILING INSTRUCTIONS BY JURISDICTION
// ============================================================================

const FILING_INSTRUCTIONS: Record<string, string[]> = {
  ca_state: [
    'File all documents with the Superior Court Clerk in the county where the action is pending.',
    'Ensure all documents are properly formatted with 28 lines per page and 1.5 line spacing.',
    'Include line numbers on the left margin for all substantive documents.',
    'Serve all parties of record via the method indicated in the Proof of Service.',
    'File the Proof of Service with the original motion papers.',
    'California Rules of Court require electronic filing in most counties - verify local rules.',
    'Retain copies of all filed documents for your records.',
  ],
  ca_federal: [
    'File electronically via CM/ECF (Case Management/Electronic Case Files system).',
    'Ensure you have an active CM/ECF account for the applicable district.',
    'All documents must be in PDF format for electronic filing.',
    'Service is automatic via CM/ECF for registered attorneys.',
    'Verify page limits per local rules of the applicable district.',
    'File exhibits separately and clearly labeled.',
    'Retain confirmation of electronic filing.',
  ],
  federal_5th: [
    'File electronically via CM/ECF.',
    'Follow Fifth Circuit Local Rules for formatting and page limits.',
    'Service via CM/ECF is sufficient for registered counsel.',
    'Check local rules for any appendix requirements.',
    'Courtesy copies may be required - check individual judge preferences.',
  ],
  federal_9th: [
    'File electronically via CM/ECF.',
    'Follow Ninth Circuit Local Rules for formatting.',
    'The Ninth Circuit has specific font size requirements (14pt preferred).',
    'Service via CM/ECF is sufficient for registered counsel.',
    'Review standing orders for the assigned judge.',
  ],
  la_state: [
    'File with the Clerk of Court in the parish where the action is pending.',
    'Louisiana courts may require original signatures on certain documents.',
    'Serve all parties via certified mail or personal service.',
    'File Certificate of Service with motion papers.',
    'Check local rules for electronic filing availability.',
    'Louisiana uses unique pleading format - verify compliance.',
  ],
};

/**
 * Get filing instructions for jurisdiction
 */
export function getFilingInstructions(jurisdiction: string): string[] {
  return FILING_INSTRUCTIONS[jurisdiction] || FILING_INSTRUCTIONS['ca_state'];
}

// ============================================================================
// REVISION POLICY
// ============================================================================

/**
 * Get revision policy text
 */
export function getRevisionPolicy(): string {
  return `REVISION POLICY

Included Revisions:
- Tier A: 1 revision included
- Tier B: 2 revisions included
- Tier C: 3 revisions included

To Request a Revision:
1. Log in to your Motion Granted account
2. Navigate to the order in your dashboard
3. Click "Request Revision"
4. Provide specific feedback on changes needed
5. Submit your request

Turnaround Time:
- Standard revisions: 48 hours
- Rush revisions: 24 hours (additional fee may apply)

Revision Scope:
Revisions include corrections, adjustments to legal arguments, and updates based on attorney feedback. Revisions do NOT include changes to the underlying legal strategy, new claims or defenses, or additional research beyond the original scope.

Additional revisions beyond those included may be purchased separately.`;
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate the instruction sheet document
 */
function generateInstructionSheetDocument(data: InstructionSheetData): Document {
  const children: Paragraph[] = [];

  // Header
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'MOTION GRANTED', bold: true, size: 32 })],
      alignment: AlignmentType.CENTER,
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Attorney Instruction Sheet', size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Separator
  children.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' } },
      spacing: { after: 400 },
    })
  );

  // Order Summary Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '1. ORDER SUMMARY', bold: true, size: 24 })],
      spacing: { before: 200, after: 200 },
    })
  );

  const orderInfo = [
    ['Order Number:', data.orderSummary.orderNumber],
    ['Motion Type:', data.orderSummary.motionType],
    ['Service Tier:', `Tier ${data.orderSummary.tier}`],
    ['Total Price:', `$${data.orderSummary.price.toFixed(2)}`],
    ['Generated:', data.orderSummary.generatedAt.toLocaleDateString()],
  ];

  for (const [label, value] of orderInfo) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: label + ' ', bold: true }),
          new TextRun({ text: value }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
  }

  // Case Caption (if provided)
  if (data.caseCaption) {
    children.push(
      new Paragraph({
        children: [],
        spacing: { before: 200 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Case: ', bold: true }),
          new TextRun({ text: data.caseCaption.plaintiffs.join(', ') }),
          new TextRun({ text: ' v. ' }),
          new TextRun({ text: data.caseCaption.defendants.join(', ') }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Case Number: ', bold: true }),
          new TextRun({ text: data.caseCaption.caseNumber }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Court: ', bold: true }),
          new TextRun({ text: data.caseCaption.courtName }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
  }

  // Documents Included Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '2. DOCUMENTS INCLUDED', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  for (let i = 0; i < data.documentsIncluded.length; i++) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `☐ ` }),
          new TextRun({ text: data.documentsIncluded[i] }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
  }

  // Filing Instructions Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '3. FILING INSTRUCTIONS', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  const instructions = getFilingInstructions(data.jurisdiction);
  for (let i = 0; i < instructions.length; i++) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${instructions[i]}` })],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { after: 100 },
      })
    );
  }

  // Deadline Summary Section
  if (data.deadlines) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: '4. DEADLINE SUMMARY', bold: true, size: 24 })],
        spacing: { before: 400, after: 200 },
      })
    );

    const deadlineInfo = [
      ['Filing Deadline:', data.deadlines.filingDeadline.toLocaleDateString()],
      ['Service Deadline:', data.deadlines.serviceDeadline.toLocaleDateString()],
    ];

    if (data.deadlines.oppositionDeadline) {
      deadlineInfo.push(['Opposition Due:', data.deadlines.oppositionDeadline.toLocaleDateString()]);
    }
    if (data.deadlines.replyDeadline) {
      deadlineInfo.push(['Reply Due:', data.deadlines.replyDeadline.toLocaleDateString()]);
    }
    if (data.deadlines.hearingDate) {
      deadlineInfo.push(['Hearing Date:', data.deadlines.hearingDate.toLocaleDateString()]);
    }

    for (const [label, value] of deadlineInfo) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: label + ' ', bold: true }),
            new TextRun({ text: value }),
          ],
          indent: { left: convertInchesToTwip(0.5) },
        })
      );
    }

    if (data.deadlines.warnings.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'WARNINGS:', bold: true, color: 'CC0000' })],
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { before: 200 },
        })
      );
      for (const warning of data.deadlines.warnings) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `⚠ ${warning}`, color: 'CC0000' })],
            indent: { left: convertInchesToTwip(0.75) },
          })
        );
      }
    }
  }

  // Disclosure Notices Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '5. IMPORTANT NOTICES', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  for (const disclosure of data.disclosures) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: disclosure.shortText.toUpperCase(), bold: true })],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { before: 200 },
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: disclosure.fullText, size: 20 })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
    if (disclosure.legalCitation) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `[${disclosure.legalCitation}]`, italics: true, size: 18 })],
          indent: { left: convertInchesToTwip(0.5) },
        })
      );
    }
  }

  // AI Disclosure Reminder Section (Task 65 - State Bar Compliance)
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '6. AI DISCLOSURE REMINDER', bold: true, size: 24, color: 'CC0000' })],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '⚠️ IMPORTANT: STATE BAR DISCLOSURE REQUIREMENTS',
          bold: true,
          size: 22,
        }),
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 200 },
      shading: { fill: 'FFF3CD' },
    })
  );

  const aiDisclosureContent = [
    'This document was prepared with AI assistance through Motion Granted. As the attorney of record, you have the following disclosure obligations:',
    '',
    '1. REVIEW OBLIGATION: You must thoroughly review all AI-generated content before filing. You are responsible for the accuracy and appropriateness of all legal arguments, citations, and factual assertions.',
    '',
    '2. CALIFORNIA DISCLOSURE: Per California Rules of Professional Conduct and emerging court guidance, attorneys must disclose AI assistance when required by court rules or standing orders. Check local rules for your specific court.',
    '',
    '3. FEDERAL COURTS: Many federal courts now require disclosure of AI use in legal filings. Review the local rules and any standing orders for the assigned judge.',
    '',
    '4. CITATION VERIFICATION: All case citations should be independently verified. While we use validated legal databases, you must confirm accuracy before filing.',
    '',
    '5. PROFESSIONAL RESPONSIBILITY: Under ABA Model Rule 1.1 (Competence) and state equivalents, attorneys must understand the capabilities and limitations of AI tools and supervise their use appropriately.',
    '',
    '6. CLIENT COMMUNICATION: Consider whether disclosure of AI assistance to your client is appropriate or required under your jurisdiction\'s rules.',
  ];

  for (const line of aiDisclosureContent) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line, size: 20 })],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { after: line === '' ? 100 : 50 },
      })
    );
  }

  // Add signature acknowledgment checkbox
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '☐ I acknowledge my professional responsibility to review all documents, verify citations, and comply with applicable disclosure requirements before filing.',
          bold: true,
          size: 20,
        }),
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { before: 200, after: 200 },
      border: { top: { style: BorderStyle.SINGLE, size: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4 }, left: { style: BorderStyle.SINGLE, size: 4 }, right: { style: BorderStyle.SINGLE, size: 4 } },
    })
  );

  // ============================================================
  // Section 7: PRIVILEGE PRESERVATION NOTICE (T-72)
  // Appears in ALL AIS documents, ALL tiers — no conditional
  // ============================================================

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '7. PRIVILEGE PRESERVATION NOTICE',
          bold: true,
          size: 24,
          color: 'CC0000',
        }),
      ],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({
        text: 'Agency Relationship: Motion Granted operates as a commercial software tool under the exclusive direction and control of the supervising attorney. All document preparation occurs through authenticated API connections without human review by any Motion Granted employee or contractor.',
        size: 20,
      })],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 120 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({
        text: 'Confidentiality: All case materials, attorney communications, and work product are processed through encrypted channels and are not accessible to Motion Granted personnel. Data is retained for the period specified in your order terms and is permanently deleted thereafter.',
        size: 20,
      })],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 120 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({
        text: 'Attorney Work Product: Documents prepared through Motion Granted constitute attorney work product prepared in anticipation of litigation. The attorney directs all substantive decisions, reviews all outputs, verifies all citations, and assumes full professional responsibility for the final filing.',
        size: 20,
      })],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 120 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({
        text: 'Attorney Responsibilities: The supervising attorney must (1) review the entire document before filing, (2) verify all citations are accurate and current, (3) ensure all factual representations are correct, (4) confirm compliance with applicable court rules, and (5) make all strategic and substantive decisions regarding the filing.',
        size: 20,
      })],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 200 },
    })
  );

  // ============================================================
  // Section: AI-ASSISTED PREPARATION DISCLOSURE (T-68, IW-004-DEC: always generated)
  // This section is ALWAYS included regardless of toggle state.
  // Toggle controls only the in-motion disclosure page (Layer 1).
  // This AIS section is Layer 2 (always-on).
  // ============================================================

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'AI-ASSISTED PREPARATION DISCLOSURE', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  // Model list
  children.push(
    new Paragraph({
      children: [new TextRun({
        text: 'This document was prepared using the following AI models under attorney direction: Claude Opus 4.5, Claude Sonnet 4.5, GPT-4 Turbo. All AI-generated content has been reviewed, verified, and approved by the supervising attorney.',
        size: 20,
      })],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 120 },
    })
  );

  // Jurisdiction advisory
  const disclosureRequired = data.stateConfig?.ai_disclosure_required ?? false;

  children.push(
    new Paragraph({
      children: [new TextRun({
        text: disclosureRequired
          ? `JURISDICTION NOTICE: ${data.state || 'This jurisdiction'} requires disclosure of AI-assisted legal document preparation.`
          : 'JURISDICTION NOTICE: AI disclosure is voluntary in this jurisdiction but recommended as a professional best practice.',
        size: 20,
        italics: true,
      })],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 120 },
    })
  );

  // Toggle status warning (IW-004-DEC: warn if opted out in required state)
  if (disclosureRequired && !data.order?.include_ai_disclosure) {
    children.push(
      new Paragraph({
        children: [new TextRun({
          text: 'WARNING: The attorney has opted OUT of including the AI disclosure page in the filed document. This jurisdiction requires AI-assisted preparation disclosure. The attorney assumes full responsibility for this decision.',
          size: 20,
          bold: true,
          color: 'CC0000',
        })],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { after: 200 },
      })
    );
  }

  // Revision Instructions Section (renumbered from 7 → 8)
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '8. REVISION INSTRUCTIONS', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  const revisionLines = data.revisionPolicy.split('\n');
  for (const line of revisionLines) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
  }

  // Contact Information Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '9. CONTACT INFORMATION', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  const contactInfo = [
    'Motion Granted Support',
    'Email: support@motion-granted.com',
    'Website: www.motion-granted.com',
    'Hours: Monday-Friday, 9am-6pm PT',
  ];

  for (const line of contactInfo) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
  }

  // Footer
  children.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
      spacing: { before: 600, after: 200 },
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated by Motion Granted on ${new Date().toLocaleDateString()} | Order ${data.orderSummary.orderNumber}`,
          size: 18,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  return new Document({
    sections: [{
      properties: {
        page: {
          size: {
            width: 12240,  // 8.5 inches (US Letter)
            height: 15840, // 11 inches (US Letter)
          },
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
        },
      },
      children,
    }],
  });
}

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate instruction sheet document
 */
export async function generateInstructionSheet(
  data: InstructionSheetData
): Promise<InstructionSheetResult> {
  log.info(`[InstructionSheet] Generating for order ${data.orderId}`);

  // Generate document
  const document = generateInstructionSheetDocument(data);
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `instruction_sheet_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  // FIX-B FIX-4: Use canonical 'order-documents' bucket instead of legacy 'documents'
  const { error: uploadError } = await supabase.storage
    .from('order-documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    log.error('[InstructionSheet] Upload error:', uploadError);
    throw new Error(`Failed to upload instruction sheet: ${uploadError.message}`);
  }

  // Estimate page count (typically 2-4 pages)
  const estimatedPageCount = Math.max(2, Math.ceil(data.documentsIncluded.length / 10) + 2);

  log.info(`[InstructionSheet] Generated successfully: ${storagePath}`);

  return {
    path: storagePath,
    pageCount: estimatedPageCount,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateInstructionSheet,
  getFilingInstructions,
  getRevisionPolicy,
};
