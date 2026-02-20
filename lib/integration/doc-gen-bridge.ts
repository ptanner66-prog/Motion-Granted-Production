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
import { uploadDocument, ensureBucketExists } from './storage-manager';
import { normalizeTier } from '@/lib/utils/tier-helpers';
import { resolveBarState } from '@/lib/jurisdiction/registry';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('integration-doc-gen-bridge');
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
  docxUrl?: string;
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

  log.info(`[doc-gen-bridge] Starting filing package generation for order ${input.orderId}`);

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

    log.info(`[doc-gen-bridge] Using motion from Phase ${source}`, {
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
      // T-38: Use resolveBarState instead of hardcoded 'LA'
      barState: (() => {
        try {
          return resolveBarState(order.jurisdiction || 'LA');
        } catch {
          console.warn(`[doc-gen-bridge] Unknown jurisdiction "${order.jurisdiction}" for bar state — defaulting to LA`);
          return 'LA';
        }
      })(),
      address: [
        profile?.firm_address || '',
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

    // ── 6b. Query protocol findings for AIS (A-013) ───────────────────────
    let protocolFindingsText: string | undefined;
    try {
      const { data: protocolRows } = await supabase
        .from('protocol_results')
        .select('protocol_number, triggered, severity, ais_entry')
        .eq('order_id', input.orderId)
        .eq('triggered', true)
        .order('severity', { ascending: true });

      if (protocolRows && protocolRows.length > 0) {
        const lines: string[] = [];
        for (const row of protocolRows) {
          const entry = row.ais_entry as { title?: string; description?: string; recommendation?: string } | null;
          if (entry) {
            lines.push(`[${row.severity}] Protocol ${row.protocol_number}: ${entry.title || 'Finding'}`);
            if (entry.description) lines.push(entry.description);
            if (entry.recommendation) lines.push(`Recommendation: ${entry.recommendation}`);
            lines.push('');
          }
        }
        protocolFindingsText = lines.join('\n');
      }
    } catch (protoError) {
      warnings.push('Protocol findings could not be loaded for AIS');
    }

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
      // T-39: Populate localRuleFlags from Phase II procedural_requirements
      localRuleFlags: (() => {
        const phaseII = phaseOutputs['II'] as Record<string, unknown> | undefined;
        const reqs = phaseII?.procedural_requirements as string[] | undefined;
        return Array.isArray(reqs) ? reqs.filter(r => typeof r === 'string' && r.trim()) : [];
      })(),
      // T-39: Populate citationWarnings from Phase V.1 CIV verification results
      citationWarnings: (() => {
        const phaseV1 = phaseOutputs['V.1'] as Record<string, unknown> | undefined;
        const results = phaseV1?.verificationResults as Array<{
          citation: string;
          verified: boolean;
          action: string;
          failReasons?: string[];
        }> | undefined;
        if (!Array.isArray(results)) return [];
        return results
          .filter(r => !r.verified || r.action === 'flagged' || r.action === 'removed')
          .map(r => {
            const reasons = Array.isArray(r.failReasons) && r.failReasons.length > 0
              ? r.failReasons.join('; ')
              : r.action === 'removed' ? 'Citation removed by CIV' : 'Flagged for review';
            return `${r.citation}: ${reasons}`;
          });
      })(),
      // CS-T005: Wire citationVerification from CIV phase outputs → assembler → AIS
      citationVerification: (() => {
        const phaseV1 = phaseOutputs['V.1'] as Record<string, unknown> | undefined;
        const phaseVII1 = phaseOutputs['VII.1'] as Record<string, unknown> | undefined;
        const v1Results = (phaseV1?.verificationResults ?? []) as Array<Record<string, unknown>>;
        const vii1Results = (phaseVII1?.verificationResults ?? []) as Array<Record<string, unknown>>;
        const allResults = [...v1Results, ...vii1Results];
        if (allResults.length === 0) return undefined;
        const verifiedCount = allResults.filter(r => r.verified === true && r.action === 'kept').length;
        const flaggedCount = allResults.filter(r => r.action === 'flagged').length;
        const removedCount = allResults.filter(r => r.action === 'removed').length;
        const total = allResults.length;
        return {
          totalCitations: total,
          verifiedCount,
          unverifiedCount: removedCount,
          flaggedCount,
          pendingCount: total - verifiedCount - flaggedCount - removedCount,
          citations: allResults.slice(0, 50).map(r => ({
            citation: String(r.citation || r.citationText || 'Unknown'),
            status: r.action === 'kept' && r.verified ? 'VERIFIED' : r.action === 'flagged' ? 'FLAGGED' : r.action === 'removed' ? 'BLOCKED' : 'UNKNOWN',
            confidence: typeof r.confidence === 'number' ? r.confidence : 0,
          })),
        };
      })(),
      // A-013: Protocol findings from D9 dispatcher → AIS
      protocolFindingsText,
    };

    let filingPackage: FilingPackage;
    try {
      filingPackage = await assembleFilingPackage(assemblerInput);
      warnings.push(...filingPackage.warnings);
    } catch (assemblyError) {
      errors.push(`Filing package assembly failed: ${assemblyError instanceof Error ? assemblyError.message : 'Unknown error'}`);
      return { success: false, uploadedDocuments, errors, warnings };
    }

    log.info(`[doc-gen-bridge] Filing package assembled:`, {
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

        // FIX-B FIX-12: Create DB record in documents table so download page can find files.
        // Previously, files were uploaded to storage but no database records were created,
        // meaning the download page query returned zero results.
        const { error: insertErr } = await supabase.from('documents').insert({
          order_id: input.orderId,
          file_name: docxFilename,
          file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          file_size: doc.buffer.byteLength,
          file_url: docxResult.path,
          document_type: doc.type === 'attorney_instructions' ? 'instructions' : doc.type,
          uploaded_by: order.client_id,
          is_deliverable: true,
        });
        if (insertErr) {
          warnings.push(`Failed to insert DB record for ${docxFilename}: ${insertErr.message}`);
        }
      } else {
        warnings.push(`Failed to upload ${docxFilename}: ${docxResult.error}`);
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

    log.info(`[doc-gen-bridge] Filing package generation complete:`, {
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
    log.error(`[doc-gen-bridge] Fatal error:`, { orderId: input.orderId, error: message });
    return { success: false, uploadedDocuments, errors, warnings };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

