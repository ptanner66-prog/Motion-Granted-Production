/**
 * Filing Package Assembler
 *
 * Master orchestrator that combines all document generators into
 * a complete filing package. Determines which documents are required
 * based on jurisdiction, motion type, and tier, then generates each.
 *
 * Tier requirements:
 * - Tier A: memorandum, proof_of_service, attorney_instructions
 * - Tier B: + notice_of_motion (CA), declaration, proposed_order
 * - Tier C: + separate_statement (CA MSJ/MSA)
 */

import { RuleLookupService } from '../services/formatting/rule-lookup';
import { FormattingRules } from '../services/formatting/types';
import { generateCaptionBlock, CaseInfo } from './caption-block';
import { generateSignatureBlock, AttorneyInfo } from './signature-block';
import { generateDeclaration, DeclarationInput } from './declaration-generator';
import { generateProofOfService } from './proof-of-service';
import { generateAttorneyInstructions } from './attorney-instructions';
import { createFormattedDocument } from './formatting-engine';
import {
  sanitizePartyName,
  sanitizeForDocument,
  sanitizeSectionContent,
} from '@/lib/utils/text-sanitizer';

export type DocumentType =
  | 'notice_of_motion'
  | 'memorandum'
  | 'declaration'
  | 'separate_statement'
  | 'proposed_order'
  | 'proof_of_service'
  | 'attorney_instructions';

export interface GeneratedDocument {
  type: DocumentType;
  filename: string;
  buffer: Buffer;
  pageCount: number;
  wordCount: number;
  isFiled: boolean;
}

export interface FilingPackage {
  orderId: string;
  orderNumber: string;
  documents: GeneratedDocument[];
  metadata: {
    jurisdiction: string;
    isFederal: boolean;
    motionType: string;
    tier: 'A' | 'B' | 'C' | 'D';
    generatedAt: string;
    totalPages: number;
    totalDocuments: number;
  };
  warnings: string[];
}

export interface AssemblerInput {
  orderId: string;
  orderNumber: string;
  jurisdiction: {
    stateCode: string;
    isFederal: boolean;
    county?: string;
    parish?: string;
    federalDistrict?: string;
  };
  motionType: string;
  motionTypeDisplay: string;
  tier: 'A' | 'B' | 'C' | 'D';
  caseInfo: CaseInfo;
  attorney: AttorneyInfo;
  content: {
    motionBody: string;
    memorandumBody: string;
    declarations?: DeclarationInput[];
    separateStatementFacts?: { fact: string; evidence: string }[];
    proposedOrderRelief?: string[];
  };
  filingDeadline?: string;
  localRuleFlags?: string[];
  citationWarnings?: string[];
}

function determineRequiredDocuments(input: AssemblerInput): DocumentType[] {
  const docs: DocumentType[] = [];
  const state = input.jurisdiction.stateCode.toUpperCase();

  // Notice of Motion: CA state only as separate file
  if (state === 'CA' && !input.jurisdiction.isFederal) {
    docs.push('notice_of_motion');
  }

  // Memorandum: always required
  docs.push('memorandum');

  // Declarations: when evidentiary support provided
  if (input.content.declarations && input.content.declarations.length > 0) {
    docs.push('declaration');
  }

  // Separate Statement: CA MSJ/MSA only per CRC 3.1350
  if (state === 'CA' && !input.jurisdiction.isFederal) {
    const msjTypes = ['MSJ', 'MSA', 'SUMMARY_JUDGMENT', 'SUMMARY_ADJUDICATION'];
    if (msjTypes.some(t => input.motionType.toUpperCase().includes(t))) {
      if (input.content.separateStatementFacts && input.content.separateStatementFacts.length > 0) {
        docs.push('separate_statement');
      }
    }
  }

  // Proposed Order: Federal, CA (CRC 3.1312), LA
  if (input.jurisdiction.isFederal || state === 'CA' || state === 'LA') {
    if (input.content.proposedOrderRelief && input.content.proposedOrderRelief.length > 0) {
      docs.push('proposed_order');
    }
  }

  // Proof of Service: always required
  docs.push('proof_of_service');

  // Attorney Instructions: always (internal, not filed)
  docs.push('attorney_instructions');

  return docs;
}

function estimateWordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function estimatePageCount(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 250));
}

/**
 * Assemble a complete filing package for an order.
 */
