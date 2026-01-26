/**
 * Citation Bank Module (Task 32)
 *
 * Bank-Only Citation Enforcement - Decision 1 from Stress Testing
 *
 * Rule: ALL citations must exist in Phase IV bank OR pass Mini Phase IV verification.
 * If citation isn't in the bank, trigger Mini Phase IV.
 * Hard block (BLOCKING flag) if verification fails.
 *
 * Source: Chunk 5, Task 32 - Binding Citation Decisions
 */

import { createClient } from '@/lib/supabase/server';
import { verifyCitation } from '@/lib/citation/verification-pipeline';
import type { MotionTier } from '@/lib/ai/model-router';

// ============================================================================
// TYPES
// ============================================================================

export interface CitationBankEntry {
  citation: string;
  caseName: string;
  year: number;
  court: string;
  reporter: string;
  volume: string;
  page: string;
  pinpoint?: string;
  proposition: string;
  verificationStatus: 'verified' | 'pending' | 'failed';
  addedAt: Date;
  source: 'phase_iv' | 'mini_phase_iv' | 'manual';
}

export interface StatutoryCitationEntry {
  citation: string;
  name: string;
  jurisdiction: string;
  currentAsOf: string;
  verificationStatus: 'verified' | 'pending';
}

export interface CitationBank {
  orderId: string;
  cases: CitationBankEntry[];
  statutes: StatutoryCitationEntry[];
  lastUpdated: Date;
}

export interface BankCheckResult {
  isInBank: boolean;
  entry?: CitationBankEntry | StatutoryCitationEntry;
  requiresMiniPhaseIV: boolean;
  blockingReason?: string;
}

export interface MiniPhaseIVResult {
  success: boolean;
  verified: boolean;
  addedToBank: boolean;
  blockingFlag: boolean;
  error?: string;
  verificationResult?: {
    confidence: number;
    status: string;
    flags: string[];
  };
}

// ============================================================================
// BANK OPERATIONS
// ============================================================================

/**
 * Load the citation bank for an order from database
 */
export async function loadCitationBank(orderId: string): Promise<CitationBank | null> {
  try {
    const supabase = await createClient();

    // Load from phase outputs
    const { data: order, error } = await supabase
      .from('orders')
      .select('phase_outputs')
      .eq('id', orderId)
      .single();

    if (error || !order?.phase_outputs) {
      console.warn(`[CitationBank] No phase outputs found for order ${orderId}`);
      return null;
    }

    const phaseOutputs = order.phase_outputs as Record<string, unknown>;
    const phaseIV = phaseOutputs['IV'] as {
      caseCitationBank?: Array<{
        citation: string;
        caseName: string;
        year: number;
        court: string;
        reporter?: string;
        volume?: string;
        page?: string;
        proposition?: string;
      }>;
      statutoryCitationBank?: Array<{
        citation: string;
        name: string;
        jurisdiction?: string;
        currentAsOf?: string;
      }>;
    } | undefined;

    if (!phaseIV) {
      console.warn(`[CitationBank] Phase IV not yet completed for order ${orderId}`);
      return null;
    }

    const bank: CitationBank = {
      orderId,
      cases: (phaseIV.caseCitationBank || []).map(c => ({
        citation: c.citation,
        caseName: c.caseName,
        year: c.year,
        court: c.court,
        reporter: c.reporter || '',
        volume: c.volume || '',
        page: c.page || '',
        proposition: c.proposition || '',
        verificationStatus: 'verified' as const,
        addedAt: new Date(),
        source: 'phase_iv' as const,
      })),
      statutes: (phaseIV.statutoryCitationBank || []).map(s => ({
        citation: s.citation,
        name: s.name,
        jurisdiction: s.jurisdiction || 'federal',
        currentAsOf: s.currentAsOf || new Date().toISOString(),
        verificationStatus: 'verified' as const,
      })),
      lastUpdated: new Date(),
    };

    console.log(`[CitationBank] Loaded ${bank.cases.length} cases, ${bank.statutes.length} statutes for order ${orderId}`);
    return bank;
  } catch (error) {
    console.error('[CitationBank] Error loading bank:', error);
    return null;
  }
}

/**
 * Check if a citation exists in the bank
 */
