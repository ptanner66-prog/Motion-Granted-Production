/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
 * Unpublished Opinion Handler (Task 34)
 *
 * Unpublished Opinion Refusal - Decision 4 from Stress Testing
 *
 * Rule: System refuses to use unpublished opinions without explicit attorney approval.
 * When unpublished detected:
 * 1. Flag for attorney review (ATTORNEY_REVIEW category)
 * 2. Never include in final motion without explicit attorney approval
 * 3. Suggest published alternatives when available
 *
 * Source: Chunk 5, Task 34 - Binding Citation Decisions
 */

import { createClient } from '@/lib/supabase/server';
// import { searchCitations } from '@/lib/workflow/courtlistener-client'; // TODO: Function not yet implemented

// ============================================================================
// TYPES
// ============================================================================

export type UnpublishedDetectionSource = 'courtlistener' | 'pacer' | 'citation_format' | 'database';

export interface UnpublishedDetectionResult {
  isUnpublished: boolean;
  confidence: number; // 0-1, how confident we are this is unpublished
  source: UnpublishedDetectionSource;
  indicators: string[];
  jurisdiction?: string;
  localRulesUrl?: string;
}

export interface UnpublishedHandlingResult {
  action: 'BLOCK' | 'REQUIRE_APPROVAL' | 'ALLOW_WITH_WARNING';
  requiresAttorneyApproval: boolean;
  flag: 'UNPUBLISHED_BLOCKED' | 'UNPUBLISHED_REVIEW' | 'UNPUBLISHED_APPROVED' | null;
  reason: string;
  alternatives?: AlternativeCitation[];
  localRulesGuidance?: string;
}

export interface AlternativeCitation {
  citation: string;
  caseName: string;
  similarity: number; // 0-1, how similar the holding is
  reason: string;
}

export interface AttorneyApproval {
  citationId: string;
  orderId: string;
  citation: string;
  approvedBy: string;
  approvedAt: Date;
  justification: string;
}

// ============================================================================
// UNPUBLISHED DETECTION PATTERNS
// ============================================================================

// Citation format indicators of unpublished opinions
const UNPUBLISHED_CITATION_PATTERNS = [
  /\bWL\s+\d+/i, // Westlaw citation (often unpublished)
  /\bLEXIS\s+\d+/i, // LexisNexis citation (often unpublished)
  /\d{4}\s+U\.?S\.?\s+Dist\.?\s+LEXIS/i, // U.S. Dist. LEXIS
  /\d{4}\s+U\.?S\.?\s+App\.?\s+LEXIS/i, // U.S. App. LEXIS
  /\bFed\.?\s*Appx\.?\b/i, // Federal Appendix (unpublished)
  /\bslip\s+op\.?\b/i, // Slip opinion
  /\bNot\s+Reported\b/i, // "Not Reported in"
  /\bUnreported\b/i, // Explicitly unreported
  /\bMemo\.?\s+Op\.?/i, // Memorandum opinion (often unpublished)
  /\bT\.C\.?\s*Memo\.?/i, // Tax Court Memo
];

// Jurisdictions where unpublished opinions have special rules
const JURISDICTION_RULES: Record<string, {
  canCite: boolean;
  conditions: string;
  localRulesUrl: string;
}> = {
  '9th Circuit': {
    canCite: true,
    conditions: 'Can cite unpublished opinions issued after January 1, 2007 for persuasive value only.',
    localRulesUrl: 'https://www.ca9.uscourts.gov/rules/',
  },
  'Federal': {
    canCite: true,
    conditions: 'FRAP 32.1 permits citation to unpublished opinions issued on or after January 1, 2007.',
    localRulesUrl: 'https://www.uscourts.gov/rules-policies/current-rules-practice-procedure',
  },
  'California': {
    canCite: false,
    conditions: 'California Rule of Court 8.1115: Unpublished opinions cannot be cited except in limited circumstances.',
    localRulesUrl: 'https://www.courts.ca.gov/rules.htm',
  },
  'New York': {
    canCite: true,
    conditions: 'May cite unpublished opinions for persuasive value.',
    localRulesUrl: 'https://www.nycourts.gov/rules/',
  },
};

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect if a citation is to an unpublished opinion
 */
