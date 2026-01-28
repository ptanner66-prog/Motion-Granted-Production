/**
 * Ex Parte Application Generator (Task 20)
 *
 * Generates Ex Parte Application documents with proper notice methods.
 *
 * Notice Methods (per CRC 3.1204):
 * - personal: Hand delivery
 * - telephone: Phone call
 * - fax: Facsimile transmission (added per Task 20)
 * - email: Electronic mail
 * - overnight: Overnight delivery
 *
 * Source: Chen Legal & Compliance Megaprompt - Task 20
 * VERSION: 1.0 — January 28, 2026
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

// ============================================================================
// TYPES
// ============================================================================

/**
 * Valid notice methods for ex parte applications
 * Per CRC 3.1204, notice can be given by various methods
 * 'fax' added per Task 20 requirements
 */
export type NoticeMethod =
  | 'personal'
  | 'telephone'
  | 'fax'      // Added per Task 20
  | 'email'
  | 'overnight'
  | 'no_notice'; // When notice is excused

export interface NoticeRecipient {
  name: string;
  firmName?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
}

export interface NoticeGiven {
  recipient: NoticeRecipient;
  method: NoticeMethod;
  dateTime: Date;
  /** For fax: confirmation number or transmission report reference */
  confirmationNumber?: string;
  /** Description of what was communicated */
  description?: string;
}

export interface ExParteApplicationData {
  orderId: string;
  jurisdiction: string;

  // Application details
  applicationType: string; // e.g., "Temporary Restraining Order", "Shortened Time"
  reliefSought: string[];
  groundsForRelief: string[];
  irreparableHarm: string; // Why immediate relief is needed

  // Notice information
  noticeGiven: NoticeGiven[];
  /** If no notice given, explain why notice should be excused */
  noNoticeReason?: string;

  // Supporting materials
  supportingDeclarations: string[];
  supportingExhibits: string[];

  // Case information
  caseCaption?: {
    caseNumber: string;
    plaintiffs: string[];
    defendants: string[];
    courtName: string;
    department?: string;
  };

  // Moving party
  movingParty: {
    name: string;
    barNumber: string;
    firmName?: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    fax?: string;
    email: string;
  };

  // Hearing request
  requestedHearingDate?: Date;
  requestedHearingTime?: string;
}

export interface ExParteApplicationResult {
  path: string;
  pageCount: number;
  noticeMethodsUsed: NoticeMethod[];
}

// ============================================================================
// NOTICE METHOD DESCRIPTIONS
// ============================================================================

