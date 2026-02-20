/**
 * Filing Package Assembler
 *
 * Master orchestrator that combines all document generators into
 * a complete filing package. Determines which documents are required
 * based on jurisdiction, motion type, and tier, then generates each.
 *
 * Tier requirements (general):
 * - Tier A: memorandum, proof_of_service, attorney_instructions
 * - Tier B: + notice_of_motion (CA), declaration, proposed_order
 * - Tier C: + separate_statement (CA MSJ/MSA)
 *
 * Louisiana-specific (SP-11 TASK-13):
 * - LA Tier A state: memorandum (with inline cert of service) + proposed_order + AIS only
 * - LA Tier B/C state: memorandum + affidavit (not declaration) + proposed_order + proof_of_service + AIS
 * - LA Federal: standard federal rules (letter size, declaration, separate POS)
 * - Paper: legal size (8.5×14) for state, letter for federal
 * - Jurat: affidavit with notarization (state), 28 USC 1746 (federal)
 */

import { Paragraph, TextRun, AlignmentType } from 'docx';
import { RuleLookupService } from '../services/formatting/rule-lookup';
import { FormattingRules } from '../services/formatting/types';
import { generateCaptionBlock, CaseInfo } from './caption-block';
import { generateSignatureBlock, AttorneyInfo } from './signature-block';
import { generateDeclaration, DeclarationInput } from './declaration-generator';
import { generateProofOfService } from './proof-of-service';
import { generateAttorneyInstructions } from './attorney-instructions';
import { generateTableOfContents, TOCEntry } from './table-of-contents';
import { createFormattedDocument } from './formatting-engine';
import {
  sanitizePartyName,
  sanitizeForDocument,
  sanitizeSectionContent,
} from '@/lib/utils/text-sanitizer';
import {
  validateNoPlaceholders,
  categorizePlaceholders,
} from '@/lib/workflow/validators/placeholder-validator';
import { generateAiDisclosurePage } from '@/lib/documents/generators/ai-disclosure-page';

/** Tier threshold for TOC inclusion */
const TOC_THRESHOLD_PAGES = 15;
const TOC_TIERS: Set<string> = new Set(['B', 'C', 'D']);

export type DocumentType =
  | 'notice_of_motion'
  | 'memorandum'
  | 'declaration'
  | 'affidavit'
  | 'separate_statement'
  | 'proposed_order'
  | 'ai_disclosure_page'
  | 'proof_of_service'
  | 'attorney_instructions'
  | 'citation_report'
  | 'exhibit_index';

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
  citationVerification?: {
    totalCitations: number;
    verifiedCount: number;
    unverifiedCount: number;
    flaggedCount: number;
    pendingCount: number;
    citations?: Array<{ citation: string; status: string; confidence: number }>;
  };
  // A-013: Protocol findings text from D9 dispatcher
  protocolFindingsText?: string;
  // T-67: AI disclosure toggle (IW-001-DEC: advisory only)
  includeAiDisclosure?: boolean;
}

/**
 * ST6-03 FIX: Canonical court filing order.
 *
 * Courts expect documents in a specific order within a filing package.
 * Extra documents like Certificate of Service and Verification must appear
 * AFTER the motion body but BEFORE exhibits and proof of service.
 *
 * Filing order:
 *   1. Notice of Motion (introduces the filing)
 *   2. Memorandum of Points and Authorities (main motion body)
 *   3. Declaration(s) / Affidavit(s) (evidentiary support, after motion body)
 *   4. Proposed Order (what the court is asked to sign)
 *   5. Separate Statement (CA MSJ/MSA, evidence-related)
 *   6. Proof of Service (last filed document — certifies service on all parties)
 *   7. Attorney Instructions (internal, not filed — always last)
 */
const FILING_ORDER: Record<DocumentType, number> = {
  notice_of_motion: 1,
  memorandum: 2,
  declaration: 3,
  affidavit: 3,            // Same position as declaration (jurisdiction determines which)
  proposed_order: 4,
  separate_statement: 5,
  exhibit_index: 6,
  ai_disclosure_page: 6.5,  // T-67: IW-003-DEC — after signature block, before POS
  proof_of_service: 7,
  citation_report: 8,       // Internal only — not filed
  attorney_instructions: 9,  // Internal only, always last
};

