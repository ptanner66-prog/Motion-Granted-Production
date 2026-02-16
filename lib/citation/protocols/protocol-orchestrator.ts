/**
 * Protocol Orchestrator for Citation Verification (A5-005/006, SP-19 Block 2)
 *
 * Coordinates protocol checks during citation verification:
 *   - Protocol 7:  Cumulative citation failure tracking
 *   - Protocol 18: Dicta-as-holding detection
 *   - Protocols 19-23: Bad law detection (overruled / superseded / reversed)
 */
import { createLogger } from '@/lib/logging/logger';

const logger = createLogger('citation-protocol-orchestrator');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProtocolResult {
  protocol: string;
  triggered: boolean;
  action: 'FLAG' | 'BLOCK' | 'HOLD' | 'NONE';
  detail: string;
}

interface VerificationResult {
  overallStatus?: string;
  flags?: Array<{ type: string; severity?: string }>;
}

// ---------------------------------------------------------------------------
// Tier-specific failure thresholds for Protocol 7
// ---------------------------------------------------------------------------

const P7_THRESHOLDS: Record<string, number> = {
  A: 3,
  B: 5,
  C: 7,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all protocol checks against a batch of verification results.
 *
 * @param orderId  - Order being verified
 * @param tier     - Motion tier (A | B | C) — drives P7 threshold
 * @param verificationResults - Array of per-citation verification outputs
 * @returns Array of triggered protocol results (empty when all pass)
 */
export async function runProtocolChecks(
  orderId: string,
  tier: string,
  verificationResults: VerificationResult[]
): Promise<ProtocolResult[]> {
  const results: ProtocolResult[] = [];

  // ------------------------------------------------------------------
  // Protocol 7: Cumulative citation failure tracking
  // ------------------------------------------------------------------
  const failedCount = verificationResults.filter(
    (r) =>
      r.overallStatus === 'FAILED' ||
      r.overallStatus === 'BLOCK' ||
      r.overallStatus === 'VERIFICATION_FAILED'
  ).length;

  const p7Threshold = P7_THRESHOLDS[tier] ?? P7_THRESHOLDS.C;

  if (failedCount >= p7Threshold) {
    results.push({
      protocol: 'P7',
      triggered: true,
      action: 'HOLD',
      detail: `${failedCount} citations failed (threshold: ${p7Threshold}). Citation critical failure.`,
    });
  }

  // ------------------------------------------------------------------
  // Protocol 18: Dicta-as-holding detection
  // ------------------------------------------------------------------
  const dictaCitations = verificationResults.filter((r) =>
    r.flags?.some((f) => f.type === 'DICTA_AS_HOLDING')
  );

  if (dictaCitations.length > 0) {
    results.push({
      protocol: 'P18',
      triggered: true,
      action: 'FLAG',
      detail: `${dictaCitations.length} citation(s) flagged for dicta-as-holding.`,
    });
  }

  // ------------------------------------------------------------------
  // Protocols 19-23: Bad law detection
  // ------------------------------------------------------------------
  const BAD_LAW_TYPES = new Set(['OVERRULED', 'SUPERSEDED', 'REVERSED']);

  const badLawCitations = verificationResults.filter((r) =>
    r.flags?.some((f) => BAD_LAW_TYPES.has(f.type))
  );

  if (badLawCitations.length > 0) {
    results.push({
      protocol: 'P19-23',
      triggered: true,
      action: 'BLOCK',
      detail: `${badLawCitations.length} citation(s) flagged as bad law.`,
    });
  }

  logger.info('Protocol checks complete', {
    orderId,
    tier,
    protocolsTriggered: String(results.filter((r) => r.triggered).length),
    totalResults: String(verificationResults.length),
  });

  return results;
}
