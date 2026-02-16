/**
 * Fabrication Audit — Motion Granted
 *
 * SP-12 AJ-1: Extracts and audits citations for fabrication.
 * Used at Phase VIII.5 to detect hallucinated or unverifiable citations.
 *
 * Citations flagged as NOT_FOUND, WRONG_COURT, WRONG_DATE, WRONG_PARTIES,
 * or HALLUCINATED are reported to prevent fabricated citations from
 * reaching the final deliverable.
 */

export interface FabricationAuditResult {
  passed: boolean;
  flaggedCitations: FlaggedCitation[];
  totalChecked: number;
  fabricationRate: number; // 0-1
}

export interface FlaggedCitation {
  citationId: string;
  citationText: string;
  reason: 'NOT_FOUND' | 'WRONG_COURT' | 'WRONG_DATE' | 'WRONG_PARTIES' | 'HALLUCINATED';
  confidence: number; // 0-1
}

/**
 * Run fabrication audit on a set of citations.
 *
 * Citations that failed verification or were not found are flagged.
 * The audit passes only if zero citations are flagged.
 *
 * @param citations - Array of citation objects from the draft
 * @param _orderId - Order ID for logging context
 * @returns FabricationAuditResult with pass/fail and flagged citations
 */
export async function runFabricationAudit(
  citations: Array<{ id: string; text: string; verified: boolean; status: string }>,
  _orderId: string
): Promise<FabricationAuditResult> {
  const flagged: FlaggedCitation[] = [];

  for (const cit of citations) {
    if (!cit.verified || cit.status === 'FAILED' || cit.status === 'NOT_FOUND') {
      flagged.push({
        citationId: cit.id,
        citationText: cit.text,
        reason: cit.status === 'NOT_FOUND' ? 'NOT_FOUND' : 'HALLUCINATED',
        confidence: 0.8,
      });
    }
  }

  const totalChecked = citations.length;
  const fabricationRate = totalChecked > 0 ? flagged.length / totalChecked : 0;

  return {
    passed: flagged.length === 0,
    flaggedCitations: flagged,
    totalChecked,
    fabricationRate,
  };
}
