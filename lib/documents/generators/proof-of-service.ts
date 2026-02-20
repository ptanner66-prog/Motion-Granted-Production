/**
 * Proof of Service Generator (Task 46)
 *
 * Generates Proof of Service document with jurisdiction-specific format:
 * - California: Declaration under penalty of perjury per CCP § 2015.5
 * - Federal: Certificate of Service per FRCP 5(d)
 * - Louisiana: Certificate of Service per La. CCP Art. 1313
 *
 * Source: Chunk 7, Task 46 - Code Mode Spec Section 8
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  TabStopType,
  TabStopPosition,
  convertInchesToTwip,
} from 'docx';
import { createClient } from '@/lib/supabase/server';
import { JURISDICTION_RULES } from '@/lib/documents/formatting-engine';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('documents-generators-proof-of-service');
// ============================================================================
// TYPES
// ============================================================================

export interface ServiceParty {
  name: string;
  firmName?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  email?: string;
  isElectronicService: boolean;
}

export interface ProofOfServiceData {
  orderId: string;
  jurisdiction: string;
  serviceDate: Date;
  serviceMethod: 'electronic' | 'mail' | 'personal' | 'overnight';
  partiesServed: ServiceParty[];
  documentsServed: string[];
  declarant: {
    name: string;
    barNumber?: string;
    firmName?: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  caseCaption?: {
    caseNumber: string;
    plaintiffs: string[];
    defendants: string[];
    courtName: string;
  };
}

export interface ProofOfServiceResult {
  path: string;
  pageCount: number;
}

// ============================================================================
// SERVICE METHOD DESCRIPTIONS
// ============================================================================

const SERVICE_METHOD_DESCRIPTIONS: Record<string, Record<ProofOfServiceData['serviceMethod'], string>> = {
  california: {
    electronic: 'by electronic service through the court\'s electronic filing system, which sent notification of the electronic filing to all parties at the email addresses listed below',
    mail: 'by placing the envelope for collection and mailing following our ordinary business practices. I am readily familiar with this firm\'s practice of collection and processing of correspondence for mailing. On the same day that correspondence is placed for collection and mailing, it is deposited in the ordinary course of business with the United States Postal Service, in a sealed envelope with postage fully prepaid',
    personal: 'by personal delivery by leaving a true copy with the person to be served or with a person authorized to accept service for said person',
    overnight: 'by overnight delivery service by depositing the documents in a box or other facility regularly maintained by the overnight delivery carrier, or by delivering to a courier or driver authorized by the overnight delivery carrier to receive documents',
  },
  federal: {
    electronic: 'via the Court\'s CM/ECF system, which will send notification of such filing to all counsel of record',
    mail: 'by mailing it to the addressees listed below in a sealed envelope with first-class postage prepaid and depositing it in the U.S. Mail at the location indicated',
    personal: 'by hand delivery to the person(s) at the address(es) stated below',
    overnight: 'by overnight courier to the address(es) stated below',
  },
  louisiana: {
    electronic: 'via electronic mail to the email addresses listed below',
    mail: 'by depositing same in the United States Mail with sufficient postage affixed and addressed to the parties listed below',
    personal: 'by hand delivery to the parties at the addresses stated below',
    overnight: 'by overnight delivery service to the addresses stated below',
  },
};

// ============================================================================
// JURISDICTION TEMPLATES
// ============================================================================

/**
 * Generate California Proof of Service (Declaration under CCP § 2015.5)
 */
