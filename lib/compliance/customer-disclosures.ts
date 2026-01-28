/**
 * Customer Disclosure Templates (Task 56)
 *
 * Legal compliance disclosures for Motion Granted services.
 *
 * Required disclosures:
 * 1. AI Disclosure: AI assistance under attorney supervision
 * 2. Not Legal Advice: Drafting services, not legal advice
 * 3. Review Required: Hiring attorney must review before filing
 * 4. Confidentiality: All information encrypted
 * 5. Data Retention: Retention policy information
 *
 * Source: Chunk 8, Task 56 - Code Mode Spec Section 18
 */

// ============================================================================
// TYPES
// ============================================================================

export type DisclosureType =
  | 'ai_assistance'
  | 'not_legal_advice'
  | 'review_required'
  | 'confidentiality'
  | 'data_retention';

export interface Disclosure {
  type: DisclosureType;
  shortText: string;
  fullText: string;
  legalCitation?: string;
}

// ============================================================================
// DISCLOSURE DEFINITIONS
// ============================================================================

export const DISCLOSURES: Record<DisclosureType, Disclosure> = {
  ai_assistance: {
    type: 'ai_assistance',
    shortText: 'AI-assisted drafting',
    fullText:
      'This document was drafted with artificial intelligence assistance under the direction and supervision of the hiring attorney. The hiring attorney is responsible for reviewing, editing, and approving all content before filing. AI tools were used to assist with research, drafting, and citation verification, but all legal judgments and final content decisions remain the responsibility of the supervising attorney.',
    legalCitation: 'See ABA Formal Opinion 512 (2024); Cal. Rules of Professional Conduct 1.1',
  },

  not_legal_advice: {
    type: 'not_legal_advice',
    shortText: 'Not legal advice',
    fullText:
      'Motion Granted provides legal document drafting services only. Our services do not constitute legal advice, legal representation, or the establishment of an attorney-client relationship. The hiring attorney maintains full responsibility for all legal strategy, case assessment, and client representation. Motion Granted makes no warranties regarding the outcome of any legal proceeding.',
    legalCitation: 'Cal. Bus. & Prof. Code § 6125 et seq.',
  },

  review_required: {
    type: 'review_required',
    shortText: 'Attorney review required',
    fullText:
      'IMPORTANT: All documents provided by Motion Granted must be thoroughly reviewed, edited, and approved by the hiring attorney before filing with any court. The hiring attorney is solely responsible for ensuring accuracy, legal sufficiency, and compliance with all applicable rules and procedures. Do not file any document without completing a comprehensive review.',
  },

  confidentiality: {
    type: 'confidentiality',
    shortText: 'Information is confidential',
    fullText:
      'All case information, documents, and communications provided to Motion Granted are treated as strictly confidential. We employ industry-standard encryption (AES-256) for data at rest and in transit. Access to case materials is limited to authorized personnel on a need-to-know basis. We do not share case information with third parties except as required by law or with your explicit consent.',
    legalCitation: 'Cal. Rules of Professional Conduct 1.6; 18 U.S.C. § 2510 et seq.',
  },

  data_retention: {
    type: 'data_retention',
    shortText: 'Data retention policy',
    fullText:
      'Motion Granted retains order data and documents for 90 days after delivery, after which they are automatically deleted. Extended retention (up to 180 days) is available upon request. Maximum retention period is 365 days. After deletion, only anonymized statistical data is retained for service improvement. You may request early deletion of your data at any time by contacting support.',
    legalCitation: 'Cal. Civ. Code § 1798.100 et seq. (CCPA)',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get disclosures required for a specific document type
 */
export function getDisclosuresForDocument(documentType: string): Disclosure[] {
  const normalizedType = documentType.toLowerCase();

  // All documents get AI and review disclosures
  const baseDisclosures: DisclosureType[] = ['ai_assistance', 'review_required'];

  // Instruction sheets get all disclosures
  if (normalizedType.includes('instruction')) {
    return Object.values(DISCLOSURES);
  }

  // Motions and briefs
  if (
    normalizedType.includes('motion') ||
    normalizedType.includes('brief') ||
    normalizedType.includes('memorandum')
  ) {
    return baseDisclosures.map((type) => DISCLOSURES[type]);
  }

  // Default: AI and review
  return baseDisclosures.map((type) => DISCLOSURES[type]);
}

/**
 * Format disclosures for email footer
 */
export function formatDisclosureForEmail(disclosures: Disclosure[]): string {
  const lines: string[] = [
    '─────────────────────────────────────',
    'IMPORTANT NOTICES',
    '─────────────────────────────────────',
  ];

  for (const disclosure of disclosures) {
    lines.push('');
    lines.push(`${disclosure.shortText.toUpperCase()}`);
    lines.push(disclosure.fullText);
    if (disclosure.legalCitation) {
      lines.push(`[${disclosure.legalCitation}]`);
    }
  }

  lines.push('');
  lines.push('─────────────────────────────────────');

  return lines.join('\n');
}

/**
 * Format disclosures for document insertion
 */
export function formatDisclosureForDocument(disclosures: Disclosure[]): string {
  const lines: string[] = ['NOTICES AND DISCLOSURES', ''];

  for (let i = 0; i < disclosures.length; i++) {
    const disclosure = disclosures[i];
    lines.push(`${i + 1}. ${disclosure.shortText.toUpperCase()}`);
    lines.push('');
    lines.push(disclosure.fullText);
    if (disclosure.legalCitation) {
      lines.push('');
      lines.push(`Citation: ${disclosure.legalCitation}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get HTML formatted disclosures for web display
 */
export function formatDisclosureForHTML(disclosures: Disclosure[]): string {
  let html = '<div class="disclosures">';
  html += '<h4>Important Notices</h4>';

  for (const disclosure of disclosures) {
    html += '<div class="disclosure-item">';
    html += `<strong>${disclosure.shortText}</strong>`;
    html += `<p>${disclosure.fullText}</p>`;
    if (disclosure.legalCitation) {
      html += `<small class="citation">${disclosure.legalCitation}</small>`;
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * Get all disclosures
 */
export function getAllDisclosures(): Disclosure[] {
  return Object.values(DISCLOSURES);
}

/**
 * Get specific disclosure by type
 */
export function getDisclosure(type: DisclosureType): Disclosure {
  return DISCLOSURES[type];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  DISCLOSURES,
  getDisclosuresForDocument,
  formatDisclosureForEmail,
  formatDisclosureForDocument,
  formatDisclosureForHTML,
  getAllDisclosures,
  getDisclosure,
};
