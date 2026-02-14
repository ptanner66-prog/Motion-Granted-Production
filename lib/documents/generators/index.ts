import { createLogger } from '@/lib/security/logger';

const log = createLogger('documents-generators-index');

/**
 * Document Generator Registry (Chunk 7)
 *
 * Central registry for all document generators with unified interface.
 * Provides single entry point for generating any required document.
 *
 * Source: Chunk 7, Tasks 46-51 - Code Mode Spec Sections 8-13
 */

import {
  generateProofOfService,
  ProofOfServiceData,
  ProofOfServiceResult,
} from './proof-of-service';

import {
  generateTableOfAuthorities,
  TableOfAuthoritiesData,
  TableOfAuthoritiesResult,
  TOAEntry,
} from './table-of-authorities';

import {
  generateExhibitIndex,
  ExhibitIndexData,
  ExhibitIndexResult,
  ExhibitEntry,
} from './exhibit-index';

import {
  generateProposedOrder,
  ProposedOrderData,
  ProposedOrderResult,
} from './proposed-order';

import {
  generateNoticeOfMotion,
  NoticeOfMotionData,
  NoticeOfMotionResult,
  isNoticeRequired,
} from './notice-of-motion';

import {
  generateCaseAppendix,
  CaseAppendixData,
  CaseAppendixResult,
  UnpublishedCase,
  requiresAppendix,
  identifyUnpublishedCases,
} from './case-appendix';

import {
  generateSeparateStatement,
  validateSeparateStatement,
  validateEvidence,
  SeparateStatementData,
  SeparateStatementResult,
  MaterialFact,
  EvidenceCitation,
} from './separate-statement-generator';

import {
  generateExParteApplication,
  validateNoticeRequirements,
  ExParteApplicationData,
  ExParteApplicationResult,
  NoticeMethod,
  NoticeGiven,
} from './ex-parte-generator';

// ============================================================================
// TYPES
// ============================================================================

export type DocumentType =
  | 'proof_of_service'
  | 'table_of_authorities'
  | 'exhibit_index'
  | 'proposed_order'
  | 'notice_of_motion'
  | 'case_appendix'
  | 'separate_statement'
  | 'ex_parte';

