/**
 * AI Disclosure Compliance Module (Task 79)
 *
 * Comprehensive AI disclosure system per ABA Formal Opinion 512.
 *
 * Requirements:
 * - Per ABA Formal Opinion 512 (Feb 2024)
 * - Lawyers must disclose AI use to clients
 * - Disclosure must include nature and extent of AI assistance
 *
 * Features:
 * - Generate jurisdiction-specific disclosures
 * - Track disclosure acceptance
 * - Provide compliance documentation
 * - Support multiple jurisdictions
 *
 * Source: Chunk 10, Task 79 - P2 Pre-Launch
 */

import { createClient } from '@/lib/supabase/client';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface AIDisclosure {
  id: string;
  orderId: string;
  jurisdiction: string;
  disclosureText: string;
  shortDescription: string;
  legalBasis: string[];
  createdAt: Date;
  version: number;
}

export interface DisclosureAcceptance {
  id: string;
  disclosureId: string;
  orderId: string;
  userId: string;
  acceptedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  signatureMethod: 'checkbox' | 'e-signature' | 'verbal';
}

export interface DisclosureRequirement {
  jurisdiction: string;
  requiresWrittenDisclosure: boolean;
  requiresClientAcknowledgment: boolean;
  requiresOpposingCounselDisclosure: boolean;
  disclosureTiming: 'before_engagement' | 'before_delivery' | 'with_delivery';
  applicableRules: string[];
  notes: string;
}

export interface GeneratedDisclosure {
  disclosure: AIDisclosure;
  formattedText: string;
  htmlText: string;
  emailText: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createAdminClient(supabaseUrl, supabaseKey);
}

// ============================================================================
// JURISDICTION-SPECIFIC TEMPLATES
// ============================================================================

