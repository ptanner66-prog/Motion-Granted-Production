/**
 * Notice of Motion Generator (Task 50)
 *
 * Generates Notice of Motion (required for California, optional Federal).
 *
 * Structure:
 * 1. Caption
 * 2. "TO ALL PARTIES AND THEIR ATTORNEYS OF RECORD:"
 * 3. "PLEASE TAKE NOTICE that on {DATE} at {TIME}..."
 * 4. Hearing details (department, address)
 * 5. Relief sought summary
 * 6. Documents filed in support
 * 7. Signature block
 *
 * California specific: Must include CCP statutory basis.
 * Hearing date: Placeholder "[HEARING DATE TO BE SET BY COURT]" unless provided.
 *
 * Source: Chunk 7, Task 50 - Code Mode Spec Section 12
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  BorderStyle,
} from 'docx';
import { createClient } from '@/lib/supabase/server';
import { JURISDICTION_RULES } from '@/lib/documents/formatting-engine';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('documents-generators-notice-of-motion');
// ============================================================================
// TYPES
// ============================================================================

export interface NoticeOfMotionData {
  orderId: string;
  jurisdiction: string;
  motionType: string;
  caseCaption: {
    caseNumber: string;
    plaintiffs: string[];
    defendants: string[];
    courtName: string;
    department?: string;
    courtAddress?: string;
  };
  hearingDate?: Date;
  hearingTime?: string;
  reliefSought: string[];
  supportingDocuments: string[];
  statutoryBasis?: string;
  movingPartyAttorney: {
    name: string;
    barNumber: string;
    firmName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    email?: string;
  };
}

export interface NoticeOfMotionResult {
  path: string;
  pageCount: number;
}

// ============================================================================
// STATUTORY BASIS MAPPING
// ============================================================================

const CALIFORNIA_STATUTORY_BASIS: Record<string, string> = {
  'motion_for_summary_judgment': 'Code of Civil Procedure section 437c',
  'motion_for_summary_adjudication': 'Code of Civil Procedure section 437c',
  'msj': 'Code of Civil Procedure section 437c',
  'msa': 'Code of Civil Procedure section 437c',
  'motion_to_compel': 'Code of Civil Procedure sections 2030.300, 2031.310, and 2033.290',
  'motion_to_dismiss': 'Code of Civil Procedure section 581',
  'motion_for_sanctions': 'Code of Civil Procedure section 128.5',
  'demurrer': 'Code of Civil Procedure sections 430.10 and 430.30',
  'motion_to_strike': 'Code of Civil Procedure sections 435 and 436',
  'motion_in_limine': 'Evidence Code section 402',
  'motion_for_new_trial': 'Code of Civil Procedure section 657',
  'motion_for_judgment_on_pleadings': 'Code of Civil Procedure section 438',
  'motion_to_quash': 'Code of Civil Procedure section 418.10',
  'motion_for_protective_order': 'Code of Civil Procedure section 2025.420',
};

/**
 * Get statutory basis for California motions
 */
function getStatutoryBasis(motionType: string): string {
  const normalized = motionType.toLowerCase().replace(/\s+/g, '_');
  return CALIFORNIA_STATUTORY_BASIS[normalized] || 'applicable provisions of the Code of Civil Procedure';
}

// ============================================================================
// MOTION TYPE LABELS
// ============================================================================

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

function getMotionTypeLabel(motionType: string): string {
  const normalized = motionType.toLowerCase().replace(/\s+/g, '_');
  return MOTION_TYPE_LABELS[normalized] || motionType.toUpperCase();
}

// ============================================================================
// HEARING INFORMATION
// ============================================================================

/**
 * Format hearing information for notice
 */
export function formatHearingInfo(
  date: Date | null,
  time: string | null,
  department: string | null
): string {
  if (!date) {
    if (time && department) {
      return `at ${time} in ${department}. [HEARING DATE TO BE SET BY COURT]`;
    }
    return '[HEARING DATE TO BE SET BY COURT]';
  }

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let info = dateStr;

  if (time) {
    info += ` at ${time}`;
  }

  if (department) {
    info += `, in ${department}`;
  }

  return info;
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate caption for notice
 */
function generateNoticeCaption(
  caption: NoticeOfMotionData['caseCaption'],
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

  // Department for California
  if (caption.department && jurisdiction.includes('ca_')) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `Department ${caption.department}` })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  // Parties
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

  // Case number
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: `Case No. ${caption.caseNumber}`, bold: true })],
      alignment: AlignmentType.RIGHT,
      spacing: { before: -400 },
    })
  );

  // Separator
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
 * Generate the notice of motion document
 */
