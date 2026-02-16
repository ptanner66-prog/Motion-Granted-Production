/**
 * Cost Cap Validation and Resolution
 *
 * SP-3 Task 4 (D3 Task 12): Hard-coded cost cap defaults per tier.
 * Sub-loop AI cost caps per rework cycle.
 * Env vars COST_CAP_TIER_A/B/C/D override if present and valid.
 *
 * Binding authority: 02/15/26 binding line 13:
 *   'Sub-loop caps A=$5/B=$35/C=$75/D=$125.'
 *
 * R4 CORRECTION: checkSubLoopCostCap and getCostHeadroom queries must
 * filter .eq('is_rework_reset', false). The is_rework_reset column is
 * owned by D4 Task D-5. This function provides the cap values consumed
 * by those queries.
 *
 * COST CAP DESIGN RATIONALE (D3 Task 22)
 *
 * These caps control the maximum AI spend per rework cycle (not per order).
 * Per binding 02/15/26, cost tracking resets on attorney rework via
 * is_rework_reset flag (Domain 4 Task D-5). Each rework cycle gets
 * a fresh budget equal to the tier's cap.
 *
 * Tier A ($5): Effectively prevents revision looping. A single Sonnet-based
 *   Phase VII + VIII cycle costs $4-8. The $5 cap allows 0-1 loops.
 *   This is INTENTIONAL: Tier A motions are procedural ($299-$400 revenue),
 *   and multiple revision cycles are not economically viable.
 *   To change: set COST_CAP_TIER_A env var.
 *
 * Tier B ($35): Allows 2-3 revision loops. Opus Phase VIII costs $8-12/loop.
 *
 * Tier C ($75): Allows 3-5 revision loops. Higher thinking budgets.
 *
 * Tier D ($125): Allows 4-6 revision loops. 16K thinking for Phase VII.
 *   Aligns with 4-loop internal max per binding 02/15/26.
 *
 * RETRY COST NOTE: These caps do NOT include a retry buffer.
 *   Inngest retry cost tracking uses step-level source field
 *   ('primary' vs 'retry') per Vercel/Inngest IV-005.
 *   Cost cap compares against ALL costs (primary + retry).
 *   If retries push over cap, Protocol 10 triggers — acceptable,
 *   as excessive retries indicate infrastructure issues.
 *
 * AGGREGATE CAP: D7-R3-012 recommended aggregate caps across rework
 *   cycles. Deferred to post-launch. Worst case: 3 cycles x $125 =
 *   $375 on $1,499 Tier D revenue (25% cost ratio, still profitable).
 */

const DEFAULT_COST_CAPS: Record<string, number> = {
  A: 5,
  B: 35,
  C: 75,
  D: 125,
};

let resolvedCaps: Record<string, number> | null = null;

/**
 * Validate and resolve cost caps from env vars or defaults.
 * Called once at startup. Subsequent calls return cached values.
 */
export function validateCostCaps(): Record<string, number> {
  if (resolvedCaps) return resolvedCaps;

  resolvedCaps = { ...DEFAULT_COST_CAPS };

  for (const tier of ['A', 'B', 'C', 'D']) {
    const envKey = `COST_CAP_TIER_${tier}`;
    const envVal = process.env[envKey];

    if (envVal === undefined || envVal === '') {
      console.warn(`[cost-caps] ${envKey} not set, using default $${DEFAULT_COST_CAPS[tier]}`);
      continue;
    }

    const parsed = parseFloat(envVal);
    if (isNaN(parsed) || parsed <= 0) {
      console.error(
        `[cost-caps] ${envKey}='${envVal}' is invalid (must be positive number). Using default $${DEFAULT_COST_CAPS[tier]}`
      );
      continue;
    }

    resolvedCaps[tier] = parsed;
    console.info(`[cost-caps] ${envKey} = $${parsed}`);
  }

  return resolvedCaps;
}

/**
 * Get the sub-loop cost cap for a tier.
 * Unknown tiers fall back to Tier D cap with an error log.
 */
export function getCostCap(tier: string): number {
  const caps = validateCostCaps();
  const cap = caps[tier];

  if (cap === undefined) {
    console.error(`[cost-caps] Unknown tier '${tier}', using Tier D cap as fallback`);
    return caps['D'] ?? DEFAULT_COST_CAPS['D'];
  }

  return cap;
}

/**
 * Reset cached caps (for testing only).
 */
export function _resetCostCapsForTesting(): void {
  resolvedCaps = null;
}