export interface GeneratorResult {
  documentType: DocumentType;
  path: string;
  pageCount: number;
  generatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface GeneratorDataMap {
  proof_of_service: ProofOfServiceData;
  table_of_authorities: TableOfAuthoritiesData;
  exhibit_index: ExhibitIndexData;
  proposed_order: ProposedOrderData;
  notice_of_motion: NoticeOfMotionData;
  case_appendix: CaseAppendixData;
  separate_statement: SeparateStatementData;
  ex_parte: ExParteApplicationData;
}

// ============================================================================
// DOCUMENT REQUIREMENTS BY TIER
// ============================================================================

/**
 * Required documents by tier and motion characteristics
 */
const TIER_REQUIREMENTS: Record<string, DocumentType[]> = {
  // Tier A: Basic package
  A: [
    'proof_of_service',
    'table_of_authorities',
  ],

  // Tier B: Standard package
  B: [
    'proof_of_service',
    'table_of_authorities',
    'exhibit_index',
    'proposed_order',
  ],

  // Tier C: Full package
  C: [
    'proof_of_service',
    'table_of_authorities',
    'exhibit_index',
    'proposed_order',
    'notice_of_motion',
    'case_appendix',
  ],
};

/**
 * Motion types that require notice of motion in California
 */
const CALIFORNIA_NOTICE_REQUIRED = [
  'motion_for_summary_judgment',
  'motion_for_summary_adjudication',
  'msj',
  'msa',
  'motion_to_compel',
  'demurrer',
  'motion_to_strike',
  'motion_for_sanctions',
];

/**
 * Motion types that require separate statement (and thus exhibit index)
 */
const SEPARATE_STATEMENT_MOTIONS = [
  'motion_for_summary_judgment',
  'motion_for_summary_adjudication',
  'msj',
  'msa',
];

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate a single document by type
 */
export async function generateDocument<T extends DocumentType>(
  type: T,
  orderId: string,
  data: Omit<GeneratorDataMap[T], 'orderId'>
): Promise<GeneratorResult> {
  log.info(`[GeneratorRegistry] Generating ${type} for order ${orderId}`);

  const fullData = { ...data, orderId } as GeneratorDataMap[T];
  let path: string;
  let pageCount: number;
  let metadata: Record<string, unknown> = {};

  switch (type) {
    case 'proof_of_service': {
      const posResult = await generateProofOfService(fullData as ProofOfServiceData);
      path = posResult.path;
      pageCount = posResult.pageCount;
      metadata = {
        partiesServed: (fullData as ProofOfServiceData).partiesServed.length,
        serviceMethod: (fullData as ProofOfServiceData).serviceMethod,
      };
      break;
    }

    case 'table_of_authorities': {
      const toaResult = await generateTableOfAuthorities(fullData as TableOfAuthoritiesData);
      path = toaResult.path;
      pageCount = toaResult.pageCount;
      metadata = {
        entriesCount: toaResult.entries.length,
        categories: [...new Set(toaResult.entries.map(e => e.category))],
      };
      break;
    }

    case 'exhibit_index': {
      const exhibitResult = await generateExhibitIndex(fullData as ExhibitIndexData);
      path = exhibitResult.path;
      // Exhibit index page count is 1-2 pages for the index itself
      pageCount = Math.max(1, Math.ceil(exhibitResult.entries.length / 20));
      metadata = {
        exhibitCount: exhibitResult.entries.length,
        totalExhibitPages: exhibitResult.totalPages,
      };
      break;
    }

    case 'proposed_order': {
      const orderResult = await generateProposedOrder(fullData as ProposedOrderData);
      path = orderResult.path;
      pageCount = orderResult.pageCount;
      metadata = {
        disposition: (fullData as ProposedOrderData).disposition,
        orderingParagraphs: (fullData as ProposedOrderData).orderingParagraphs.length,
      };
      break;
    }

    case 'notice_of_motion': {
      const noticeResult = await generateNoticeOfMotion(fullData as NoticeOfMotionData);
      path = noticeResult.path;
      pageCount = noticeResult.pageCount;
      metadata = {
        hearingSet: !!(fullData as NoticeOfMotionData).hearingDate,
        reliefCount: (fullData as NoticeOfMotionData).reliefSought.length,
      };
      break;
    }

    case 'case_appendix': {
      const appendixResult = await generateCaseAppendix(fullData as CaseAppendixData);
      path = appendixResult.path;
      pageCount = appendixResult.totalPages;
      metadata = {
        casesIncluded: appendixResult.cases.length,
        totalAppendixPages: appendixResult.totalPages,
      };
      break;
    }

    case 'separate_statement': {
      const ssResult = await generateSeparateStatement(fullData as SeparateStatementData);
      path = ssResult.path;
      pageCount = ssResult.pageCount;
      metadata = {
        factCount: ssResult.factCount,
        evidenceCount: ssResult.evidenceCount,
        validationPassed: ssResult.validationPassed,
        validationErrors: ssResult.validationErrors,
      };
      break;
    }

    case 'ex_parte': {
      const epResult = await generateExParteApplication(fullData as ExParteApplicationData);
      path = epResult.path;
      pageCount = epResult.pageCount;
      metadata = {
        noticeMethodsUsed: epResult.noticeMethodsUsed,
      };
      break;
    }

    default:
      throw new Error(`Unknown document type: ${type}`);
  }

  return {
    documentType: type,
    path,
    pageCount,
    generatedAt: new Date(),
    metadata,
  };
}

// ============================================================================
// REQUIRED DOCUMENTS DETERMINATION
// ============================================================================

/**
 * Get required documents based on tier, jurisdiction, and motion type
 */
export function getRequiredDocuments(
  tier: 'A' | 'B' | 'C',
  jurisdiction: string,
  motionType: string
): DocumentType[] {
  const baseRequirements = [...TIER_REQUIREMENTS[tier]];
  const normalizedMotion = motionType.toLowerCase().replace(/\s+/g, '_');

  const isCaliforniaState = jurisdiction.includes('ca_') &&
    !jurisdiction.includes('federal') &&
    !jurisdiction.includes('district');

  const isFederal = jurisdiction.includes('federal') ||
    jurisdiction.includes('district') ||
    jurisdiction.startsWith('federal_');

  // Add notice of motion for California state courts (certain motions)
  if (isCaliforniaState && CALIFORNIA_NOTICE_REQUIRED.includes(normalizedMotion)) {
    if (!baseRequirements.includes('notice_of_motion')) {
      baseRequirements.push('notice_of_motion');
    }
  }

  // Remove notice of motion for federal courts (typically filed with motion)
  if (isFederal) {
    const noticeIndex = baseRequirements.indexOf('notice_of_motion');
    if (noticeIndex !== -1) {
      baseRequirements.splice(noticeIndex, 1);
    }
  }

  // Add exhibit index for MSJ/MSA motions (separate statement requires exhibits)
  if (SEPARATE_STATEMENT_MOTIONS.includes(normalizedMotion)) {
    if (!baseRequirements.includes('exhibit_index')) {
      baseRequirements.push('exhibit_index');
    }
  }

  // Case appendix only for federal if unpublished opinions cited
  // (This is determined at runtime based on citations, included in Tier C by default)
  if (!isFederal) {
    const appendixIndex = baseRequirements.indexOf('case_appendix');
    if (appendixIndex !== -1) {
      baseRequirements.splice(appendixIndex, 1);
    }
  }

  return baseRequirements;
}

// ============================================================================
// BATCH GENERATION
// ============================================================================

/**
 * Generate all required documents for an order
 */
export async function generateAllRequired(
  orderId: string,
  tier: 'A' | 'B' | 'C',
  jurisdiction: string,
  motionType: string,
  dataProvider: DocumentDataProvider
): Promise<GeneratorResult[]> {
  log.info(`[GeneratorRegistry] Generating all required documents for order ${orderId}`);

  const requiredDocs = getRequiredDocuments(tier, jurisdiction, motionType);
  const results: GeneratorResult[] = [];
  const errors: Array<{ type: DocumentType; error: string }> = [];

  for (const docType of requiredDocs) {
    try {
      const data = await dataProvider.getDataForDocument(docType, orderId);

      if (!data) {
        log.warn(`[GeneratorRegistry] No data available for ${docType}, skipping`);
        continue;
      }

      const result = await generateDocument(docType, orderId, data);
      results.push(result);
    } catch (error) {
      log.error(`[GeneratorRegistry] Error generating ${docType}:`, error);
      errors.push({
        type: docType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (errors.length > 0) {
    log.warn(`[GeneratorRegistry] ${errors.length} documents failed to generate:`, errors);
  }

  log.info(`[GeneratorRegistry] Generated ${results.length}/${requiredDocs.length} documents`);
  return results;
}

// ============================================================================
// DATA PROVIDER INTERFACE
// ============================================================================

/**
 * Interface for providing data to document generators
 * Implementations should fetch data from orders/workflow state
 */
export interface DocumentDataProvider {
  getDataForDocument(
    type: DocumentType,
    orderId: string
  ): Promise<Omit<GeneratorDataMap[typeof type], 'orderId'> | null>;
}

/**
 * Default data provider that fetches from database
 */
export class DefaultDocumentDataProvider implements DocumentDataProvider {
  async getDataForDocument(
    type: DocumentType,
    orderId: string
  ): Promise<Record<string, unknown> | null> {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    // Fetch order data
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, phase_outputs, documents')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      log.error(`[DataProvider] Order not found: ${orderId}`);
      return null;
    }

    const phaseOutputs = order.phase_outputs as Record<string, unknown> || {};
    const phaseIOutput = phaseOutputs['I'] as Record<string, unknown> || {};
    const phaseIVOutput = phaseOutputs['IV'] as Record<string, unknown> || {};

    // Build data based on document type
    switch (type) {
      case 'proof_of_service':
        return this.buildProofOfServiceData(order, phaseIOutput);

      case 'table_of_authorities':
        return this.buildTableOfAuthoritiesData(order, phaseIVOutput);

      case 'exhibit_index':
        return this.buildExhibitIndexData(order, phaseIOutput);

      case 'proposed_order':
        return this.buildProposedOrderData(order, phaseIOutput);

      case 'notice_of_motion':
        return this.buildNoticeOfMotionData(order, phaseIOutput);

      case 'case_appendix':
        return this.buildCaseAppendixData(order, phaseIVOutput);

      default:
        return null;
    }
  }

  private buildProofOfServiceData(
    order: Record<string, unknown>,
    phaseIOutput: Record<string, unknown>
  ): Partial<ProofOfServiceData> {
    const caseDetails = phaseIOutput.caseDetails as Record<string, unknown> || {};
    const intakeData = phaseIOutput.intakeData as Record<string, unknown> || {};

    return {
      jurisdiction: (order.jurisdiction as string) || 'ca_superior',
      serviceDate: new Date(),
      serviceMethod: 'electronic',
      partiesServed: [], // To be filled by caller
      documentsServed: [], // To be filled by caller
      declarant: {
        name: '[DECLARANT NAME]',
        address: '[ADDRESS]',
        city: '[CITY]',
        state: 'CA',
        zip: '[ZIP]',
      },
      caseCaption: {
        caseNumber: (order.case_number as string) || '',
        plaintiffs: (caseDetails.plaintiffNames as string[]) || [],
        defendants: (caseDetails.defendantNames as string[]) || [],
        courtName: (caseDetails.courtName as string) || '',
      },
    };
  }

  private buildTableOfAuthoritiesData(
    order: Record<string, unknown>,
    phaseIVOutput: Record<string, unknown>
  ): Partial<TableOfAuthoritiesData> {
    const citationBank = (phaseIVOutput.caseCitationBank || []) as Array<{ citation: string }>;
    const statuteBank = (phaseIVOutput.statuteCitationBank || []) as Array<{ citation: string }>;

    const citations = [
      ...citationBank.map(c => c.citation),
      ...statuteBank.map(c => c.citation),
    ];

    return {
      motionDocumentPath: '', // To be set by caller
      citations,
    };
  }

  private buildExhibitIndexData(
    order: Record<string, unknown>,
    phaseIOutput: Record<string, unknown>
  ): Partial<ExhibitIndexData> {
    const caseDetails = phaseIOutput.caseDetails as Record<string, unknown> || {};
    const documents = (order.documents || []) as Array<{
      id: string;
      filename: string;
      pageCount?: number;
    }>;

    return {
      jurisdiction: (order.jurisdiction as string) || 'ca_superior',
      exhibits: documents.map(doc => ({
        documentId: doc.id,
        description: doc.filename,
        pageCount: doc.pageCount || 1,
      })),
      caseCaption: {
        caseNumber: (order.case_number as string) || '',
        plaintiffs: (caseDetails.plaintiffNames as string[]) || [],
        defendants: (caseDetails.defendantNames as string[]) || [],
        courtName: (caseDetails.courtName as string) || '',
      },
    };
  }

  private buildProposedOrderData(
    order: Record<string, unknown>,
    phaseIOutput: Record<string, unknown>
  ): Partial<ProposedOrderData> {
    const caseDetails = phaseIOutput.caseDetails as Record<string, unknown> || {};

    return {
      jurisdiction: (order.jurisdiction as string) || 'ca_superior',
      motionType: (order.motion_type as string) || '',
      caseCaption: {
        caseNumber: (order.case_number as string) || '',
        plaintiffs: (caseDetails.plaintiffNames as string[]) || [],
        defendants: (caseDetails.defendantNames as string[]) || [],
        courtName: (caseDetails.courtName as string) || '',
        judgeName: (caseDetails.judgeName as string) || null,
      },
      disposition: 'GRANTED',
      orderingParagraphs: [], // To be filled by caller
    };
  }

  private buildNoticeOfMotionData(
    order: Record<string, unknown>,
    phaseIOutput: Record<string, unknown>
  ): Partial<NoticeOfMotionData> {
    const caseDetails = phaseIOutput.caseDetails as Record<string, unknown> || {};

    return {
      jurisdiction: (order.jurisdiction as string) || 'ca_superior',
      motionType: (order.motion_type as string) || '',
      caseCaption: {
        caseNumber: (order.case_number as string) || '',
        plaintiffs: (caseDetails.plaintiffNames as string[]) || [],
        defendants: (caseDetails.defendantNames as string[]) || [],
        courtName: (caseDetails.courtName as string) || '',
        department: (caseDetails.department as string) || undefined,
      },
      reliefSought: [],
      supportingDocuments: [],
      movingPartyAttorney: {
        name: '[ATTORNEY NAME]',
        barNumber: '[BAR NUMBER]',
      },
    };
  }

  private buildCaseAppendixData(
    order: Record<string, unknown>,
    phaseIVOutput: Record<string, unknown>
  ): Partial<CaseAppendixData> {
    const citationBank = (phaseIVOutput.caseCitationBank || []) as Array<{
      citation: string;
      verificationData?: Record<string, unknown>;
    }>;

    const unpublishedCases = identifyUnpublishedCases(citationBank);

    return {
      jurisdiction: (order.jurisdiction as string) || 'federal_9th',
      unpublishedCases,
    };
  }
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Function exports
export {
  generateProofOfService,
  generateTableOfAuthorities,
  generateExhibitIndex,
  generateProposedOrder,
  generateNoticeOfMotion,
  generateCaseAppendix,
  generateSeparateStatement,
  generateExParteApplication,
  isNoticeRequired,
  requiresAppendix,
  identifyUnpublishedCases,
  validateSeparateStatement,
  validateEvidence,
  validateNoticeRequirements,
};

// Type exports (using export type for isolatedModules compatibility)
export type {
  ProofOfServiceData,
  ProofOfServiceResult,
  TableOfAuthoritiesData,
  TableOfAuthoritiesResult,
  TOAEntry,
  ExhibitIndexData,
  ExhibitIndexResult,
  ExhibitEntry,
  ProposedOrderData,
  ProposedOrderResult,
  NoticeOfMotionData,
  NoticeOfMotionResult,
  CaseAppendixData,
  CaseAppendixResult,
  UnpublishedCase,
  SeparateStatementData,
  SeparateStatementResult,
  MaterialFact,
  EvidenceCitation,
  ExParteApplicationData,
  ExParteApplicationResult,
  NoticeMethod,
  NoticeGiven,
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  generateDocument,
  getRequiredDocuments,
  generateAllRequired,
  DefaultDocumentDataProvider,
};