function sortByFilingOrder(documents: GeneratedDocument[]): GeneratedDocument[] {
  return [...documents].sort((a, b) => {
    const orderA = FILING_ORDER[a.type] ?? 99;
    const orderB = FILING_ORDER[b.type] ?? 99;
    return orderA - orderB;
  });
}

function determineRequiredDocuments(input: AssemblerInput): DocumentType[] {
  const docs: DocumentType[] = [];
  const state = input.jurisdiction.stateCode.toUpperCase();
  const isLA = state === 'LA' && !input.jurisdiction.isFederal;

  // ── Louisiana state court (SP-11 TASK-13) ──────────────────────────
  // LA Tier A: motion (memo with inline cert) + proposed_order + AIS
  // LA Tier B/C: memo + affidavit + proposed_order + proof_of_service + AIS
  // No notice_of_motion, no separate_statement, no declaration (affidavit only)
  if (isLA) {
    docs.push('memorandum');

    // Affidavit (not declaration) for Tier B/C when evidentiary support provided
    if (input.tier !== 'A' && input.content.declarations && input.content.declarations.length > 0) {
      docs.push('affidavit');
    }

    // Proposed Order
    if (input.content.proposedOrderRelief && input.content.proposedOrderRelief.length > 0) {
      docs.push('proposed_order');
    }

    // Proof of Service: separate only for Tier B/C (Tier A uses inline cert)
    if (input.tier !== 'A') {
      docs.push('proof_of_service');
    }

    // T-67: AI Disclosure Page (IW-001-DEC: advisory, IW-003-DEC: separate page before POS)
    if (input.includeAiDisclosure) {
      docs.push('ai_disclosure_page');
    }

    // Citation report: include when citation verification data is available
    if (input.citationVerification && input.citationVerification.totalCitations > 0) {
      docs.push('citation_report');
    }

    docs.push('attorney_instructions');
    return docs;
  }

  // ── General / non-LA logic ─────────────────────────────────────────

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

  // Proposed Order: Federal, CA (CRC 3.1312), LA (federal)
  if (input.jurisdiction.isFederal || state === 'CA' || state === 'LA') {
    if (input.content.proposedOrderRelief && input.content.proposedOrderRelief.length > 0) {
      docs.push('proposed_order');
    }
  }

  // T-67: AI Disclosure Page (IW-001-DEC: advisory, IW-003-DEC: separate page before POS)
  if (input.includeAiDisclosure) {
    docs.push('ai_disclosure_page');
  }

  // Proof of Service: always required
  docs.push('proof_of_service');

  // Citation report: include when citation verification data is available
  if (input.citationVerification && input.citationVerification.totalCitations > 0) {
    docs.push('citation_report');
  }

  // Attorney Instructions: always (internal, not filed)
  docs.push('attorney_instructions');

  return docs;
}

function estimateWordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * FIX-B FIX-9: Convert body text string into Paragraph objects for DOCX.
 * Previously, body text was computed but never converted to paragraphs,
 * resulting in empty document bodies (caption + signature only).
 */
