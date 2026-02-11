/**
 * Doc Gen Bridge
 *
 * Connects Phase VIII output → filing package assembler → Supabase Storage.
 *
 * Flow:
 * 1. Fetch order from database (all fields + profile + parties)
 * 2. Read Phase VIII output from orders.phase_outputs (fallback to Phase V)
 * 3. Transform AI output into AssemblerInput shape
 * 4. Call assembleFilingPackage()
 * 5. Upload each document (.docx + .pdf) to Supabase Storage
 * 6. Return complete result with document metadata
 *
 * This module never throws — all errors are captured and returned in the result.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { assembleFilingPackage, type AssemblerInput, type FilingPackage } from '../generators/filing-package-assembler';
import { convertDocxBufferToPDF } from '../pdf/generator';
import { uploadDocument, ensureBucketExists } from './storage-manager';

// ============================================================================
// TYPES
// ============================================================================

export interface DocGenInput {
  orderId: string;
  orderNumber: string;
}

export interface UploadedDocument {
  type: string;
  filename: string;
  docxPath?: string;
  pdfPath?: string;
  docxUrl?: string;
  pdfUrl?: string;
  pageCount: number;
  wordCount: number;
}

export interface DocGenResult {
  success: boolean;
  package?: FilingPackage;
  uploadedDocuments: UploadedDocument[];
  errors: string[];
  warnings: string[];
}

// ============================================================================
// MOTION TYPE DISPLAY NAME MAPPING
// ============================================================================

const MOTION_DISPLAY_NAMES: Record<string, string> = {
  'MTD_12B6': 'Motion to Dismiss (12(b)(6))',
  'MSJ': 'Motion for Summary Judgment',
  'MCOMPEL': 'Motion to Compel Discovery',
  'MTC': 'Motion to Continue',
  'MSTRIKE': 'Motion to Strike',
  'MEXT': 'Motion to Extend Time',
  'MPRO_HAC': 'Motion for Admission Pro Hac Vice',
  'MSA': 'Motion for Summary Adjudication',
  'MIL': 'Motion in Limine',
  'MRECUSE': 'Motion to Recuse',
  'MDECL': 'Declinatory Exception',
  'MDIL': 'Dilatory Exception',
  'MPER_CAUSE': 'Peremptory Exception — No Cause of Action',
  'MPER_RIGHT': 'Peremptory Exception — No Right of Action',
  'MPER_PRESC': 'Peremptory Exception — Prescription',
  'MPER_RES': 'Peremptory Exception — Res Judicata',
  'MPRELIM_INJ': 'Motion for Preliminary Injunction',
  'MTRO': 'Motion for Temporary Restraining Order',
};

function getMotionDisplayName(code: string): string {
  return MOTION_DISPLAY_NAMES[code] || code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ============================================================================
// PHASE OUTPUT EXTRACTION
// ============================================================================

interface MotionSections {
  caption: string;
  title: string;
  introduction: string;
  statementOfFacts: string;
  legalArguments: unknown[];
  conclusion: string;
  prayerForRelief: string;
  signature: string;
  certificateOfService: string;
}

/**
 * Extract the motion sections from phase outputs.
 * Prefers Phase VIII (revised) over Phase V (original draft).
 */
function extractMotionSections(
  phaseOutputs: Record<string, unknown>
): { sections: MotionSections | null; source: 'VIII' | 'V' | null } {
  // Try Phase VIII first (revised motion)
  const phaseVIII = phaseOutputs['VIII'] as Record<string, unknown> | undefined;
  if (phaseVIII?.revisedMotion) {
    const rm = phaseVIII.revisedMotion as Record<string, unknown>;
    return {
      sections: normalizeMotionSections(rm),
      source: 'VIII',
    };
  }

  // Fall back to Phase V (original draft)
  const phaseV = phaseOutputs['V'] as Record<string, unknown> | undefined;
  if (phaseV?.draftMotion) {
    const dm = phaseV.draftMotion as Record<string, unknown>;
    return {
      sections: normalizeMotionSections(dm),
      source: 'V',
    };
  }

  // Phase V output might BE the draft motion (no wrapper key)
  if (phaseV?.caption || phaseV?.introduction || phaseV?.legalArguments) {
    return {
      sections: normalizeMotionSections(phaseV),
      source: 'V',
    };
  }

  return { sections: null, source: null };
}