function generateNoticeOfMotionDocument(data: NoticeOfMotionData): Document {
  const rules = JURISDICTION_RULES[data.jurisdiction] || JURISDICTION_RULES['ca_superior'];
  const children: Paragraph[] = [];

  const isCaliforniaState = data.jurisdiction.includes('ca_') &&
    !data.jurisdiction.includes('federal') &&
    !data.jurisdiction.includes('district');

  // Caption
  children.push(...generateNoticeCaption(data.caseCaption, data.jurisdiction));

  // Document title
  const motionLabel = getMotionTypeLabel(data.motionType);
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `NOTICE OF ${motionLabel}`, bold: true, size: 24 }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
    })
  );

  // "TO ALL PARTIES" heading
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'TO ALL PARTIES AND THEIR ATTORNEYS OF RECORD:', bold: true }),
      ],
      spacing: { after: 300 },
    })
  );

  // Notice paragraph with hearing info
  const hearingInfo = formatHearingInfo(
    data.hearingDate || null,
    data.hearingTime || null,
    data.caseCaption.department || null
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'PLEASE TAKE NOTICE', bold: true }),
        new TextRun({ text: ` that ${data.movingPartyAttorney.name}` }),
        data.movingPartyAttorney.firmName
          ? new TextRun({ text: ` of ${data.movingPartyAttorney.firmName}` })
          : new TextRun({ text: '' }),
        new TextRun({ text: `, counsel for ` }),
        new TextRun({ text: data.caseCaption.plaintiffs[0] || 'Moving Party' }),
        new TextRun({ text: `, will move this Court for an order ` }),
        new TextRun({ text: data.reliefSought[0]?.toLowerCase() || 'granting the relief requested' }),
        new TextRun({ text: '.' }),
      ],
      spacing: { after: 200 },
    })
  );

  // Hearing information
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'The motion will be heard on ' }),
        new TextRun({ text: hearingInfo, bold: true }),
        data.caseCaption.courtAddress
          ? new TextRun({ text: `, located at ${data.caseCaption.courtAddress}` })
          : new TextRun({ text: '' }),
        new TextRun({ text: ', or as soon thereafter as the matter may be heard.' }),
      ],
      spacing: { after: 300 },
    })
  );

  // Statutory basis (California)
  if (isCaliforniaState) {
    const statutoryBasis = data.statutoryBasis || getStatutoryBasis(data.motionType);
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'This motion is made pursuant to ' }),
          new TextRun({ text: statutoryBasis, italics: true }),
          new TextRun({ text: ', and is based upon this Notice, the accompanying ' }),
          new TextRun({ text: `Memorandum of Points and Authorities in Support of ${motionLabel}` }),
          new TextRun({ text: ', all pleadings and papers on file in this action, and such other and further evidence and argument as may be presented at the hearing of this motion.' }),
        ],
        spacing: { after: 300 },
      })
    );
  }

  // Relief sought
  if (data.reliefSought.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'RELIEF SOUGHT', bold: true, underline: {} })],
        spacing: { before: 300, after: 200 },
      })
    );

    for (const relief of data.reliefSought) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${relief}` })],
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 100 },
        })
      );
    }
  }

  // Supporting documents
  if (data.supportingDocuments.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'SUPPORTING DOCUMENTS', bold: true, underline: {} })],
        spacing: { before: 300, after: 200 },
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'This motion is supported by the following documents filed concurrently herewith:' })],
        spacing: { after: 200 },
      })
    );

    for (let i = 0; i < data.supportingDocuments.length; i++) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${data.supportingDocuments[i]}` })],
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 100 },
        })
      );
    }
  }

  // Signature block
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Dated: ____________________' })],
      spacing: { before: 400, after: 300 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Respectfully submitted,' })],
      spacing: { after: 400 },
    })
  );

  // Attorney signature and info
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '________________________________' })],
      alignment: AlignmentType.RIGHT,
      indent: { left: convertInchesToTwip(3.5) },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.movingPartyAttorney.name })],
      alignment: AlignmentType.RIGHT,
      indent: { left: convertInchesToTwip(3.5) },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `State Bar No. ${data.movingPartyAttorney.barNumber}` })],
      alignment: AlignmentType.RIGHT,
      indent: { left: convertInchesToTwip(3.5) },
    })
  );

  if (data.movingPartyAttorney.firmName) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: data.movingPartyAttorney.firmName })],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );
  }

  if (data.movingPartyAttorney.address) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: data.movingPartyAttorney.address })],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );
  }

  if (data.movingPartyAttorney.city && data.movingPartyAttorney.state && data.movingPartyAttorney.zip) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${data.movingPartyAttorney.city}, ${data.movingPartyAttorney.state} ${data.movingPartyAttorney.zip}`
          })
        ],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );
  }

  if (data.movingPartyAttorney.phone) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Telephone: ${data.movingPartyAttorney.phone}` })],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );
  }

  if (data.movingPartyAttorney.email) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Email: ${data.movingPartyAttorney.email}` })],
        alignment: AlignmentType.RIGHT,
        indent: { left: convertInchesToTwip(3.5) },
      })
    );
  }

  // Attorney for line
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Attorney for ${data.caseCaption.plaintiffs[0] || 'Moving Party'}`, italics: true }),
      ],
      alignment: AlignmentType.RIGHT,
      indent: { left: convertInchesToTwip(3.5) },
      spacing: { before: 200 },
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
 * Generate Notice of Motion document
 */