const DISCLOSURE_TEMPLATES: Record<string, {
  shortDescription: string;
  template: string;
  legalBasis: string[];
}> = {
  // California State Courts
  ca_state: {
    shortDescription: 'AI-Assisted Legal Document Drafting Disclosure',
    template: `AI DISCLOSURE PURSUANT TO ABA FORMAL OPINION 512 AND CALIFORNIA RULES OF PROFESSIONAL CONDUCT

This document was prepared with the assistance of artificial intelligence technology. In accordance with ABA Formal Opinion 512 (February 2024) and California Rules of Professional Conduct, Rule 1.1, the following disclosure is provided:

NATURE OF AI ASSISTANCE:
- Document drafting and formatting assistance
- Legal research augmentation
- Citation verification and checking
- Grammar and style review

EXTENT OF AI USE:
The AI tools were used under the supervision of Motion Granted's document specialists to assist with drafting this {{MOTION_TYPE}}. The AI system provided suggestions for legal arguments, formatting, and citations based on the case information provided.

ATTORNEY RESPONSIBILITY:
The hiring attorney ("Reviewing Attorney") maintains full and sole responsibility for:
1. Reviewing all content for accuracy and legal sufficiency
2. Verifying all citations and legal authorities
3. Ensuring compliance with all applicable court rules and procedures
4. Making all strategic and substantive legal decisions
5. The final content of any document filed with the court

The Reviewing Attorney must independently verify all factual assertions, legal arguments, and citations contained herein before filing.

CLIENT DISCLOSURE:
If you are counsel of record, you may have an obligation to disclose the use of AI-assisted drafting to your client. Please consult the applicable rules of professional conduct in your jurisdiction.

This disclosure is provided in compliance with the professional responsibility requirements for AI use in legal practice.

Motion Granted | Professional Legal Document Drafting Services`,
    legalBasis: [
      'ABA Formal Opinion 512 (Feb. 2024)',
      'Cal. Rules of Professional Conduct, Rule 1.1 (Competence)',
      'Cal. Rules of Professional Conduct, Rule 1.4 (Communication)',
      'Cal. Rules of Professional Conduct, Rule 5.3 (Supervision of Nonlawyer Assistants)',
    ],
  },

  // California Federal Courts (9th Circuit)
  ca_federal: {
    shortDescription: 'AI-Assisted Legal Document Drafting Disclosure (Federal)',
    template: `AI DISCLOSURE - FEDERAL COURT COMPLIANCE

In accordance with ABA Formal Opinion 512 (February 2024) and the professional responsibility requirements applicable in federal court proceedings, the following disclosure is provided:

This legal document was prepared with the assistance of artificial intelligence technology under professional supervision.

AI ASSISTANCE UTILIZED:
- Document composition and structuring
- Legal research and authority identification
- Citation format verification
- Procedural compliance checking

SCOPE OF AI INVOLVEMENT:
Artificial intelligence tools assisted in preparing this {{MOTION_TYPE}} by providing drafting suggestions, identifying potentially relevant legal authorities, and checking citation formats. All AI-generated content was reviewed by qualified professionals.

ATTORNEY CERTIFICATION:
The attorney of record certifies that:
(a) They have reviewed this document in its entirety
(b) They have verified the accuracy of all factual statements
(c) They have confirmed the validity and applicability of all cited authorities
(d) They take full responsibility for the contents hereof
(e) This document complies with Fed. R. Civ. P. 11

DISCLOSURE OBLIGATION:
Counsel is reminded of the potential obligation to disclose AI use to clients and, in some circumstances, to opposing counsel or the Court.

Motion Granted | Professional Legal Document Drafting Services`,
    legalBasis: [
      'ABA Formal Opinion 512 (Feb. 2024)',
      'ABA Model Rules of Professional Conduct 1.1, 1.4, 5.3',
      'Fed. R. Civ. P. 11',
      'Local Rules of Practice for the U.S. District Courts of California',
    ],
  },

  // Texas State Courts
  tx_state: {
    shortDescription: 'AI-Assisted Legal Document Drafting Disclosure (Texas)',
    template: `DISCLOSURE OF AI-ASSISTED DOCUMENT PREPARATION

Pursuant to ABA Formal Opinion 512 (February 2024) and the Texas Disciplinary Rules of Professional Conduct, this disclosure is provided:

This {{MOTION_TYPE}} was prepared with artificial intelligence assistance. The AI technology provided drafting support, research assistance, and citation verification under professional supervision.

TEXAS PROFESSIONAL RESPONSIBILITY COMPLIANCE:
This disclosure is made in accordance with:
- Texas Disciplinary Rules of Professional Conduct, Rule 1.01 (Competent and Diligent Representation)
- Texas Disciplinary Rules of Professional Conduct, Rule 1.03 (Communication)
- Texas Disciplinary Rules of Professional Conduct, Rule 5.03 (Responsibilities Regarding Nonlawyer Assistants)

ATTORNEY RESPONSIBILITY:
The attorney filing this document bears sole responsibility for:
- The accuracy of all statements contained herein
- The validity of all legal arguments
- Compliance with Texas Rules of Civil Procedure
- All strategic decisions regarding this matter

MANDATORY REVIEW REQUIRED:
This document MUST be thoroughly reviewed by the filing attorney before submission to any Texas court.

Motion Granted | Professional Legal Document Drafting Services`,
    legalBasis: [
      'ABA Formal Opinion 512 (Feb. 2024)',
      'Texas Disciplinary Rules of Professional Conduct, Rules 1.01, 1.03, 5.03',
      'Texas Rules of Civil Procedure',
    ],
  },

  // Texas Federal Courts (5th Circuit)
  tx_federal: {
    shortDescription: 'AI-Assisted Legal Document Drafting Disclosure (5th Circuit)',
    template: `AI TECHNOLOGY DISCLOSURE - FIFTH CIRCUIT

This document was prepared with artificial intelligence assistance in compliance with ABA Formal Opinion 512 and applicable Fifth Circuit requirements.

AI TOOLS USED:
- Document drafting assistance
- Legal research support
- Citation verification
- Format compliance checking

ATTORNEY CERTIFICATION:
Pursuant to Fed. R. Civ. P. 11 and Fifth Circuit Local Rules, the undersigned attorney certifies that this document has been reviewed for accuracy, the legal contentions are warranted by existing law or nonfrivolous argument, and the factual contentions have evidentiary support.

The use of AI tools does not diminish the attorney's professional responsibility for this document.

Motion Granted | Professional Legal Document Drafting Services`,
    legalBasis: [
      'ABA Formal Opinion 512 (Feb. 2024)',
      'ABA Model Rules 1.1, 1.4, 5.3',
      'Fed. R. Civ. P. 11',
      '5th Cir. Local Rules',
    ],
  },

  // New York State Courts
  ny_state: {
    shortDescription: 'AI-Assisted Legal Document Drafting Disclosure (New York)',
    template: `DISCLOSURE OF ARTIFICIAL INTELLIGENCE USE IN DOCUMENT PREPARATION

In accordance with ABA Formal Opinion 512 (February 2024) and the New York Rules of Professional Conduct, the following disclosure is provided:

This {{MOTION_TYPE}} was prepared with the assistance of artificial intelligence technology.

NEW YORK PROFESSIONAL CONDUCT COMPLIANCE:
This disclosure is provided pursuant to:
- NY Rules of Professional Conduct, Rule 1.1 (Competence)
- NY Rules of Professional Conduct, Rule 1.4 (Communication)
- NY Rules of Professional Conduct, Rule 5.3 (Lawyer's Responsibility for Conduct of Nonlawyers)

AI ASSISTANCE SCOPE:
- Document structure and formatting
- Research assistance and citation identification
- Draft language suggestions
- Procedural compliance review

ATTORNEY OBLIGATIONS:
The attorney of record must independently verify all facts, law, and citations, and takes full responsibility for the contents of this document.

Motion Granted | Professional Legal Document Drafting Services`,
    legalBasis: [
      'ABA Formal Opinion 512 (Feb. 2024)',
      'NY Rules of Professional Conduct, Rules 1.1, 1.4, 5.3',
      'CPLR and Uniform Rules for Trial Courts',
    ],
  },

  // Default template for other jurisdictions
  default: {
    shortDescription: 'AI-Assisted Legal Document Drafting Disclosure',
    template: `DISCLOSURE OF AI-ASSISTED DOCUMENT PREPARATION

In accordance with ABA Formal Opinion 512 (February 2024) and applicable rules of professional conduct, this disclosure is provided:

This {{MOTION_TYPE}} was prepared with artificial intelligence assistance under professional supervision.

NATURE OF AI ASSISTANCE:
- Document drafting support
- Legal research assistance
- Citation verification
- Format and procedural compliance checking

PROFESSIONAL RESPONSIBILITY:
The attorney filing this document is responsible for:
- Reviewing all content for accuracy
- Verifying all legal citations and authorities
- Ensuring compliance with applicable rules
- Making all legal judgments and strategic decisions

This document must be independently reviewed before filing.

Motion Granted | Professional Legal Document Drafting Services`,
    legalBasis: [
      'ABA Formal Opinion 512 (Feb. 2024)',
      'ABA Model Rules of Professional Conduct 1.1, 1.4, 5.3',
    ],
  },
};