export async function assembleFilingPackage(input: AssemblerInput): Promise<FilingPackage> {
  // Sanitize all user-provided text before document generation (SP20: XSS-001–003)
  const sanitizedInput = sanitizeAssemblerInput(input);

  const warnings: string[] = [];
  const documents: GeneratedDocument[] = [];

  const ruleLookup = RuleLookupService.getInstance();
  if (!ruleLookup.getConfig(sanitizedInput.jurisdiction.stateCode.toLowerCase())) {
    try {
      await ruleLookup.initialize();
    } catch (err) {
      warnings.push(`Formatting config initialization failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  const rules = ruleLookup.getFormattingRules({
    stateCode: sanitizedInput.jurisdiction.stateCode,
    isFederal: sanitizedInput.jurisdiction.isFederal,
    county: sanitizedInput.jurisdiction.county,
    federalDistrict: sanitizedInput.jurisdiction.federalDistrict,
  });

  const requiredDocs = determineRequiredDocuments(sanitizedInput);

  console.log(`[filing-package] Assembling ${requiredDocs.length} documents for order ${sanitizedInput.orderNumber}`, {
    orderId: sanitizedInput.orderId,
    jurisdiction: sanitizedInput.jurisdiction.stateCode,
    isFederal: sanitizedInput.jurisdiction.isFederal,
    motionType: sanitizedInput.motionType,
    tier: sanitizedInput.tier,
    documentTypes: requiredDocs,
  });

  const captionParagraphs = generateCaptionBlock(sanitizedInput.caseInfo, rules);
  const signatureParagraphs = generateSignatureBlock(sanitizedInput.attorney, {
    isEfiled: true,
    includeDate: true,
  });

  for (const docType of requiredDocs) {
    try {
      const result = await generateSingleDocument(
        docType, sanitizedInput, rules, captionParagraphs, signatureParagraphs, requiredDocs, warnings
      );
      if (result) {
        documents.push(result);
        console.log(`[filing-package] Generated ${docType}:`, {
          orderId: sanitizedInput.orderId,
          wordCount: result.wordCount,
          pageCount: result.pageCount,
          bufferSize: result.buffer.byteLength,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(`Failed to generate ${docType}: ${message}`);
      console.error(`[filing-package] Error generating ${docType}:`, {
        orderId: sanitizedInput.orderId,
        error: message,
      });
    }
  }

  const totalPages = documents.reduce((sum, d) => sum + d.pageCount, 0);

  return {
    orderId: sanitizedInput.orderId,
    orderNumber: sanitizedInput.orderNumber,
    documents,
    metadata: {
      jurisdiction: sanitizedInput.jurisdiction.stateCode,
      isFederal: sanitizedInput.jurisdiction.isFederal,
      motionType: sanitizedInput.motionType,
      tier: sanitizedInput.tier,
      generatedAt: new Date().toISOString(),
      totalPages,
      totalDocuments: documents.length,
    },
    warnings,
  };
}

async function generateSingleDocument(
  docType: DocumentType,
  input: AssemblerInput,
  rules: FormattingRules,
  captionParagraphs: import('docx').Paragraph[],
  signatureParagraphs: import('docx').Paragraph[],
  requiredDocs: DocumentType[],
  warnings: string[]
): Promise<GeneratedDocument | null> {
  let buffer: Buffer;
  let wordCount: number;
  const isFiled = docType !== 'attorney_instructions';

  switch (docType) {
    case 'memorandum': {
      const bodyText = input.content.memorandumBody || input.content.motionBody;
      wordCount = estimateWordCount(bodyText);
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        county: input.jurisdiction.county,
        federalDistrict: input.jurisdiction.federalDistrict,
        content: [...captionParagraphs, ...signatureParagraphs],
        includeHeader: rules.header?.required,
        includeFooter: rules.footer?.required,
        documentTitle: `Memorandum of Points and Authorities in Support of ${input.motionTypeDisplay}`,
      });
      break;
    }

    case 'notice_of_motion': {
      wordCount = 200;
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: false,
        county: input.jurisdiction.county,
        content: [...captionParagraphs, ...signatureParagraphs],
        documentTitle: `Notice of Motion \u2014 ${input.motionTypeDisplay}`,
      });
      break;
    }

    case 'declaration': {
      const allDeclarations = input.content.declarations || [];
      wordCount = allDeclarations.reduce(
        (sum, d) => sum + d.content.reduce((s, c) => s + estimateWordCount(c), 0), 0
      );
      const declParagraphs = allDeclarations.flatMap(d =>
        generateDeclaration({ ...d, rules, isFederal: input.jurisdiction.isFederal })
      );
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        county: input.jurisdiction.county,
        federalDistrict: input.jurisdiction.federalDistrict,
        content: [...captionParagraphs, ...declParagraphs],
        documentTitle: 'Declaration',
      });
      break;
    }

    case 'proposed_order': {
      const relief = input.content.proposedOrderRelief || [];
      wordCount = relief.reduce((sum, r) => sum + estimateWordCount(r), 0) + 100;
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        county: input.jurisdiction.county,
        federalDistrict: input.jurisdiction.federalDistrict,
        content: captionParagraphs,
        documentTitle: '[PROPOSED] ORDER',
      });
      break;
    }

    case 'proof_of_service': {
      const filedDocNames = requiredDocs
        .filter(d => d !== 'attorney_instructions' && d !== 'proof_of_service')
        .map(d => d.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));

      const posParagraphs = generateProofOfService({
        serverName: input.attorney.name,
        serviceDate: new Date().toISOString().slice(0, 10),
        serviceMethod: 'electronic',
        servedParties: [],
        documentsServed: filedDocNames,
        rules,
        isFederal: input.jurisdiction.isFederal,
        stateCode: input.jurisdiction.stateCode,
      });

      wordCount = 200;
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        county: input.jurisdiction.county,
        federalDistrict: input.jurisdiction.federalDistrict,
        content: [...captionParagraphs, ...posParagraphs, ...signatureParagraphs],
        documentTitle: 'Proof of Service',
      });
      break;
    }

    case 'separate_statement': {
      wordCount = (input.content.separateStatementFacts || []).reduce(
        (sum, f) => sum + estimateWordCount(f.fact) + estimateWordCount(f.evidence), 0
      );
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: false,
        county: input.jurisdiction.county,
        content: captionParagraphs,
        documentTitle: 'Separate Statement of Undisputed Material Facts',
      });
      break;
    }

    case 'attorney_instructions': {
      const instrParagraphs = generateAttorneyInstructions({
        orderNumber: input.orderNumber,
        motionType: input.motionTypeDisplay,
        jurisdiction: `${input.jurisdiction.stateCode}${input.jurisdiction.isFederal ? ' (Federal)' : ''}`,
        filingDeadline: input.filingDeadline,
        documentsInPackage: requiredDocs
          .filter(d => d !== 'attorney_instructions')
          .map(d => d.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())),
        localRuleFlags: input.localRuleFlags || [],
        citationWarnings: input.citationWarnings || [],
        formatNotes: [],
      });

      wordCount = 500;
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        content: instrParagraphs,
        documentTitle: 'Attorney Instructions \u2014 PRIVILEGED & CONFIDENTIAL',
      });
      break;
    }

    default:
      warnings.push(`Unknown document type: ${docType}`);
      return null;
  }

  const pageCount = estimatePageCount(wordCount);
  const filename = `${input.orderNumber}_${docType}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  if (rules.pageLimit && pageCount > rules.pageLimit && isFiled) {
    warnings.push(`${docType} may exceed ${rules.pageLimit}-page limit (estimated ${pageCount} pages)`);
  }

  return { type: docType, filename, buffer, pageCount, wordCount, isFiled };
}

/**
 * Sanitize all user-provided fields in AssemblerInput before document generation.
 * Party names get aggressive sanitization; freeform text gets HTML stripping
 * and control character removal. (SP20: XSS-001–003)
 */
function sanitizeAssemblerInput(input: AssemblerInput): AssemblerInput {
  return {
    ...input,
    caseInfo: {
      ...input.caseInfo,
      plaintiffs: input.caseInfo.plaintiffs.map(sanitizePartyName),
      defendants: input.caseInfo.defendants.map(sanitizePartyName),
      courtName: sanitizeForDocument(input.caseInfo.courtName),
      caseNumber: sanitizeForDocument(input.caseInfo.caseNumber),
      motionTitle: sanitizeForDocument(input.caseInfo.motionTitle),
      county: input.caseInfo.county ? sanitizeForDocument(input.caseInfo.county) : undefined,
      parish: input.caseInfo.parish ? sanitizeForDocument(input.caseInfo.parish) : undefined,
      division: input.caseInfo.division ? sanitizeForDocument(input.caseInfo.division) : undefined,
      department: input.caseInfo.department ? sanitizeForDocument(input.caseInfo.department) : undefined,
      judgeName: input.caseInfo.judgeName ? sanitizeForDocument(input.caseInfo.judgeName) : undefined,
      magistrateName: input.caseInfo.magistrateName ? sanitizeForDocument(input.caseInfo.magistrateName) : undefined,
    },
    attorney: {
      ...input.attorney,
      name: sanitizeForDocument(input.attorney.name),
      firmName: input.attorney.firmName ? sanitizeForDocument(input.attorney.firmName) : undefined,
      barNumber: sanitizeForDocument(input.attorney.barNumber),
      email: sanitizeForDocument(input.attorney.email),
      phone: sanitizeForDocument(input.attorney.phone),
      address: input.attorney.address.map(sanitizeForDocument),
      representingParty: sanitizeForDocument(input.attorney.representingParty),
    },
    content: {
      ...input.content,
      motionBody: sanitizeSectionContent(input.content.motionBody),
      memorandumBody: sanitizeSectionContent(input.content.memorandumBody),
      declarations: input.content.declarations?.map((decl) => ({
        ...decl,
        declarant: {
          ...decl.declarant,
          name: sanitizeForDocument(decl.declarant.name),
          title: decl.declarant.title ? sanitizeForDocument(decl.declarant.title) : undefined,
          relationship: decl.declarant.relationship ? sanitizeForDocument(decl.declarant.relationship) : undefined,
        },
        content: decl.content.map(sanitizeSectionContent),
      })),
      separateStatementFacts: input.content.separateStatementFacts?.map((f) => ({
        fact: sanitizeSectionContent(f.fact),
        evidence: sanitizeSectionContent(f.evidence),
      })),
      proposedOrderRelief: input.content.proposedOrderRelief?.map(sanitizeSectionContent),
    },
  };
}
