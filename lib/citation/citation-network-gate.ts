/**
 * Citation Network Execution Gate
 * Determines whether citation network runs for an order
 *
 * Rules:
 * - Tier A: SKIP (procedural motions, 3-7 citations, marginal benefit)
 * - Tier B/C/D: RUN (substantive motions need strength analysis)
 *
 * NOTE: HIGH_STAKES flag was removed per ST-011.
 * Tier A motions skip citation network regardless of case stakes.
 */

export function shouldRunCitationNetwork(tier: 'A' | 'B' | 'C' | 'D'): boolean {
  // Simple. No HIGH_STAKES flag.
  return tier !== 'A';
}

/**
 * For use in pipeline orchestrator:
 *
 * if (shouldRunCitationNetwork(order.tier)) {
 *   const networkResults = await getForwardCitations(opinionId);
 *   // ... process strength + treatment
 * } else {
 *   // Tier A: skip citation network entirely
 *   // Step 5 (bad law) still runs via Protocols 18-23
 * }
 */
