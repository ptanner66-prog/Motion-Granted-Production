/**
 * Tier Configuration — Motion Granted
 *
 * Consolidated tier-level configuration for the workflow engine.
 * Source of truth for per-tier limits, caps, and thresholds.
 *
 * SP-12 AH-1: Tier D maxRevisionLoops = 4
 *
 * Binding: 02/15/26
 *   - Internal loops: A=2, B=3, C=3, D=4
 *   - Attorney rework cap: 3 (separate from internal loops)
 *   - Quality threshold: 0.87 (B+ minimum all tiers)
 *   - Flat pricing: A=$299, B=$599, C=$999, D=$1,499
 */

export interface TierConfig {
  /** Max internal revision loops (Phase VII→VIII cycle) */
  maxRevisionLoops: number;
  /** Per-cycle AI cost cap in cents */
  costCap: number;
  /** Minimum quality score (B+ = 0.87 for all tiers) */
  qualityThreshold: number;
  /** Rush delivery multiplier (1.0 = standard) */
  rushMultiplier: number;
  /** Base price in cents */
  pricing: number;
}

/**
 * BINDING tier configuration.
 * DO NOT modify without explicit authorization.
 */
const TIER_CONFIG: Record<string, TierConfig> = {
  A: {
    maxRevisionLoops: 2,
    costCap: 500,            // $5.00 per cycle
    qualityThreshold: 0.87,
    rushMultiplier: 1.0,
    pricing: 29900,          // $299.00
  },
  B: {
    maxRevisionLoops: 3,
    costCap: 3500,           // $35.00 per cycle
    qualityThreshold: 0.87,
    rushMultiplier: 1.0,
    pricing: 59900,          // $599.00
  },
  C: {
    maxRevisionLoops: 3,
    costCap: 7500,           // $75.00 per cycle
    qualityThreshold: 0.87,
    rushMultiplier: 1.0,
    pricing: 99900,          // $999.00
  },
  D: {
    maxRevisionLoops: 4,     // BINDING: A=2, B=3, C=3, D=4
    costCap: 12500,          // $125.00 per cycle
    qualityThreshold: 0.87,
    rushMultiplier: 1.0,
    pricing: 149900,         // $1,499.00
  },
};

/** Attorney rework cap — separate from internal revision loops */
export const ATTORNEY_REWORK_CAP = 3;

/**
 * Get tier configuration. Throws on unknown tier.
 *
 * @param tier - Tier letter (A, B, C, D)
 * @returns TierConfig for the requested tier
 * @throws Error if tier is not recognized
 */
export function getTierConfig(tier: string): TierConfig {
  const config = TIER_CONFIG[tier.toUpperCase()];
  if (!config) throw new Error(`Unknown tier: ${tier}`);
  return config;
}

/**
 * Get all tier keys.
 */
export function getAllTiers(): string[] {
  return Object.keys(TIER_CONFIG);
}

/**
 * Effective tier floor rule (M-06).
 * If the motion type requires a higher tier than what was paid,
 * use the motion type tier. If the paid tier is higher (upgrade),
 * use the paid tier. This ensures the workflow never runs at a
 * tier below what the motion type requires.
 *
 * @param motionTypeTier - Tier determined by motion type classification
 * @param paidTier - Tier the customer actually paid for
 * @returns The higher of the two tiers
 */
export function resolveEffectiveTier(motionTypeTier: string, paidTier: string): string {
  const tierRank: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };
  const motionRank = tierRank[motionTypeTier] ?? 1;
  const paidRank = tierRank[paidTier] ?? 1;
  return motionRank >= paidRank ? motionTypeTier : paidTier;
}

export { TIER_CONFIG };
