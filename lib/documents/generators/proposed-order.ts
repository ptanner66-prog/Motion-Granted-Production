/**
 * Proposed Order Generator (Task 49)
 *
 * Generates Proposed Order with jurisdiction-specific formatting.
 *
 * Structure:
 * 1. Caption (from Phase I)
 * 2. Order heading: "[PROPOSED] ORDER GRANTING/DENYING {MOTION_TYPE}"
 * 3. Recitals: "The Court having considered..."
 * 4. Ordering paragraphs: "IT IS HEREBY ORDERED that..."
 * 5. Signature block for judge
 * 6. Date line
 *
 * California specific: Include "(PROPOSED)" in title, space for clerk's stamp.
 * Federal specific: ECF footer, different signature block format.
 *
 * Source: Chunk 7, Task 49 - Code Mode Spec Section 11
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
import { JURISDICTION_RULES } from '@/lib/documents/formatting-engine';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('documents-generators-proposed-order');
// ============================================================================
// TYPES
// ============================================================================

export interface ProposedOrderData {
  orderId: string;
  jurisdiction: string;
  motionType: string;
  caseCaption: {
    caseNumber: string;
    plaintiffs: string[];
    defendants: string[];
    courtName: string;
    judgeName: string | null;
    department?: string;
  };
  disposition: 'GRANTED' | 'DENIED' | 'GRANTED_IN_PART';
  orderingParagraphs: string[];
  recitals?: string[];
}

export interface ProposedOrderResult {
  path: string;
  pageCount: number;
}

// ============================================================================
// MOTION TYPE FORMATTING
// ============================================================================

/**
 * Format motion type for order heading
 */
const MOTION_TYPE_LABELS: Record<string, string> = {
  'motion_for_summary_judgment': 'MOTION FOR SUMMARY JUDGMENT',
  'motion_for_summary_adjudication': 'MOTION FOR SUMMARY ADJUDICATION',
  'msj': 'MOTION FOR SUMMARY JUDGMENT',
  'msa': 'MOTION FOR SUMMARY ADJUDICATION',
  'motion_to_compel': 'MOTION TO COMPEL',
  'motion_to_dismiss': 'MOTION TO DISMISS',
  'motion_for_sanctions': 'MOTION FOR SANCTIONS',
  'demurrer': 'DEMURRER',
  'motion_to_strike': 'MOTION TO STRIKE',
  'motion_in_limine': 'MOTION IN LIMINE',
  'motion_for_new_trial': 'MOTION FOR NEW TRIAL',
  'motion_for_judgment_on_pleadings': 'MOTION FOR JUDGMENT ON THE PLEADINGS',
  'motion_to_quash': 'MOTION TO QUASH',
  'motion_for_protective_order': 'MOTION FOR PROTECTIVE ORDER',
  'motion_to_seal': 'MOTION TO SEAL',
};

/**
 * Get formatted motion type label
 */
function getMotionTypeLabel(motionType: string): string {
  const normalized = motionType.toLowerCase().replace(/\s+/g, '_');
  return MOTION_TYPE_LABELS[normalized] || motionType.toUpperCase();
}

/**
 * Get disposition text
 */
function getDispositionText(disposition: ProposedOrderData['disposition']): string {
  switch (disposition) {
    case 'GRANTED':
      return 'GRANTING';
    case 'DENIED':
      return 'DENYING';
    case 'GRANTED_IN_PART':
      return 'GRANTING IN PART AND DENYING IN PART';
    default:
      return disposition;
  }
}

// ============================================================================
// ORDER HEADING
// ============================================================================

/**
 * Get order heading based on motion type and jurisdiction
 */
export function getOrderHeading(
  motionType: string,
  disposition: string,
  jurisdiction: string
): string {
  const motionLabel = getMotionTypeLabel(motionType);
  const dispositionText = getDispositionText(disposition as ProposedOrderData['disposition']);

  // California state courts use "(PROPOSED)" designation
  const isCaliforniaState = jurisdiction.includes('ca_') &&
    !jurisdiction.includes('federal') &&
    !jurisdiction.includes('district');

  if (isCaliforniaState) {
    return `[PROPOSED] ORDER ${dispositionText} ${motionLabel}`;
  }

  return `ORDER ${dispositionText} ${motionLabel}`;
}