export function checkCitationInBank(
  citation: string,
  bank: CitationBank
): BankCheckResult {
  // Normalize citation for comparison
  const normalizedCitation = normalizeCitationForComparison(citation);

  // Check case citations
  for (const entry of bank.cases) {
    const normalizedEntry = normalizeCitationForComparison(entry.citation);
    if (normalizedCitation === normalizedEntry) {
      return {
        isInBank: true,
        entry,
        requiresMiniPhaseIV: false,
      };
    }
  }

  // Check statutory citations
  for (const entry of bank.statutes) {
    const normalizedEntry = normalizeCitationForComparison(entry.citation);
    if (normalizedCitation === normalizedEntry) {
      return {
        isInBank: true,
        entry,
        requiresMiniPhaseIV: false,
      };
    }
  }

  // Not in bank - requires Mini Phase IV
  return {
    isInBank: false,
    requiresMiniPhaseIV: true,
    blockingReason: 'Citation not found in Phase IV bank',
  };
}

/**
 * Normalize citation for comparison
 * Removes extra spaces, standardizes punctuation
 */
function normalizeCitationForComparison(citation: string): string {
  return citation
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .replace(/\.\s*/g, '. ')
    .replace(/\s+\(/g, ' (')
    .trim();
}

// ============================================================================
// MINI PHASE IV
// ============================================================================

/**
 * Execute Mini Phase IV for an unauthorized citation
 * This is a lightweight verification when a citation appears that wasn't in the original bank
 */
export async function executeMiniPhaseIV(
  citation: string,
  proposition: string,
  orderId: string,
  tier: MotionTier
): Promise<MiniPhaseIVResult> {
  console.log(`[CitationBank] Executing Mini Phase IV for: ${citation}`);

  try {
    // Run citation through verification pipeline
    const verificationResult = await verifyCitation(
      citation,
      proposition,
      orderId,
      tier,
      {
        enableCaching: true,
        logToDb: true,
      }
    );

    // Check if verification passed
    const passed = verificationResult.finalStatus === 'VERIFIED';
    const hasBlockingFlags = verificationResult.flags.some(f =>
      f === 'NOT_FOUND' ||
      f === 'BAD_LAW' ||
      f === 'HOLDING_MISMATCH' ||
      f === 'FABRICATED'
    );

    if (!passed || hasBlockingFlags) {
      console.warn(`[CitationBank] Mini Phase IV FAILED for: ${citation}`);
      return {
        success: true,
        verified: false,
        addedToBank: false,
        blockingFlag: true,
        verificationResult: {
          confidence: verificationResult.compositeConfidence,
          status: verificationResult.finalStatus,
          flags: verificationResult.flags,
        },
        error: `Citation failed verification: ${verificationResult.flags.join(', ')}`,
      };
    }

    // Verification passed - add to bank
    const addedToBank = await addCitationToBank(
      citation,
      proposition,
      orderId,
      verificationResult
    );

    console.log(`[CitationBank] Mini Phase IV PASSED for: ${citation}`);
    return {
      success: true,
      verified: true,
      addedToBank,
      blockingFlag: false,
      verificationResult: {
        confidence: verificationResult.compositeConfidence,
        status: verificationResult.finalStatus,
        flags: verificationResult.flags,
      },
    };
  } catch (error) {
    console.error('[CitationBank] Mini Phase IV error:', error);
    return {
      success: false,
      verified: false,
      addedToBank: false,
      blockingFlag: true,
      error: error instanceof Error ? error.message : 'Unknown error during Mini Phase IV',
    };
  }
}

/**
 * Add a verified citation to the bank
 */
async function addCitationToBank(
  citation: string,
  proposition: string,
  orderId: string,
  verificationResult: { compositeConfidence: number; finalStatus: string }
): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Get current phase outputs
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('phase_outputs')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      console.error('[CitationBank] Failed to fetch order for bank update');
      return false;
    }

    const phaseOutputs = (order.phase_outputs || {}) as Record<string, unknown>;
    const phaseIV = (phaseOutputs['IV'] || {}) as Record<string, unknown>;
    const caseCitationBank = (phaseIV.caseCitationBank || []) as Array<Record<string, unknown>>;

    // Add new citation
    caseCitationBank.push({
      citation,
      caseName: extractCaseName(citation),
      year: extractYear(citation),
      court: 'Unknown',
      proposition,
      verificationStatus: 'verified',
      addedAt: new Date().toISOString(),
      source: 'mini_phase_iv',
      miniPhaseIVConfidence: verificationResult.compositeConfidence,
    });

    // Update phase outputs
    phaseOutputs['IV'] = {
      ...phaseIV,
      caseCitationBank,
    };

    const { error: updateError } = await supabase
      .from('orders')
      .update({ phase_outputs: phaseOutputs })
      .eq('id', orderId);

    if (updateError) {
      console.error('[CitationBank] Failed to update bank:', updateError);
      return false;
    }

    console.log(`[CitationBank] Added citation to bank: ${citation}`);
    return true;
  } catch (error) {
    console.error('[CitationBank] Error adding to bank:', error);
    return false;
  }
}