// ============================================================================
// DISCLOSURE REQUIREMENTS BY JURISDICTION
// ============================================================================

const DISCLOSURE_REQUIREMENTS: Record<string, DisclosureRequirement> = {
  ca_state: {
    jurisdiction: 'ca_state',
    requiresWrittenDisclosure: true,
    requiresClientAcknowledgment: true,
    requiresOpposingCounselDisclosure: false,
    disclosureTiming: 'before_delivery',
    applicableRules: ['Cal. Rules Prof. Conduct 1.1', 'Cal. Rules Prof. Conduct 1.4'],
    notes: 'California requires lawyers to maintain competence in technology. Client consent may be required for AI use on confidential information.',
  },
  ca_federal: {
    jurisdiction: 'ca_federal',
    requiresWrittenDisclosure: true,
    requiresClientAcknowledgment: true,
    requiresOpposingCounselDisclosure: false,
    disclosureTiming: 'before_delivery',
    applicableRules: ['Fed. R. Civ. P. 11', 'ABA Model Rules 1.1, 1.4'],
    notes: 'Some federal courts have begun requiring AI use disclosure in filings. Check local rules.',
  },
  tx_state: {
    jurisdiction: 'tx_state',
    requiresWrittenDisclosure: true,
    requiresClientAcknowledgment: false,
    requiresOpposingCounselDisclosure: false,
    disclosureTiming: 'with_delivery',
    applicableRules: ['Tex. Disciplinary Rules 1.01, 1.03'],
    notes: 'Texas emphasizes competent representation. AI tools must be used competently.',
  },
  tx_federal: {
    jurisdiction: 'tx_federal',
    requiresWrittenDisclosure: true,
    requiresClientAcknowledgment: false,
    requiresOpposingCounselDisclosure: false,
    disclosureTiming: 'with_delivery',
    applicableRules: ['Fed. R. Civ. P. 11', '5th Cir. Local Rules'],
    notes: 'Fifth Circuit follows federal rules. Attorneys certify document accuracy under Rule 11.',
  },
  ny_state: {
    jurisdiction: 'ny_state',
    requiresWrittenDisclosure: true,
    requiresClientAcknowledgment: true,
    requiresOpposingCounselDisclosure: false,
    disclosureTiming: 'before_delivery',
    applicableRules: ['NY Rules Prof. Conduct 1.1, 1.4, 5.3'],
    notes: 'New York bars have issued guidance on AI use. Recommend client disclosure.',
  },
  default: {
    jurisdiction: 'default',
    requiresWrittenDisclosure: true,
    requiresClientAcknowledgment: false,
    requiresOpposingCounselDisclosure: false,
    disclosureTiming: 'with_delivery',
    applicableRules: ['ABA Model Rules 1.1, 1.4, 5.3'],
    notes: 'Follow ABA Formal Opinion 512 guidelines as baseline.',
  },
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Generate AI disclosure for an order
 */
export async function generateAIDisclosure(
  orderId: string
): Promise<GeneratedDisclosure | null> {
  const supabase = createClient();

  // Get order details
  const { data: order } = await supabase
    .from('orders')
    .select('id, motion_type, jurisdiction')
    .eq('id', orderId)
    .single();

  if (!order) {
    console.error('[AIDisclosure] Order not found:', orderId);
    return null;
  }

  const jurisdiction = order.jurisdiction || 'default';
  const motionType = order.motion_type || 'legal document';

  // Get template for jurisdiction
  const template = DISCLOSURE_TEMPLATES[jurisdiction] || DISCLOSURE_TEMPLATES.default;

  // Apply variables to template
  const disclosureText = template.template
    .replace(/\{\{MOTION_TYPE\}\}/g, formatMotionType(motionType))
    .replace(/\{\{ORDER_ID\}\}/g, orderId);

  // Create disclosure record
  const adminClient = getAdminClient();
  let disclosureId = `disc_${orderId}_${Date.now()}`;

  if (adminClient) {
    const { data: saved } = await adminClient
      .from('ai_disclosures')
      .insert({
        order_id: orderId,
        jurisdiction,
        disclosure_text: disclosureText,
        short_description: template.shortDescription,
        legal_basis: template.legalBasis,
        version: 1,
      })
      .select()
      .single();

    if (saved) {
      disclosureId = saved.id;
    }
  }

  const disclosure: AIDisclosure = {
    id: disclosureId,
    orderId,
    jurisdiction,
    disclosureText,
    shortDescription: template.shortDescription,
    legalBasis: template.legalBasis,
    createdAt: new Date(),
    version: 1,
  };

  return {
    disclosure,
    formattedText: formatDisclosureAsText(disclosure),
    htmlText: formatDisclosureAsHTML(disclosure),
    emailText: formatDisclosureForEmail(disclosure),
  };
}

/**
 * Get disclosure template for a jurisdiction
 */
export function getDisclosureTemplate(
  jurisdiction: string
): {
  shortDescription: string;
  template: string;
  legalBasis: string[];
} {
  return DISCLOSURE_TEMPLATES[jurisdiction] || DISCLOSURE_TEMPLATES.default;
}

/**
 * Get disclosure requirements for a jurisdiction
 */
export function getDisclosureRequirements(
  jurisdiction: string
): DisclosureRequirement {
  return DISCLOSURE_REQUIREMENTS[jurisdiction] || DISCLOSURE_REQUIREMENTS.default;
}

/**
 * Record disclosure acceptance/acknowledgment
 */
export async function recordDisclosureAcceptance(
  orderId: string,
  userId: string,
  options: {
    ipAddress?: string;
    userAgent?: string;
    signatureMethod?: 'checkbox' | 'e-signature' | 'verbal';
  } = {}
): Promise<DisclosureAcceptance | null> {
  const supabase = getAdminClient();

  if (!supabase) {
    console.error('[AIDisclosure] No admin client available');
    return null;
  }

  // Get the disclosure for this order
  const { data: disclosure } = await supabase
    .from('ai_disclosures')
    .select('id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!disclosure) {
    console.error('[AIDisclosure] No disclosure found for order:', orderId);
    return null;
  }

  // Record acceptance
  const { data, error } = await supabase
    .from('disclosure_acceptances')
    .insert({
      disclosure_id: disclosure.id,
      order_id: orderId,
      user_id: userId,
      ip_address: options.ipAddress,
      user_agent: options.userAgent,
      signature_method: options.signatureMethod || 'checkbox',
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[AIDisclosure] Failed to record acceptance:', error);
    return null;
  }

  console.log(`[AIDisclosure] Recorded acceptance for order ${orderId} by user ${userId}`);

  return {
    id: data.id,
    disclosureId: data.disclosure_id,
    orderId: data.order_id,
    userId: data.user_id,
    acceptedAt: new Date(data.accepted_at || data.created_at),
    ipAddress: data.ip_address,
    userAgent: data.user_agent,
    signatureMethod: data.signature_method,
  };
}

/**
 * Check if user has accepted disclosure for an order
 */
export async function hasAcceptedDisclosure(
  orderId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();

  const { data } = await supabase
    .from('disclosure_acceptances')
    .select('id')
    .eq('order_id', orderId)
    .eq('user_id', userId)
    .limit(1)
    .single();

  return !!data;
}

/**
 * Get all disclosure acceptances for an order
 */
export async function getDisclosureAcceptances(
  orderId: string
): Promise<DisclosureAcceptance[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('disclosure_acceptances')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row: {
    id: string;
    disclosure_id: string;
    order_id: string;
    user_id: string;
    accepted_at?: string;
    created_at: string;
    ip_address?: string;
    user_agent?: string;
    signature_method: string;
  }) => ({
    id: row.id,
    disclosureId: row.disclosure_id,
    orderId: row.order_id,
    userId: row.user_id,
    acceptedAt: new Date(row.accepted_at || row.created_at),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    signatureMethod: row.signature_method,
  }));
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

function formatMotionType(motionType: string): string {
  const typeMap: Record<string, string> = {
    msj: 'Motion for Summary Judgment',
    motion_summary_judgment: 'Motion for Summary Judgment',
    motion_dismiss: 'Motion to Dismiss',
    motion_compel: 'Motion to Compel',
    opposition: 'Opposition Brief',
    reply: 'Reply Brief',
    demurrer: 'Demurrer',
  };

  return typeMap[motionType.toLowerCase()] || motionType;
}

function formatDisclosureAsText(disclosure: AIDisclosure): string {
  let text = '';
  text += '=' .repeat(70) + '\n';
  text += disclosure.shortDescription.toUpperCase() + '\n';
  text += '=' .repeat(70) + '\n\n';
  text += disclosure.disclosureText + '\n\n';
  text += '-'.repeat(70) + '\n';
  text += 'Legal Basis:\n';
  disclosure.legalBasis.forEach((basis) => {
    text += `  - ${basis}\n`;
  });
  text += '-'.repeat(70) + '\n';
  return text;
}

function formatDisclosureAsHTML(disclosure: AIDisclosure): string {
  let html = '<div class="ai-disclosure">';
  html += `<h3 class="disclosure-title">${disclosure.shortDescription}</h3>`;
  html += '<div class="disclosure-content">';
  html += disclosure.disclosureText
    .split('\n\n')
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
  html += '</div>';
  html += '<div class="disclosure-legal-basis">';
  html += '<h4>Legal Basis</h4>';
  html += '<ul>';
  disclosure.legalBasis.forEach((basis) => {
    html += `<li>${basis}</li>`;
  });
  html += '</ul>';
  html += '</div>';
  html += '</div>';
  return html;
}

function formatDisclosureForEmail(disclosure: AIDisclosure): string {
  let text = '\n';
  text += '━'.repeat(50) + '\n';
  text += 'IMPORTANT: AI DISCLOSURE\n';
  text += '━'.repeat(50) + '\n\n';
  text += disclosure.disclosureText + '\n\n';
  text += 'Legal Basis: ' + disclosure.legalBasis.join('; ') + '\n';
  text += '━'.repeat(50) + '\n';
  return text;
}

// ============================================================================
// COMPLIANCE REPORTING
// ============================================================================

/**
 * Get compliance status for an order
 */
export async function getComplianceStatus(
  orderId: string
): Promise<{
  hasDisclosure: boolean;
  hasAcceptance: boolean;
  isCompliant: boolean;
  requirements: DisclosureRequirement;
  disclosure?: AIDisclosure;
  acceptances: DisclosureAcceptance[];
}> {
  const supabase = createClient();

  // Get order jurisdiction
  const { data: order } = await supabase
    .from('orders')
    .select('jurisdiction')
    .eq('id', orderId)
    .single();

  const jurisdiction = order?.jurisdiction || 'default';
  const requirements = getDisclosureRequirements(jurisdiction);

  // Check for disclosure
  const { data: disclosureData } = await supabase
    .from('ai_disclosures')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Check for acceptances
  const acceptances = await getDisclosureAcceptances(orderId);

  const hasDisclosure = !!disclosureData;
  const hasAcceptance = acceptances.length > 0;

  // Determine compliance
  let isCompliant = true;
  if (requirements.requiresWrittenDisclosure && !hasDisclosure) {
    isCompliant = false;
  }
  if (requirements.requiresClientAcknowledgment && !hasAcceptance) {
    isCompliant = false;
  }

  const disclosure = disclosureData ? {
    id: disclosureData.id,
    orderId: disclosureData.order_id,
    jurisdiction: disclosureData.jurisdiction,
    disclosureText: disclosureData.disclosure_text,
    shortDescription: disclosureData.short_description,
    legalBasis: disclosureData.legal_basis || [],
    createdAt: new Date(disclosureData.created_at),
    version: disclosureData.version,
  } : undefined;

  return {
    hasDisclosure,
    hasAcceptance,
    isCompliant,
    requirements,
    disclosure,
    acceptances,
  };
}

/**
 * Get all available jurisdictions
 */
export function getAvailableJurisdictions(): string[] {
  return Object.keys(DISCLOSURE_TEMPLATES).filter((j) => j !== 'default');
}