const NOTICE_METHOD_DESCRIPTIONS: Record<NoticeMethod, (notice: NoticeGiven) => string> = {
  personal: (notice) =>
    `Personal service was made upon ${notice.recipient.name}` +
    (notice.recipient.firmName ? ` of ${notice.recipient.firmName}` : '') +
    ` on ${formatDateTime(notice.dateTime)}.`,

  telephone: (notice) =>
    `Telephone notice was given to ${notice.recipient.name}` +
    (notice.recipient.firmName ? ` of ${notice.recipient.firmName}` : '') +
    ` at ${notice.recipient.phone || '[phone number]'}` +
    ` on ${formatDateTime(notice.dateTime)}.`,

  fax: (notice) =>
    `Facsimile notice was transmitted to ${notice.recipient.name}` +
    (notice.recipient.firmName ? ` of ${notice.recipient.firmName}` : '') +
    ` at fax number ${notice.recipient.fax || '[fax number]'}` +
    ` on ${formatDateTime(notice.dateTime)}` +
    (notice.confirmationNumber ? `. Transmission confirmed (Confirmation No. ${notice.confirmationNumber})` : '') +
    `.`,

  email: (notice) =>
    `Electronic mail notice was sent to ${notice.recipient.name}` +
    (notice.recipient.firmName ? ` of ${notice.recipient.firmName}` : '') +
    ` at ${notice.recipient.email || '[email address]'}` +
    ` on ${formatDateTime(notice.dateTime)}.`,

  overnight: (notice) =>
    `Notice was sent via overnight delivery to ${notice.recipient.name}` +
    (notice.recipient.firmName ? ` of ${notice.recipient.firmName}` : '') +
    (notice.recipient.address ? ` at ${notice.recipient.address}` : '') +
    ` on ${formatDateTime(notice.dateTime)}.`,

  no_notice: () =>
    'No notice was given to opposing parties for the reasons set forth below.',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate case caption paragraphs
 */
function generateCaption(
  caption: ExParteApplicationData['caseCaption']
): Paragraph[] {
  if (!caption) return [];

  const paragraphs: Paragraph[] = [];

  // Court name
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: caption.courtName.toUpperCase(), bold: true })],
      alignment: AlignmentType.CENTER,
    })
  );

  // Parties
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caption.plaintiffs.join(', ').toUpperCase() }),
        new TextRun({ text: ',' }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { before: 200 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Plaintiff(s),' })],
      indent: { left: convertInchesToTwip(2) },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'v.' })],
      alignment: AlignmentType.CENTER,
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caption.defendants.join(', ').toUpperCase() }),
        new TextRun({ text: ',' }),
      ],
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Defendant(s).' })],
      indent: { left: convertInchesToTwip(2) },
    })
  );

  // Case number and department
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Case No. ${caption.caseNumber}`, bold: true }),
        caption.department ? new TextRun({ text: `\nDept: ${caption.department}` }) : new TextRun({ text: '' }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200, after: 400 },
    })
  );

  return paragraphs;
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate the ex parte application document
 */
function generateExParteDocument(data: ExParteApplicationData): Document {
  const rules = JURISDICTION_RULES['ca_superior'] || JURISDICTION_RULES['ca_state'];
  const children: Paragraph[] = [];

  // Caption
  if (data.caseCaption) {
    children.push(...generateCaption(data.caseCaption));
  }

  // Document title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `EX PARTE APPLICATION FOR ${data.applicationType.toUpperCase()}`,
          bold: true,
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    })
  );

  // Subtitle with CRC reference
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '[California Rules of Court, Rules 3.1200-3.1207]',
          italics: true,
          size: 20,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Introduction
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${data.movingParty.name}, attorney for ${data.caseCaption?.plaintiffs[0] || 'Moving Party'}, respectfully applies ex parte for the following relief:`,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Relief Sought Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'I. RELIEF SOUGHT', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  for (let i = 0; i < data.reliefSought.length; i++) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${data.reliefSought[i]}` })],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { after: 100 },
      })
    );
  }

  // Grounds for Relief Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'II. GROUNDS FOR RELIEF', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  for (let i = 0; i < data.groundsForRelief.length; i++) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${data.groundsForRelief[i]}` })],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { after: 100 },
      })
    );
  }

  // Irreparable Harm Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'III. IRREPARABLE HARM', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.irreparableHarm })],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 200 },
    })
  );

  // Notice Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'IV. NOTICE TO OPPOSING PARTIES', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Pursuant to California Rules of Court, Rule 3.1204, notice of this ex parte application was given as follows:',
          italics: true,
        }),
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 200 },
    })
  );

  if (data.noticeGiven.length > 0) {
    for (let i = 0; i < data.noticeGiven.length; i++) {
      const notice = data.noticeGiven[i];
      const noticeDesc = NOTICE_METHOD_DESCRIPTIONS[notice.method](notice);

      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${noticeDesc}` })],
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 100 },
        })
      );

      if (notice.description) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: notice.description, italics: true, size: 20 })],
            indent: { left: convertInchesToTwip(0.75) },
            spacing: { after: 100 },
          })
        );
      }
    }
  } else if (data.noNoticeReason) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'No notice was given. ' }),
          new TextRun({
            text: 'The applicant requests that notice be excused for the following reasons:',
            bold: true,
          }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { after: 200 },
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: data.noNoticeReason })],
        indent: { left: convertInchesToTwip(0.75) },
        spacing: { after: 200 },
      })
    );
  }

  // Supporting Documents Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'V. SUPPORTING DOCUMENTS', bold: true, size: 24 })],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'This application is supported by the following:' })],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 200 },
    })
  );

  // Declarations
  if (data.supportingDeclarations.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Declarations:', bold: true })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );

    for (const decl of data.supportingDeclarations) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${decl}` })],
          indent: { left: convertInchesToTwip(0.75) },
        })
      );
    }
  }

  // Exhibits
  if (data.supportingExhibits.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Exhibits:', bold: true })],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { before: 200 },
      })
    );

    for (const exhibit of data.supportingExhibits) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${exhibit}` })],
          indent: { left: convertInchesToTwip(0.75) },
        })
      );
    }
  }

  // Hearing Request (if applicable)
  if (data.requestedHearingDate) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'VI. HEARING REQUEST', bold: true, size: 24 })],
        spacing: { before: 400, after: 200 },
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Applicant respectfully requests that this matter be set for hearing on ' }),
          new TextRun({ text: formatDate(data.requestedHearingDate), bold: true }),
          data.requestedHearingTime
            ? new TextRun({ text: ` at ${data.requestedHearingTime}` })
            : new TextRun({ text: '' }),
          new TextRun({ text: ', or at the earliest available date and time.' }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
  }

  // Signature block
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Dated: ${formatDate(new Date())}` })],
      spacing: { before: 600 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Respectfully submitted,' })],
      spacing: { before: 200, after: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: '________________________________' })],
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.movingParty.name })],
    })
  );

  if (data.movingParty.barNumber) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `State Bar No. ${data.movingParty.barNumber}` })],
      })
    );
  }

  if (data.movingParty.firmName) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: data.movingParty.firmName })],
      })
    );
  }

  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.movingParty.address })],
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${data.movingParty.city}, ${data.movingParty.state} ${data.movingParty.zip}` })],
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Tel: ${data.movingParty.phone}` })],
    })
  );

  if (data.movingParty.fax) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Fax: ${data.movingParty.fax}` })],
      })
    );
  }

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Email: ${data.movingParty.email}` })],
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Attorney for ${data.caseCaption?.plaintiffs[0] || 'Applicant'}` }),
      ],
      spacing: { before: 200 },
    })
  );

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(rules?.margins?.top || 1),
            bottom: convertInchesToTwip(rules?.margins?.bottom || 0.5),
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
 * Generate Ex Parte Application document
 */
export async function generateExParteApplication(
  data: ExParteApplicationData
): Promise<ExParteApplicationResult> {
  console.log(`[ExParteApplication] Generating for order ${data.orderId}`);

  // Generate document
  const document = generateExParteDocument(data);
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `ex_parte_application_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    console.error('[ExParteApplication] Upload error:', uploadError);
    throw new Error(`Failed to upload ex parte application: ${uploadError.message}`);
  }

  // Collect notice methods used
  const noticeMethodsUsed = [...new Set(data.noticeGiven.map(n => n.method))];

  // Estimate page count
  const estimatedPageCount = Math.max(2, Math.ceil(
    (data.reliefSought.length + data.groundsForRelief.length + data.noticeGiven.length) / 5
  ) + 2);

  console.log(`[ExParteApplication] Generated successfully: ${storagePath}`);
  console.log(`[ExParteApplication] Notice methods used: ${noticeMethodsUsed.join(', ') || 'none'}`);

  return {
    path: storagePath,
    pageCount: estimatedPageCount,
    noticeMethodsUsed,
  };
}