function normalizeMotionSections(raw: Record<string, unknown>): MotionSections {
  return {
    caption: String(raw.caption || ''),
    title: String(raw.title || ''),
    introduction: String(raw.introduction || ''),
    statementOfFacts: String(raw.statementOfFacts || raw.statement_of_facts || ''),
    legalArguments: Array.isArray(raw.legalArguments) ? raw.legalArguments : [],
    conclusion: String(raw.conclusion || ''),
    prayerForRelief: String(raw.prayerForRelief || raw.prayer_for_relief || ''),
    signature: String(raw.signature || ''),
    certificateOfService: String(raw.certificateOfService || raw.certificate_of_service || ''),
  };
}

/**
 * Build motionBody from the sections.
 * The "motion" is the short document that references the memorandum.
 */
function buildMotionBody(sections: MotionSections): string {
  const parts: string[] = [];

  if (sections.introduction) parts.push(sections.introduction);
  if (sections.prayerForRelief) parts.push(sections.prayerForRelief);

  return parts.join('\n\n') || 'Motion content not available.';
}

/**
 * Build memorandumBody from the sections.
 * The memorandum is the substantive document with all arguments.
 */
function buildMemorandumBody(sections: MotionSections): string {
  const parts: string[] = [];

  if (sections.introduction) parts.push(sections.introduction);

  if (sections.statementOfFacts) {
    parts.push(`STATEMENT OF FACTS\n\n${sections.statementOfFacts}`);
  }

  if (sections.legalArguments.length > 0) {
    const argText = sections.legalArguments.map(arg => {
      if (typeof arg === 'string') return arg;
      const a = arg as Record<string, unknown>;
      const heading = a.heading || '';
      const content = a.content || '';
      return heading ? `${heading}\n\n${content}` : String(content);
    }).join('\n\n');
    parts.push(argText);
  }

  if (sections.conclusion) parts.push(`CONCLUSION\n\n${sections.conclusion}`);

  return parts.join('\n\n') || 'Memorandum content not available.';
}

// ============================================================================
// JURISDICTION PARSING
// ============================================================================