export function getCaliforniaTemplate(data: ProofOfServiceData): Document {
  const rules = JURISDICTION_RULES['ca_superior'] || JURISDICTION_RULES['ca_federal'];
  const formattedDate = formatDate(data.serviceDate);
  const serviceDesc = SERVICE_METHOD_DESCRIPTIONS.california[data.serviceMethod];

  const children: Paragraph[] = [];

  // Caption if provided
  if (data.caseCaption) {
    children.push(...generateCaption(data.caseCaption, 'california'));
  }

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'PROOF OF SERVICE', bold: true, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );

  // State and County
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'STATE OF CALIFORNIA, COUNTY OF ', bold: true }),
        new TextRun({ text: data.declarant.state === 'CA' ? '________________' : data.declarant.state }),
      ],
      spacing: { after: 200 },
    })
  );

  // Declaration opening
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'I, ' }),
        new TextRun({ text: data.declarant.name, bold: true }),
        new TextRun({ text: ', declare:' }),
      ],
      spacing: { after: 200 },
    })
  );

  // Business address
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'I am employed in the County of ________________, State of California. I am over the age of 18 and not a party to the within action. My business address is: ' }),
        new TextRun({ text: `${data.declarant.address}, ${data.declarant.city}, ${data.declarant.state} ${data.declarant.zip}` }),
        new TextRun({ text: '.' }),
      ],
      spacing: { after: 200 },
    })
  );

  // Service paragraph
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `On ${formattedDate}, I served the foregoing document(s) described as:` }),
      ],
      spacing: { after: 200 },
    })
  );

  // Documents served (bulleted list)
  for (const doc of data.documentsServed) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `• ${doc}` })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
  }

  children.push(
    new Paragraph({
      children: [],
      spacing: { after: 200 },
    })
  );

  // Service method
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `on the parties in this action ${serviceDesc}:` }),
      ],
      spacing: { after: 200 },
    })
  );

  // Parties served
  for (const party of data.partiesServed) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: party.name, bold: true }),
          party.firmName ? new TextRun({ text: ` (${party.firmName})` }) : new TextRun({ text: '' }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: party.address })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${party.city}, ${party.state} ${party.zip}` })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
    if (party.email && party.isElectronicService) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Email: ${party.email}` })],
          indent: { left: convertInchesToTwip(0.5) },
        })
      );
    }
    children.push(
      new Paragraph({
        children: [],
        spacing: { after: 200 },
      })
    );
  }

  // Declaration closing (CCP § 2015.5)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: getPerjuryClause(data.jurisdiction),
          italics: true,
        }),
      ],
      spacing: { before: 400, after: 400 },
    })
  );

  // Execution date and location
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Executed on ${formattedDate}, at ${data.declarant.city}, ${data.declarant.state}.` }),
      ],
      spacing: { after: 400 },
    })
  );

  // Signature block
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '________________________________' })],
      spacing: { before: 400 },
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.declarant.name })],
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

/**
 * Generate Federal Certificate of Service (FRCP 5(d))
 */
export function getFederalTemplate(data: ProofOfServiceData): Document {
  const rules = JURISDICTION_RULES['ca_federal'] || JURISDICTION_RULES['federal_5th'];
  const formattedDate = formatDate(data.serviceDate);
  const serviceDesc = SERVICE_METHOD_DESCRIPTIONS.federal[data.serviceMethod];

  const children: Paragraph[] = [];

  // Caption if provided
  if (data.caseCaption) {
    children.push(...generateCaption(data.caseCaption, 'federal'));
  }

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'CERTIFICATE OF SERVICE', bold: true, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );

  // Certificate body
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'I hereby certify that on ' }),
        new TextRun({ text: formattedDate, bold: true }),
        new TextRun({ text: ', I served the following document(s):' }),
      ],
      spacing: { after: 200 },
    })
  );

  // Documents served
  for (const doc of data.documentsServed) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `• ${doc}` })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `${serviceDesc}:` }),
      ],
      spacing: { before: 200, after: 200 },
    })
  );

  // Parties served
  for (const party of data.partiesServed) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: party.name, bold: true }),
        ],
      })
    );
    if (party.firmName) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: party.firmName })],
          indent: { left: convertInchesToTwip(0.5) },
        })
      );
    }
    children.push(
      new Paragraph({
        children: [new TextRun({ text: party.address })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${party.city}, ${party.state} ${party.zip}` })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
    if (party.email) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Email: ${party.email}` })],
          indent: { left: convertInchesToTwip(0.5) },
        })
      );
    }
    children.push(
      new Paragraph({
        children: [],
        spacing: { after: 200 },
      })
    );
  }

  // Signature block
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Dated: ${formattedDate}` })],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Respectfully submitted,' })],
      spacing: { after: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: '/s/ ' + data.declarant.name })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.declarant.name })],
    })
  );
  if (data.declarant.barNumber) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Bar No. ${data.declarant.barNumber}` })],
      })
    );
  }
  if (data.declarant.firmName) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: data.declarant.firmName })],
      })
    );
  }
  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.declarant.address })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${data.declarant.city}, ${data.declarant.state} ${data.declarant.zip}` })],
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

/**
 * Generate Louisiana Certificate of Service (La. CCP Art. 1313)
 */