function textToParagraphs(text: string): Paragraph[] {
  if (!text) return [];
  return text.split('\n\n').filter(Boolean).map(para =>
    new Paragraph({
      children: [new TextRun({ text: para.trim() })],
      spacing: { after: 240 },
    })
  );
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

  // DG-015: Post-assembly placeholder validation on input content.
  // Scan body text for unresolved placeholders and add warnings.
  const bodyContent = sanitizedInput.content.memorandumBody || sanitizedInput.content.motionBody || '';
  if (bodyContent) {
    const placeholderResult = validateNoPlaceholders(bodyContent);
    if (!placeholderResult.valid) {
      const { blocking, nonBlocking } = categorizePlaceholders(placeholderResult.placeholders);
      if (blocking.length > 0) {
        warnings.push(`BLOCKING: Motion contains ${blocking.length} unresolved placeholder(s): ${blocking.slice(0, 5).join(', ')}${blocking.length > 5 ? '...' : ''}`);
      }
      if (nonBlocking.length > 0) {
        warnings.push(`Non-blocking placeholders (attorney fills at signing): ${nonBlocking.join(', ')}`);
      }
      if (placeholderResult.genericNames.length > 0) {
        warnings.push(`Generic names detected: ${placeholderResult.genericNames.join(', ')}`);
      }
    }
  }

  // ST6-03 FIX: Sort documents into correct court filing order.
  // Ensures extra documents (CoS, Verification) appear after the motion body
  // and before exhibits/proof of service, regardless of generation order.
  const sortedDocuments = sortByFilingOrder(documents);

  const totalPages = sortedDocuments.reduce((sum, d) => sum + d.pageCount, 0);

  return {
    orderId: sanitizedInput.orderId,
    orderNumber: sanitizedInput.orderNumber,
    documents: sortedDocuments,
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
  const isFiled = docType !== 'attorney_instructions' && docType !== 'citation_report';

  switch (docType) {
    case 'memorandum': {
      const bodyText = input.content.memorandumBody || input.content.motionBody;
      wordCount = estimateWordCount(bodyText);

      // FIX-B FIX-9: Convert body text to Paragraph objects so the document has content.
      const bodyParagraphs = textToParagraphs(bodyText);

      // TOC for Tier B/C/D motions over 15 pages (DOC-007)
      const estimatedPages = estimatePageCount(wordCount);
      let tocParagraphs: Paragraph[] = [];
      if (TOC_TIERS.has(input.tier) && estimatedPages > TOC_THRESHOLD_PAGES) {
        const tocEntries = extractTOCEntries(bodyText);
        if (tocEntries.length > 0) {
          tocParagraphs = generateTableOfContents(tocEntries);
        }
      }

      // LA Tier A: append inline certificate of service (no separate POS)
      const isLATierA = input.jurisdiction.stateCode.toUpperCase() === 'LA'
        && !input.jurisdiction.isFederal
        && input.tier === 'A';
      const inlineCert = isLATierA
        ? generateInlineCertificateOfService(input.attorney.name, rules)
        : [];

      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        county: input.jurisdiction.county,
        federalDistrict: input.jurisdiction.federalDistrict,
        content: [...captionParagraphs, ...tocParagraphs, ...bodyParagraphs, ...signatureParagraphs, ...inlineCert],
        includeHeader: rules.header?.required,
        includeFooter: rules.footer?.required,
        documentTitle: `Memorandum of Points and Authorities in Support of ${input.motionTypeDisplay}`,
      });
      break;
    }

    case 'notice_of_motion': {
      // FIX-B FIX-9: Include motion body paragraphs in the notice document.
      const noticeBody = input.content.motionBody || '';
      wordCount = estimateWordCount(noticeBody) || 200;
      const noticeParagraphs = textToParagraphs(noticeBody);

      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: false,
        county: input.jurisdiction.county,
        content: [...captionParagraphs, ...noticeParagraphs, ...signatureParagraphs],
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

    case 'affidavit': {
      // Louisiana affidavit — uses same generator as declaration (jurat type resolved from rules)
      const allAffidavits = input.content.declarations || [];
      wordCount = allAffidavits.reduce(
        (sum, d) => sum + d.content.reduce((s, c) => s + estimateWordCount(c), 0), 0
      );
      const affidavitParagraphs = allAffidavits.flatMap(d =>
        generateDeclaration({ ...d, rules, isFederal: input.jurisdiction.isFederal })
      );
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        county: input.jurisdiction.county,
        federalDistrict: input.jurisdiction.federalDistrict,
        content: [...captionParagraphs, ...affidavitParagraphs],
        documentTitle: 'Affidavit',
      });
      break;
    }

    case 'proposed_order': {
      const relief = input.content.proposedOrderRelief || [];
      wordCount = relief.reduce((sum, r) => sum + estimateWordCount(r), 0) + 100;

      // FIX-B FIX-9: Convert proposed order relief items to paragraphs.
      const reliefParagraphs = relief.map((r, i) =>
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${r}` })],
          spacing: { after: 240 },
        })
      );

      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        county: input.jurisdiction.county,
        federalDistrict: input.jurisdiction.federalDistrict,
        content: [...captionParagraphs, ...reliefParagraphs],
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
      const facts = input.content.separateStatementFacts || [];
      wordCount = facts.reduce(
        (sum, f) => sum + estimateWordCount(f.fact) + estimateWordCount(f.evidence), 0
      );

      // DG-020: Warn when MSJ separate statement exceeds 100 UMFs
      if (facts.length > 100) {
        warnings.push(
          `Separate statement contains ${facts.length} undisputed material facts (UMFs). ` +
          `Many courts require leave for >75 UMFs. Review local rules for any UMF cap.`
        );
      }

      // FIX-B FIX-9: Convert fact/evidence pairs to paragraphs.
      const factParagraphs = facts.flatMap((f, i) => [
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${f.fact}`, bold: true })],
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Evidence: ${f.evidence}` })],
          spacing: { after: 240 },
        }),
      ]);

      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: false,
        county: input.jurisdiction.county,
        content: [...captionParagraphs, ...factParagraphs],
        documentTitle: 'Separate Statement of Undisputed Material Facts',
      });
      break;
    }

    case 'citation_report': {
      // Citation report: internal document summarizing verification results
      const cv = input.citationVerification;
      const reportParagraphs: Paragraph[] = [];

      reportParagraphs.push(new Paragraph({
        children: [new TextRun({ text: 'CITATION VERIFICATION REPORT', bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
      }));

      reportParagraphs.push(new Paragraph({
        children: [new TextRun({
          text: `Order: ${input.orderNumber} | ${input.motionTypeDisplay} | Generated: ${new Date().toLocaleDateString('en-US')}`,
        })],
        spacing: { after: 240 },
      }));

      if (cv) {
        const summaryLines = [
          `Total citations: ${cv.totalCitations}`,
          `Verified: ${cv.verifiedCount}`,
          `Unverified: ${cv.unverifiedCount}`,
          `Flagged for review: ${cv.flaggedCount}`,
          ...(cv.pendingCount > 0 ? [`Pending: ${cv.pendingCount}`] : []),
        ];
        for (const line of summaryLines) {
          reportParagraphs.push(new Paragraph({
            children: [new TextRun({ text: line })],
            spacing: { after: 60 },
            indent: { left: 360 },
          }));
        }

        // Individual citations
        if (cv.citations && cv.citations.length > 0) {
          reportParagraphs.push(new Paragraph({ spacing: { after: 240 } }));
          reportParagraphs.push(new Paragraph({
            children: [new TextRun({ text: 'INDIVIDUAL CITATION RESULTS:', bold: true, underline: {} })],
            spacing: { after: 120 },
          }));

          for (const c of cv.citations) {
            reportParagraphs.push(new Paragraph({
              children: [
                new TextRun({ text: `[${c.status}] `, bold: true }),
                new TextRun({ text: c.citation }),
                new TextRun({ text: ` (confidence: ${(c.confidence * 100).toFixed(0)}%)`, italics: true }),
              ],
              spacing: { after: 60 },
              indent: { left: 360 },
            }));
          }
        }
      }

      wordCount = 300;
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        content: reportParagraphs,
        documentTitle: 'Citation Verification Report',
      });
      break;
    }

    case 'ai_disclosure_page': {
      // T-67: AI Disclosure Page (IW-003-DEC: separate page, IW-002-DEC: generic language)
      const disclosureParagraphs = generateAiDisclosurePage({
        includeAiDisclosure: true,
        attorneyName: input.attorney.name,
      });

      if (!disclosureParagraphs) {
        return null;
      }

      wordCount = 80;
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        county: input.jurisdiction.county,
        federalDistrict: input.jurisdiction.federalDistrict,
        content: [...captionParagraphs, ...disclosureParagraphs],
        documentTitle: 'Disclosure of AI-Assisted Preparation',
      });
      break;
    }

    case 'exhibit_index': {
      // Exhibit index: list of exhibits with estimated page counts
      const indexParagraphs: Paragraph[] = [];
      indexParagraphs.push(new Paragraph({
        children: [new TextRun({ text: 'EXHIBIT INDEX', bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
      }));
      indexParagraphs.push(new Paragraph({
        children: [new TextRun({
          text: '[ATTORNEY: Complete exhibit list before filing]',
          italics: true,
        })],
        spacing: { after: 240 },
      }));

      wordCount = 100;
      buffer = await createFormattedDocument({
        stateCode: input.jurisdiction.stateCode,
        isFederal: input.jurisdiction.isFederal,
        content: [...captionParagraphs, ...indexParagraphs],
        documentTitle: 'Exhibit Index',
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
        citationVerification: input.citationVerification,
        protocolFindingsText: input.protocolFindingsText,
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
  const filename = buildFilename(input.orderNumber, docType, requiredDocs);

  if (rules.pageLimit && pageCount > rules.pageLimit && isFiled) {
    warnings.push(`${docType} may exceed ${rules.pageLimit}-page limit (estimated ${pageCount} pages)`);
  }

  return { type: docType, filename, buffer, pageCount, wordCount, isFiled };
}

/**
 * Extract TOC entries from memorandum body text.
 * Looks for heading patterns: lines in ALL CAPS or lines starting with roman/arabic numerals.
 */
function extractTOCEntries(bodyText: string): TOCEntry[] {
  const entries: TOCEntry[] = [];
  const lines = bodyText.split('\n');
  let currentPage = 1;
  let linesOnPage = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      linesOnPage++;
      if (linesOnPage >= 28) { currentPage++; linesOnPage = 0; }
      continue;
    }

    // Detect headings: ALL CAPS lines, or Roman numeral/Arabic numbered sections
    const isAllCaps = trimmed.length > 3 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
    const isRomanNumbered = /^(I{1,3}|IV|V|VI{0,3}|IX|X{0,3})\.\s+/.test(trimmed);
    const isArabicNumbered = /^\d+\.\s+[A-Z]/.test(trimmed);

    if (isAllCaps) {
      entries.push({ title: trimmed, level: 1, pageNumber: currentPage });
    } else if (isRomanNumbered || isArabicNumbered) {
      entries.push({ title: trimmed, level: 2, pageNumber: currentPage });
    }

    linesOnPage++;
    if (linesOnPage >= 28) { currentPage++; linesOnPage = 0; }
  }

  return entries;
}

/**
 * Build a filename following the filing order sequence convention.
 * Format: {orderNumber}_{sequence}_{document_type}
 */
const SEQUENCE_MAP: Record<string, string> = {
  notice_of_motion: '01',
  memorandum: '02',
  declaration: '03a',
  affidavit: '03a',
  separate_statement: '04',
  proposed_order: '05',
  exhibit_index: '06',
  ai_disclosure_page: '06a',
  proof_of_service: '07',
  citation_report: '08',
  attorney_instructions: '09',
};

function buildFilename(orderNumber: string, docType: DocumentType, requiredDocs: DocumentType[]): string {
  // Assign sub-sequences for multiple declarations
  let seq = SEQUENCE_MAP[docType] || '99';

  // Multiple declarations get 03a, 03b, 03c...
  if (docType === 'declaration' || docType === 'affidavit') {
    const declIndex = requiredDocs.filter(d => d === docType).indexOf(docType);
    if (declIndex > 0) {
      seq = `03${String.fromCharCode(97 + declIndex)}`;
    }
  }

  return `${orderNumber}_${seq}_${docType}`;
}

/**
 * Generate inline certificate of service paragraphs for LA Tier A motions.
 * Per La. C.C.P. art. 1313, a certificate of service may be appended directly
 * to the motion instead of filing a separate proof of service document.
 */
function generateInlineCertificateOfService(
  attorneyName: string,
  rules: FormattingRules,
): Paragraph[] {
  const fontFamily = rules.font.family;
  const fontSize = rules.font.sizePoints * 2;
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return [
    new Paragraph({ spacing: { before: 480 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'CERTIFICATE OF SERVICE',
          bold: true,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `I hereby certify that on ${dateStr}, a copy of the foregoing was served on all counsel of record by `,
          font: fontFamily,
          size: fontSize,
        }),
        new TextRun({
          text: '[ATTORNEY: Insert service method — e.g., electronic filing, hand delivery, certified mail]',
          italics: true,
          font: fontFamily,
          size: fontSize,
        }),
        new TextRun({
          text: '.',
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 360, line: rules.font.lineSpacingDXA },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: '_________________________________', font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: attorneyName, font: fontFamily, size: fontSize }),
      ],
      spacing: { after: 0 },
    }),
  ];
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