// ============================================================================
// ENFORCEMENT
// ============================================================================

/**
 * Enforce bank-only citation rule
 * Returns BLOCKING flag if citation fails verification
 */
export async function enforceBankOnlyCitation(
  citation: string,
  proposition: string,
  orderId: string,
  tier: MotionTier
): Promise<{
  allowed: boolean;
  requiresAttorneyReview: boolean;
  blockingFlag: boolean;
  reason: string;
  miniPhaseIVResult?: MiniPhaseIVResult;
}> {
  // Load the citation bank
  const bank = await loadCitationBank(orderId);

  if (!bank) {
    // No bank exists yet - this is early in the workflow
    // Allow but flag for review
    return {
      allowed: true,
      requiresAttorneyReview: true,
      blockingFlag: false,
      reason: 'Citation bank not yet established (pre-Phase IV)',
    };
  }

  // Check if citation is in bank
  const bankCheck = checkCitationInBank(citation, bank);

  if (bankCheck.isInBank) {
    return {
      allowed: true,
      requiresAttorneyReview: false,
      blockingFlag: false,
      reason: 'Citation found in Phase IV bank',
    };
  }

  // Citation not in bank - execute Mini Phase IV
  const miniResult = await executeMiniPhaseIV(citation, proposition, orderId, tier);

  if (miniResult.verified && miniResult.addedToBank) {
    return {
      allowed: true,
      requiresAttorneyReview: false,
      blockingFlag: false,
      reason: 'Citation verified via Mini Phase IV and added to bank',
      miniPhaseIVResult: miniResult,
    };
  }

  // Mini Phase IV failed - BLOCKING
  return {
    allowed: false,
    requiresAttorneyReview: true,
    blockingFlag: true,
    reason: miniResult.error || 'Citation failed Mini Phase IV verification',
    miniPhaseIVResult: miniResult,
  };
}

/**
 * Batch check multiple citations against the bank
 */
export async function batchCheckCitations(
  citations: Array<{ citation: string; proposition: string }>,
  orderId: string,
  tier: MotionTier
): Promise<Array<{
  citation: string;
  proposition: string;
  result: Awaited<ReturnType<typeof enforceBankOnlyCitation>>;
}>> {
  const results: Array<{
    citation: string;
    proposition: string;
    result: Awaited<ReturnType<typeof enforceBankOnlyCitation>>;
  }> = [];

  // Process sequentially to avoid overwhelming APIs
  for (const { citation, proposition } of citations) {
    const result = await enforceBankOnlyCitation(citation, proposition, orderId, tier);
    results.push({ citation, proposition, result });

    // If we hit a blocking flag, we can continue checking but track it
    if (result.blockingFlag) {
      console.warn(`[CitationBank] BLOCKING flag raised for: ${citation}`);
    }
  }

  return results;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract case name from citation string
 */
function extractCaseName(citation: string): string {
  // Match pattern like "Smith v. Jones" or "In re Smith"
  const vMatch = citation.match(/^([^,]+?\s+v\.\s+[^,]+)/i);
  if (vMatch) return vMatch[1];

  const inReMatch = citation.match(/^(In\s+re\s+[^,]+)/i);
  if (inReMatch) return inReMatch[1];

  // Return first part before comma
  const parts = citation.split(',');
  return parts[0].trim();
}

/**
 * Extract year from citation string
 */
function extractYear(citation: string): number {
  const yearMatch = citation.match(/\((\d{4})\)/);
  if (yearMatch) return parseInt(yearMatch[1], 10);

  // Try to find any 4-digit year
  const anyYear = citation.match(/\b(19|20)\d{2}\b/);
  if (anyYear) return parseInt(anyYear[0], 10);

  return new Date().getFullYear();
}

/**
 * Get statistics about the citation bank
 */
export function getBankStatistics(bank: CitationBank): {
  totalCases: number;
  totalStatutes: number;
  verifiedCases: number;
  miniPhaseIVCases: number;
} {
  const verifiedCases = bank.cases.filter(c => c.source === 'phase_iv').length;
  const miniPhaseIVCases = bank.cases.filter(c => c.source === 'mini_phase_iv').length;

  return {
    totalCases: bank.cases.length,
    totalStatutes: bank.statutes.length,
    verifiedCases,
    miniPhaseIVCases,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadCitationBank,
  checkCitationInBank,
  executeMiniPhaseIV,
  enforceBankOnlyCitation,
  batchCheckCitations,
  getBankStatistics,
};