export function getLouisianaTemplate(data: ProofOfServiceData): Document {
  const rules = JURISDICTION_RULES['la_state'];
  const formattedDate = formatDate(data.serviceDate);
  const serviceDesc = SERVICE_METHOD_DESCRIPTIONS.louisiana[data.serviceMethod];

  const children: Paragraph[] = [];

  // Caption if provided
  if (data.caseCaption) {
    children.push(...generateCaption(data.caseCaption, 'louisiana'));
  }

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'CERTIFICATE OF SERVICE', bold: true, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );

  // Certificate body - Louisiana style
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'I HEREBY CERTIFY that a copy of the foregoing ' }),
        new TextRun({ text: data.documentsServed.length > 1 ? 'documents' : data.documentsServed[0] || 'document' }),
        new TextRun({ text: ' has been served upon all counsel of record ' }),
        new TextRun({ text: serviceDesc }),
        new TextRun({ text: ` on ${formattedDate}:` }),
      ],
      spacing: { after: 200 },
    })
  );

  // Documents served (if multiple)
  if (data.documentsServed.length > 1) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Documents Served:', bold: true })],
        spacing: { before: 200 },
      })
    );
    for (const doc of data.documentsServed) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${doc}` })],
          indent: { left: convertInchesToTwip(0.5) },
        })
      );
    }
  }

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Parties Served:', bold: true })],
      spacing: { before: 400, after: 200 },
    })
  );

  // Parties served
  for (const party of data.partiesServed) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: party.name }),
          party.firmName ? new TextRun({ text: ` - ${party.firmName}` }) : new TextRun({ text: '' }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${party.address}, ${party.city}, ${party.state} ${party.zip}` })],
        indent: { left: convertInchesToTwip(0.5) },
      })
    );
    if (party.email) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: party.email })],
          indent: { left: convertInchesToTwip(0.5) },
        })
      );
    }
    children.push(
      new Paragraph({
        children: [],
        spacing: { after: 100 },
      })
    );
  }

  // Signature block - Louisiana style
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${data.declarant.city}, Louisiana` })],
      spacing: { before: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `this ${formatDayOfMonth(data.serviceDate)} day of ${formatMonth(data.serviceDate)}, ${data.serviceDate.getFullYear()}.` })],
      spacing: { after: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: '________________________________' })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.declarant.name.toUpperCase() })],
    })
  );
  if (data.declarant.barNumber) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Bar Roll No. ${data.declarant.barNumber}` })],
      })
    );
  }

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
            left: convertInchesToTwip(rules?.margins?.left || 1.5),
            right: convertInchesToTwip(rules?.margins?.right || 1),
          },
        },
      },
      children,
    }],
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get jurisdiction-appropriate perjury clause.
 * BD-19: Generic language for non-CA/non-LA states.
 */
function getPerjuryClause(jurisdiction: string): string {
  const j = jurisdiction.toLowerCase();
  if (j.includes('ca') || j.includes('california')) {
    return 'I declare under penalty of perjury under the laws of the State of California that the foregoing is true and correct.';
  }
  if (j.includes('la') || j.includes('louisiana')) {
    return 'I declare under penalty of perjury under the laws of the State of Louisiana that the foregoing is true and correct.';
  }
  if (j.includes('federal') || j.includes('fed')) {
    return 'I declare under penalty of perjury under the laws of the United States of America that the foregoing is true and correct.';
  }
  // BD-19: Generic — no state-specific statutory references
  return 'I declare under penalty of perjury under the laws of the applicable jurisdiction that the foregoing is true and correct.';
}

function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return date.toLocaleDateString('en-US', options);
}

function formatDayOfMonth(date: Date): string {
  const day = date.getDate();
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  return day + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long' });
}

function generateCaption(
  caption: ProofOfServiceData['caseCaption'],
  style: 'california' | 'federal' | 'louisiana'
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
      children: [new TextRun({ text: style === 'louisiana' ? 'VERSUS' : 'Plaintiff(s),' })],
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

  // Case number
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: `Case No. ${caption.caseNumber}`, bold: true })],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200, after: 400 },
    })
  );

  return paragraphs;
}

function getJurisdictionType(jurisdiction: string): 'california' | 'federal' | 'louisiana' {
  if (jurisdiction.includes('la_') || jurisdiction.toLowerCase().includes('louisiana')) {
    return 'louisiana';
  }
  if (jurisdiction.includes('ca_') || jurisdiction.toLowerCase().includes('california')) {
    // Check if federal court in California
    if (jurisdiction.includes('federal') || jurisdiction.includes('district')) {
      return 'federal';
    }
    return 'california';
  }
  // Default federal for other jurisdictions
  return 'federal';
}

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate Proof of Service document
 */
export async function generateProofOfService(
  data: ProofOfServiceData
): Promise<ProofOfServiceResult> {
  log.info(`[ProofOfService] Generating for order ${data.orderId}, jurisdiction: ${data.jurisdiction}`);

  const jurisdictionType = getJurisdictionType(data.jurisdiction);

  let document: Document;
  switch (jurisdictionType) {
    case 'california':
      document = getCaliforniaTemplate(data);
      break;
    case 'louisiana':
      document = getLouisianaTemplate(data);
      break;
    case 'federal':
    default:
      document = getFederalTemplate(data);
      break;
  }

  // Generate buffer
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `proof_of_service_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    log.error('[ProofOfService] Upload error:', uploadError);
    throw new Error(`Failed to upload proof of service: ${uploadError.message}`);
  }

  // Estimate page count (rough calculation: ~3000 chars per page)
  const estimatedPageCount = Math.max(1, Math.ceil(buffer.length / 3000));

  log.info(`[ProofOfService] Generated successfully: ${storagePath}`);

  return {
    path: storagePath,
    pageCount: estimatedPageCount,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateProofOfService,
  getCaliforniaTemplate,
  getFederalTemplate,
  getLouisianaTemplate,
};