export function detectUnpublished(
  citation: string,
  metadata?: {
    status?: string;
    source?: string;
    courtlistenerData?: {
      status?: string;
      precedentialStatus?: string;
    };
  }
): UnpublishedDetectionResult {
  const indicators: string[] = [];
  let confidence = 0;
  let source: UnpublishedDetectionSource = 'citation_format';

  // Check citation format patterns
  for (const pattern of UNPUBLISHED_CITATION_PATTERNS) {
    if (pattern.test(citation)) {
      indicators.push(`Citation format matches unpublished pattern: ${pattern.source}`);
      confidence = Math.max(confidence, 0.7);
    }
  }

  // Check CourtListener metadata if available
  if (metadata?.courtlistenerData) {
    const clStatus = metadata.courtlistenerData.status?.toLowerCase() || '';
    const clPrecedential = metadata.courtlistenerData.precedentialStatus?.toLowerCase() || '';

    if (clStatus.includes('unpublished') || clPrecedential.includes('unpublished')) {
      indicators.push('CourtListener reports status as unpublished');
      confidence = 0.95;
      source = 'courtlistener';
    }

    if (clPrecedential.includes('non-precedential')) {
      indicators.push('CourtListener reports non-precedential status');
      confidence = Math.max(confidence, 0.9);
      source = 'courtlistener';
    }
  }

  // Check explicit status metadata
  if (metadata?.status) {
    const status = metadata.status.toLowerCase();
    if (status.includes('unpublished') || status.includes('unreported')) {
      indicators.push(`Explicit status: ${metadata.status}`);
      confidence = 0.99;
      source = metadata.source as UnpublishedDetectionSource || 'database';
    }
  }

  // Detect jurisdiction from citation
  const jurisdiction = detectJurisdiction(citation);

  return {
    isUnpublished: confidence > 0.5,
    confidence,
    source,
    indicators,
    jurisdiction,
    localRulesUrl: jurisdiction ? JURISDICTION_RULES[jurisdiction]?.localRulesUrl : undefined,
  };
}

/**
 * Detect jurisdiction from citation format
 */
function detectJurisdiction(citation: string): string | undefined {
  // Federal circuits
  if (/\b9th\s+Cir\.?/i.test(citation) || /F\.(2d|3d|4th).*9th/i.test(citation)) {
    return '9th Circuit';
  }

  // California
  if (/\bCal\.?\s*(App\.?|Rptr\.?|\d)/i.test(citation)) {
    return 'California';
  }

  // New York
  if (/\bN\.?Y\.?\s*(2d|3d|S\.?|\d)/i.test(citation)) {
    return 'New York';
  }

  // General federal
  if (/\b(F\.(2d|3d|4th)|U\.?S\.?|S\.?\s*Ct\.?)\b/i.test(citation)) {
    return 'Federal';
  }

  return undefined;
}

// ============================================================================
// HANDLING LOGIC
// ============================================================================

/**
 * Handle an unpublished opinion according to Decision 4
 * System refuses to use unpublished opinions without explicit attorney approval
 */
export async function handleUnpublishedOpinion(
  citation: string,
  orderId: string,
  detection: UnpublishedDetectionResult
): Promise<UnpublishedHandlingResult> {
  // Check if attorney has already approved this citation
  const hasApproval = await checkAttorneyApproval(citation, orderId);

  if (hasApproval) {
    return {
      action: 'ALLOW_WITH_WARNING',
      requiresAttorneyApproval: false,
      flag: 'UNPUBLISHED_APPROVED',
      reason: 'Unpublished opinion approved by attorney',
      localRulesGuidance: getLocalRulesGuidance(detection.jurisdiction),
    };
  }

  // Check jurisdiction rules
  const jurisdictionRules = detection.jurisdiction
    ? JURISDICTION_RULES[detection.jurisdiction]
    : undefined;

  // High confidence unpublished - require approval
  if (detection.confidence >= 0.7) {
    const alternatives = await findPublishedAlternatives(citation);

    return {
      action: 'REQUIRE_APPROVAL',
      requiresAttorneyApproval: true,
      flag: 'UNPUBLISHED_REVIEW',
      reason: `Unpublished opinion detected (${Math.round(detection.confidence * 100)}% confidence). ` +
        'Attorney approval required per Decision 4.',
      alternatives,
      localRulesGuidance: getLocalRulesGuidance(detection.jurisdiction),
    };
  }

  // Moderate confidence - warn but allow with review
  if (detection.confidence >= 0.5) {
    return {
      action: 'REQUIRE_APPROVAL',
      requiresAttorneyApproval: true,
      flag: 'UNPUBLISHED_REVIEW',
      reason: `Possible unpublished opinion (${Math.round(detection.confidence * 100)}% confidence). ` +
        'Please verify publication status.',
      localRulesGuidance: jurisdictionRules?.conditions,
    };
  }

  // Low confidence - no action needed
  return {
    action: 'ALLOW_WITH_WARNING',
    requiresAttorneyApproval: false,
    flag: null,
    reason: 'Citation appears to be published',
  };
}

/**
 * Get local rules guidance for a jurisdiction
 */
function getLocalRulesGuidance(jurisdiction?: string): string | undefined {
  if (!jurisdiction || !JURISDICTION_RULES[jurisdiction]) {
    return 'Check local court rules for unpublished opinion citability.';
  }

  return JURISDICTION_RULES[jurisdiction].conditions;
}

// ============================================================================
// ATTORNEY APPROVAL
// ============================================================================

/**
 * Check if attorney has approved an unpublished citation
 */