/**
 * Validate notice requirements for ex parte application
 */
export function validateNoticeRequirements(data: ExParteApplicationData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Per CRC 3.1204, notice is generally required
  if (data.noticeGiven.length === 0 && !data.noNoticeReason) {
    errors.push(
      'Ex parte applications require notice to opposing parties per CRC 3.1204. ' +
      'Either provide notice information or explain why notice should be excused.'
    );
  }

  // Validate notice details
  for (let i = 0; i < data.noticeGiven.length; i++) {
    const notice = data.noticeGiven[i];

    if (!notice.recipient.name) {
      errors.push(`Notice #${i + 1}: Recipient name is required`);
    }

    // Validate method-specific requirements
    switch (notice.method) {
      case 'fax':
        if (!notice.recipient.fax) {
          errors.push(`Notice #${i + 1}: Fax number required for fax notice`);
        }
        break;
      case 'telephone':
        if (!notice.recipient.phone) {
          errors.push(`Notice #${i + 1}: Phone number required for telephone notice`);
        }
        break;
      case 'email':
        if (!notice.recipient.email) {
          errors.push(`Notice #${i + 1}: Email address required for email notice`);
        }
        break;
      case 'personal':
      case 'overnight':
        if (!notice.recipient.address) {
          warnings.push(`Notice #${i + 1}: Address recommended for ${notice.method} notice`);
        }
        break;
    }
  }

  // Warning about timing
  if (data.noticeGiven.length > 0) {
    const now = new Date();
    for (const notice of data.noticeGiven) {
      const hoursSinceNotice = (now.getTime() - notice.dateTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceNotice < 24) {
        warnings.push(
          'Notice was given less than 24 hours ago. Per CRC 3.1203, ' +
          'parties should have reasonable opportunity to respond.'
        );
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateExParteApplication,
  validateNoticeRequirements,
};