// ============================================================================
// SIGNATURE BLOCKS
// ============================================================================

/**
 * Format signature block based on jurisdiction
 */
export function formatSignatureBlock(
  jurisdiction: string,
  judgeName: string | null
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  const isFederal = jurisdiction.includes('federal') ||
    jurisdiction.includes('district') ||
    jurisdiction.startsWith('federal_');

  if (isFederal) {
    // Federal format
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: 'IT IS SO ORDERED.' })],
        spacing: { before: 400, after: 400 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: 'DATED: ____________________' })],
        spacing: { after: 400 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: '________________________________' })],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: judgeName ? `HON. ${judgeName.toUpperCase()}` : 'UNITED STATES DISTRICT JUDGE' }),
        ],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );

    if (!judgeName) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: 'United States District Court' })],
          alignment: AlignmentType.RIGHT,
          indent: { left: convertInchesToTwip(3.5) },
        })
      );
    }
  } else if (jurisdiction.includes('la_')) {
    // Louisiana format
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: 'THUS DONE AND SIGNED in Chambers, in the City of ________________,' })],
        spacing: { before: 400 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: 'Louisiana, on this _____ day of ________________, 20____.' })],
        spacing: { after: 400 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: '________________________________' })],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: judgeName ? `HON. ${judgeName.toUpperCase()}` : 'DISTRICT COURT JUDGE' }),
        ],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );
  } else {
    // California state format
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: 'IT IS SO ORDERED.' })],
        spacing: { before: 400, after: 400 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: 'Dated: ____________________' })],
        spacing: { after: 400 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: '________________________________' })],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: judgeName
              ? `HON. ${judgeName.toUpperCase()}`
              : 'Judge of the Superior Court',
          }),
        ],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );

    // Space for clerk's stamp (California specific)
    paragraphs.push(
      new Paragraph({
        children: [],
        spacing: { before: 600 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: '[SPACE FOR CLERK\'S STAMP]', italics: true, color: '888888' })],
        alignment: AlignmentType.LEFT,
      })
    );
  }

  return paragraphs;
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate caption for order
 */
function generateOrderCaption(
  caption: ProposedOrderData['caseCaption'],
  jurisdiction: string
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Court name
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: caption.courtName.toUpperCase(), bold: true })],
      alignment: AlignmentType.CENTER,
    })
  );

  // Department (if California state)
  if (caption.department && jurisdiction.includes('ca_') && !jurisdiction.includes('federal')) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `Department ${caption.department}` })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  // Parties and case number in side-by-side format
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caption.plaintiffs.join(', ').toUpperCase() }),
        new TextRun({ text: ',' }),
      ],
      spacing: { before: 300 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Plaintiff(s),' })],
      indent: { left: convertInchesToTwip(1.5) },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'v.' })],
      alignment: AlignmentType.LEFT,
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { before: 100 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caption.defendants.join(', ').toUpperCase() }),
        new TextRun({ text: ',' }),
      ],
      spacing: { before: 100 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Defendant(s).' })],
      indent: { left: convertInchesToTwip(1.5) },
    })
  );

  // Case number (right-aligned, positioned next to parties)
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: `Case No. ${caption.caseNumber}`, bold: true })],
      alignment: AlignmentType.RIGHT,
      spacing: { before: -400 }, // Move up to align with parties
    })
  );

  // Separator line
  paragraphs.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' } },
      spacing: { before: 200, after: 400 },
    })
  );

  return paragraphs;
}

/**
 * Generate the proposed order document
 */