async function checkAttorneyApproval(citation: string, orderId: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('citation_approvals')
      .select('id')
      .eq('order_id', orderId)
      .eq('citation', citation)
      .eq('approval_type', 'unpublished')
      .limit(1);

    if (error) {
      console.warn('[UnpublishedHandler] Error checking approval:', error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('[UnpublishedHandler] Error checking approval:', error);
    return false;
  }
}

/**
 * Record attorney approval for an unpublished citation
 */
export async function recordAttorneyApproval(
  citation: string,
  orderId: string,
  approvedBy: string,
  justification: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from('citation_approvals').insert({
      order_id: orderId,
      citation,
      approval_type: 'unpublished',
      approved_by: approvedBy,
      justification,
      approved_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[UnpublishedHandler] Error recording approval:', error);
      return { success: false, error: error.message };
    }

    console.log(`[UnpublishedHandler] Recorded approval for: ${citation}`);
    return { success: true };
  } catch (error) {
    console.error('[UnpublishedHandler] Error recording approval:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Revoke attorney approval for an unpublished citation
 */
export async function revokeAttorneyApproval(
  citation: string,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('citation_approvals')
      .delete()
      .eq('order_id', orderId)
      .eq('citation', citation)
      .eq('approval_type', 'unpublished');

    if (error) {
      console.error('[UnpublishedHandler] Error revoking approval:', error);
      return { success: false, error: error.message };
    }

    console.log(`[UnpublishedHandler] Revoked approval for: ${citation}`);
    return { success: true };
  } catch (error) {
    console.error('[UnpublishedHandler] Error revoking approval:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// ALTERNATIVE SUGGESTIONS
// ============================================================================

/**
 * Find published alternatives to an unpublished opinion
 */
async function findPublishedAlternatives(citation: string): Promise<AlternativeCitation[]> {
  const alternatives: AlternativeCitation[] = [];

  try {
    // Extract case name for search
    const caseNameMatch = citation.match(/^([^,]+?\s+v\.\s+[^,]+)/i);
    const caseName = caseNameMatch ? caseNameMatch[1] : citation.split(',')[0];

    // TODO: searchCitations function not yet implemented in courtlistener-client
    // const searchResult = await searchCitations(caseName, { maxResults: 5 });

    // if (searchResult.success && searchResult.citations) {
    //   for (const result of searchResult.citations) {
    //     // Skip if this is the same case or also unpublished
    //     if (result.citation === citation) continue;

    //     const isPublished = !UNPUBLISHED_CITATION_PATTERNS.some(p => p.test(result.citation));
    //     if (!isPublished) continue;

    //     alternatives.push({
    //       citation: result.citation,
    //       caseName: result.caseName || caseName,
    //       similarity: 0.7, // CourtListener returned it as similar
    //       reason: 'Similar case from same search terms',
    //     });
    //   }
    // }
    console.log(`[UnpublishedHandler] Alternative search not yet implemented for: ${caseName}`);
  } catch (error) {
    console.warn('[UnpublishedHandler] Error finding alternatives:', error);
  }

  return alternatives.slice(0, 3); // Return top 3
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process multiple citations for unpublished status
 */
export async function batchCheckUnpublished(
  citations: string[],
  orderId: string
): Promise<Map<string, UnpublishedHandlingResult>> {
  const results = new Map<string, UnpublishedHandlingResult>();

  for (const citation of citations) {
    const detection = detectUnpublished(citation);

    if (detection.isUnpublished) {
      const handling = await handleUnpublishedOpinion(citation, orderId, detection);
      results.set(citation, handling);
    } else {
      results.set(citation, {
        action: 'ALLOW_WITH_WARNING',
        requiresAttorneyApproval: false,
        flag: null,
        reason: 'Citation appears to be published',
      });
    }
  }

  return results;
}

/**
 * Get summary statistics for unpublished citations in an order
 */
export async function getUnpublishedSummary(
  orderId: string,
  citations: string[]
): Promise<{
  totalCitations: number;
  unpublishedCount: number;
  approvedCount: number;
  pendingApprovalCount: number;
  blockedCount: number;
}> {
  let unpublishedCount = 0;
  let approvedCount = 0;
  let pendingApprovalCount = 0;
  let blockedCount = 0;

  for (const citation of citations) {
    const detection = detectUnpublished(citation);

    if (detection.isUnpublished) {
      unpublishedCount++;

      const hasApproval = await checkAttorneyApproval(citation, orderId);
      if (hasApproval) {
        approvedCount++;
      } else if (detection.confidence >= 0.9) {
        blockedCount++;
      } else {
        pendingApprovalCount++;
      }
    }
  }

  return {
    totalCitations: citations.length,
    unpublishedCount,
    approvedCount,
    pendingApprovalCount,
    blockedCount,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectUnpublished,
  handleUnpublishedOpinion,
  recordAttorneyApproval,
  revokeAttorneyApproval,
  batchCheckUnpublished,
  getUnpublishedSummary,
};