export async function generateNoticeOfMotion(
  data: NoticeOfMotionData
): Promise<NoticeOfMotionResult> {
  log.info(`[NoticeOfMotion] Generating for order ${data.orderId}, motion: ${data.motionType}`);

  // Generate document
  const document = generateNoticeOfMotionDocument(data);
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `notice_of_motion_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    log.error('[NoticeOfMotion] Upload error:', uploadError);
    throw new Error(`Failed to upload notice of motion: ${uploadError.message}`);
  }

  // Estimate page count (typically 2-3 pages)
  const estimatedPageCount = Math.max(2, Math.ceil((data.reliefSought.length + data.supportingDocuments.length) / 5));

  log.info(`[NoticeOfMotion] Generated successfully: ${storagePath}`);

  return {
    path: storagePath,
    pageCount: estimatedPageCount,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if notice of motion is required for jurisdiction
 */
export function isNoticeRequired(jurisdiction: string): boolean {
  // California requires notice of motion
  if (jurisdiction.includes('ca_') && !jurisdiction.includes('federal')) {
    return true;
  }

  // Federal courts typically do not require separate notice (filed with motion)
  return false;
}

/**
 * Get default relief sought based on motion type
 */
export function getDefaultReliefSought(motionType: string): string[] {
  const normalized = motionType.toLowerCase().replace(/\s+/g, '_');

  switch (normalized) {
    case 'motion_for_summary_judgment':
    case 'msj':
      return [
        'Granting summary judgment in favor of Moving Party',
        'Entering judgment against Responding Party',
        'Awarding Moving Party costs of suit',
        'Such other and further relief as the Court deems just and proper',
      ];

    case 'motion_for_summary_adjudication':
    case 'msa':
      return [
        'Granting summary adjudication on the issues specified in the motion',
        'Such other and further relief as the Court deems just and proper',
      ];

    case 'motion_to_compel':
      return [
        'Compelling responses to discovery requests',
        'Awarding monetary sanctions against Responding Party',
        'Such other and further relief as the Court deems just and proper',
      ];

    case 'demurrer':
      return [
        'Sustaining the demurrer without leave to amend',
        'Dismissing the complaint/cross-complaint',
        'Such other and further relief as the Court deems just and proper',
      ];

    default:
      return [
        'Granting the relief requested in the motion',
        'Such other and further relief as the Court deems just and proper',
      ];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateNoticeOfMotion,
  formatHearingInfo,
  isNoticeRequired,
  getDefaultReliefSought,
};