function parseJurisdiction(jurisdictionStr: string): {
  stateCode: string;
  isFederal: boolean;
  parish?: string;
  county?: string;
  federalDistrict?: string;
} {
  const normalized = jurisdictionStr.toUpperCase();
  const isFederal = normalized.includes('FEDERAL') ||
    normalized.includes('U.S.') ||
    normalized.includes('UNITED STATES') ||
    normalized.includes('USDC');

  // Extract state code — default to LA
  let stateCode = 'LA';
  const stateMatch = jurisdictionStr.match(/\b([A-Z]{2})\b/);
  if (stateMatch) {
    stateCode = stateMatch[1];
  }

  // Extract parish (Louisiana) or county
  const parishMatch = jurisdictionStr.match(/Parish\s+of\s+([^,]+)/i);
  const countyMatch = jurisdictionStr.match(/County\s+of\s+([^,]+)/i);

  // Extract federal district
  const districtMatch = jurisdictionStr.match(/(Eastern|Western|Middle|Northern|Southern)\s+District/i);

  return {
    stateCode,
    isFederal,
    parish: parishMatch?.[1]?.trim(),
    county: countyMatch?.[1]?.trim(),
    federalDistrict: districtMatch ? `${districtMatch[1]} District of ${stateCode === 'LA' ? 'Louisiana' : stateCode}` : undefined,
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Generate a filing package from Phase VIII output and upload to storage.
 *
 * This is the main integration function that bridges the AI workflow output
 * to the document generation pipeline.
 */
export async function generateAndStoreFilingPackage(
  supabase: SupabaseClient,
  input: DocGenInput
): Promise<DocGenResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const uploadedDocuments: UploadedDocument[] = [];

  console.log(`[doc-gen-bridge] Starting filing package generation for order ${input.orderId}`);

  try {
    // ── 1. Fetch order from database ──────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        parties (
          party_name,
          party_role
        ),
        profiles:client_id (
          full_name,
          bar_number,
          firm_name,
          firm_address,
          firm_city,
          firm_state,
          firm_zip,
          firm_phone,
          email
        )
      `)
      .eq('id', input.orderId)
      .single();

    if (orderError || !order) {
      errors.push(`Order fetch failed: ${orderError?.message || 'Order not found'}`);
      return { success: false, uploadedDocuments, errors, warnings };
    }

    // ── 2. Extract Phase VIII/V output ────────────────────────────────────
    const phaseOutputs = (order.phase_outputs || {}) as Record<string, unknown>;
    const { sections, source } = extractMotionSections(phaseOutputs);

    if (!sections || !source) {
      errors.push('No motion content found in Phase VIII or Phase V outputs. Cannot generate filing package.');
      return { success: false, uploadedDocuments, errors, warnings };
    }

    console.log(`[doc-gen-bridge] Using motion from Phase ${source}`, {
      orderId: input.orderId,
      hasCaptionContent: !!sections.caption,
      hasIntroduction: !!sections.introduction,
      argumentCount: sections.legalArguments.length,
    });

    // ── 3. Build attorney info ────────────────────────────────────────────
    const profile = order.profiles as Record<string, string | null> | null;
    const attorney = {
      name: profile?.full_name || '',
      firmName: profile?.firm_name || undefined,
      barNumber: profile?.bar_number || '',
      barState: profile?.firm_state || 'LA',
      address: [
        profile?.firm_address || '',
        `${profile?.firm_city || ''}, ${profile?.firm_state || 'LA'} ${profile?.firm_zip || ''}`.trim(),
      ].filter(Boolean),
      phone: profile?.firm_phone || '',
      email: profile?.email || '',
      representingParty: (order.parties as Array<{ party_name: string; party_role: string }> | null)?.[0]?.party_name || 'Movant',
    };

    if (!attorney.name) {
      warnings.push('Attorney name missing from profile — signature block may be incomplete');
    }

    // ── 4. Parse jurisdiction ─────────────────────────────────────────────
    const jurisdiction = parseJurisdiction(order.jurisdiction || 'LA');

    // ── 5. Build case info ────────────────────────────────────────────────
    const parties = (order.parties as Array<{ party_name: string; party_role: string }> | null) || [];
    const plaintiffs = parties
      .filter(p => ['plaintiff', 'petitioner'].includes(p.party_role?.toLowerCase()))
      .map(p => p.party_name);
    const defendants = parties
      .filter(p => ['defendant', 'respondent'].includes(p.party_role?.toLowerCase()))
      .map(p => p.party_name);

    const caseInfo = {
      courtName: order.court_division || order.jurisdiction || 'DISTRICT COURT',
      parish: jurisdiction.parish,
      county: jurisdiction.county,
      caseNumber: order.case_number || '',
      plaintiffs: plaintiffs.length > 0 ? plaintiffs : ['[PLAINTIFF]'],
      defendants: defendants.length > 0 ? defendants : ['[DEFENDANT]'],
      clientRole: (order.client_role || 'plaintiff') as 'plaintiff' | 'defendant',
      motionTitle: sections.title || getMotionDisplayName(order.motion_type || ''),
      isFederal: jurisdiction.isFederal,
      federalDistrict: jurisdiction.federalDistrict,
    };

    // ── 6. Build content ──────────────────────────────────────────────────
    const motionBody = buildMotionBody(sections);
    const memorandumBody = buildMemorandumBody(sections);

    // Extract proposed order relief if present
    const phaseIX = phaseOutputs['IX'] as Record<string, unknown> | undefined;
    const proposedOrderRelief = (phaseIX?.proposedOrderTerms || phaseIX?.proposedOrder) as string[] | undefined;

    // ── 7. Assemble filing package ────────────────────────────────────────
    const motionType = order.motion_type || 'MCOMPEL';
    const motionTypeDisplay = getMotionDisplayName(motionType);
    const normalizedTier = normalizeTier(order.motion_tier || order.tier);

    const assemblerInput: AssemblerInput = {
      orderId: input.orderId,
      orderNumber: input.orderNumber || order.order_number || '',
      jurisdiction,
      motionType,
      motionTypeDisplay,
      tier: normalizedTier,
      caseInfo,
      attorney,
      content: {
        motionBody,
        memorandumBody,
        proposedOrderRelief: proposedOrderRelief || undefined,
      },
      filingDeadline: order.filing_deadline || undefined,
      localRuleFlags: [],
      citationWarnings: [],
    };

    let filingPackage: FilingPackage;
    try {
      filingPackage = await assembleFilingPackage(assemblerInput);
      warnings.push(...filingPackage.warnings);
    } catch (assemblyError) {
      errors.push(`Filing package assembly failed: ${assemblyError instanceof Error ? assemblyError.message : 'Unknown error'}`);
      return { success: false, uploadedDocuments, errors, warnings };
    }

    console.log(`[doc-gen-bridge] Filing package assembled:`, {
      orderId: input.orderId,
      documentCount: filingPackage.documents.length,
      totalPages: filingPackage.metadata.totalPages,
    });

    // ── 8. Upload documents to storage ────────────────────────────────────
    await ensureBucketExists(supabase);

    for (const doc of filingPackage.documents) {
      const uploaded: UploadedDocument = {
        type: doc.type,
        filename: doc.filename,
        pageCount: doc.pageCount,
        wordCount: doc.wordCount,
      };

      // Upload .docx
      const docxFilename = `${doc.filename}.docx`;
      const docxResult = await uploadDocument(
        supabase,
        input.orderId,
        docxFilename,
        doc.buffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      if (docxResult.success) {
        uploaded.docxPath = docxResult.path;
        uploaded.docxUrl = docxResult.signedUrl;
      } else {
        warnings.push(`Failed to upload ${docxFilename}: ${docxResult.error}`);
      }

      // Convert to PDF and upload
      try {
        const pdfResult = await convertDocxBufferToPDF(doc.buffer, {
          filename: `${doc.filename}.pdf`,
        });

        if (pdfResult.success && pdfResult.buffer) {
          const pdfFilename = pdfResult.filename.endsWith('.pdf')
            ? pdfResult.filename
            : `${doc.filename}.pdf`;

          const pdfUpload = await uploadDocument(
            supabase,
            input.orderId,
            pdfFilename,
            pdfResult.buffer,
            'application/pdf'
          );

          if (pdfUpload.success) {
            uploaded.pdfPath = pdfUpload.path;
            uploaded.pdfUrl = pdfUpload.signedUrl;
          } else {
            warnings.push(`Failed to upload PDF for ${doc.filename}: ${pdfUpload.error}`);
          }

          if (pdfResult.warnings) {
            warnings.push(...pdfResult.warnings);
          }
        } else {
          warnings.push(`PDF conversion skipped for ${doc.filename}: ${pdfResult.error || 'LibreOffice not available'}`);
        }
      } catch (pdfError) {
        warnings.push(`PDF conversion failed for ${doc.filename}: ${pdfError instanceof Error ? pdfError.message : 'Unknown'}`);
      }

      uploadedDocuments.push(uploaded);
    }

    // ── 9. Record document metadata on order ──────────────────────────────
    try {
      await supabase
        .from('orders')
        .update({
          document_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.orderId);
    } catch (updateErr) {
      warnings.push(`Failed to update order metadata: ${updateErr instanceof Error ? updateErr.message : 'Unknown'}`);
    }

    console.log(`[doc-gen-bridge] Filing package generation complete:`, {
      orderId: input.orderId,
      uploadedCount: uploadedDocuments.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return {
      success: true,
      package: filingPackage,
      uploadedDocuments,
      errors,
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in doc gen bridge';
    errors.push(message);
    console.error(`[doc-gen-bridge] Fatal error:`, { orderId: input.orderId, error: message });
    return { success: false, uploadedDocuments, errors, warnings };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeTier(tier: unknown): 'A' | 'B' | 'C' {
  if (tier === 'A' || tier === 'B' || tier === 'C') return tier;
  if (typeof tier === 'number') {
    if (tier <= 1) return 'A';
    if (tier === 2) return 'B';
    return 'C';
  }
  if (typeof tier === 'string') {
    const upper = tier.toUpperCase();
    if (upper === 'A' || upper === 'B' || upper === 'C') return upper as 'A' | 'B' | 'C';
    if (tier === '1' || tier === '0') return 'A';
    if (tier === '2') return 'B';
    if (tier === '3') return 'C';
  }
  return 'B'; // Default to Tier B
}