function generateProposedOrderDocument(data: ProposedOrderData): Document {
  const rules = JURISDICTION_RULES[data.jurisdiction] || JURISDICTION_RULES['ca_superior'];
  const children: Paragraph[] = [];

  // Caption
  children.push(...generateOrderCaption(data.caseCaption, data.jurisdiction));

  // Order heading
  const heading = getOrderHeading(data.motionType, data.disposition, data.jurisdiction);
  children.push(
    new Paragraph({
      children: [new TextRun({ text: heading, bold: true, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
    })
  );

  // Recitals
  const defaultRecitals = [
    `The ${getMotionTypeLabel(data.motionType)} of ${data.caseCaption.plaintiffs[0] || 'Moving Party'} came on regularly for hearing.`,
    'The Court, having considered the moving papers, opposition (if any), reply (if any), and the arguments of counsel, and being fully advised in the premises,',
  ];

  const recitals = data.recitals && data.recitals.length > 0 ? data.recitals : defaultRecitals;

  for (const recital of recitals) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: recital })],
        spacing: { after: 200 },
      })
    );
  }

  // Ordering clause introduction
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'IT IS HEREBY ORDERED', bold: true }),
        new TextRun({ text: ' that:' }),
      ],
      spacing: { before: 300, after: 200 },
    })
  );

  // Ordering paragraphs
  for (let i = 0; i < data.orderingParagraphs.length; i++) {
    const paragraph = data.orderingParagraphs[i];
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${i + 1}. ` }),
          new TextRun({ text: paragraph }),
        ],
        indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.5) },
        spacing: { after: 200 },
      })
    );
  }

  // Signature block
  children.push(...formatSignatureBlock(data.jurisdiction, data.caseCaption.judgeName));

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(rules?.margins?.top || 1),
            bottom: convertInchesToTwip(rules?.margins?.bottom || 1),
            left: convertInchesToTwip(rules?.margins?.left || 1),
            right: convertInchesToTwip(rules?.margins?.right || 1),
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
 * Generate Proposed Order document
 */
export async function generateProposedOrder(
  data: ProposedOrderData
): Promise<ProposedOrderResult> {
  log.info(`[ProposedOrder] Generating for order ${data.orderId}, disposition: ${data.disposition}`);

  // Generate document
  const document = generateProposedOrderDocument(data);
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `proposed_order_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    log.error('[ProposedOrder] Upload error:', uploadError);
    throw new Error(`Failed to upload proposed order: ${uploadError.message}`);
  }

  // Estimate page count (typically 1-2 pages)
  const estimatedPageCount = Math.max(1, Math.ceil(data.orderingParagraphs.length / 10));

  log.info(`[ProposedOrder] Generated successfully: ${storagePath}`);

  return {
    path: storagePath,
    pageCount: estimatedPageCount,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate default ordering paragraphs based on motion type and disposition
 */
export function generateDefaultOrderingParagraphs(
  motionType: string,
  disposition: ProposedOrderData['disposition'],
  movingParty: string,
  respondingParty: string
): string[] {
  const paragraphs: string[] = [];

  switch (disposition) {
    case 'GRANTED':
      paragraphs.push(
        `The ${getMotionTypeLabel(motionType)} of ${movingParty} is GRANTED.`
      );
      if (motionType.toLowerCase().includes('summary_judgment') || motionType.toLowerCase().includes('msj')) {
        paragraphs.push(
          `Judgment is entered in favor of ${movingParty} and against ${respondingParty}.`
        );
        paragraphs.push(
          `${movingParty} shall prepare, serve, and lodge a proposed Judgment consistent with this Order within ten (10) days.`
        );
      }
      break;

    case 'DENIED':
      paragraphs.push(
        `The ${getMotionTypeLabel(motionType)} of ${movingParty} is DENIED.`
      );
      break;

    case 'GRANTED_IN_PART':
      paragraphs.push(
        `The ${getMotionTypeLabel(motionType)} of ${movingParty} is GRANTED IN PART and DENIED IN PART as follows:`
      );
      paragraphs.push(
        '[SPECIFY WHICH PORTIONS ARE GRANTED AND WHICH ARE DENIED]'
      );
      break;
  }

  return paragraphs;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateProposedOrder,
  getOrderHeading,
  formatSignatureBlock,
  generateDefaultOrderingParagraphs,
};
