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
