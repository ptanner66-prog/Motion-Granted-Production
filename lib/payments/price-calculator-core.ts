/**
 * Price Calculator Core — Client-safe, ZERO server imports.
 *
 * SP-C Task 9 (Step 6.6a) | BD-4: Runs in both server and client.
 *
 * CRITICAL: This file MUST NOT import from:
 *  - @/lib/supabase/*
 *  - Any Node.js modules (fs, path, crypto, etc.)
 *  - Any server-only packages
 *
 * @module payments/price-calculator-core
 */

// ============================================================================
// TYPES
// ============================================================================

export type MotionTier = 'A' | 'B' | 'C' | 'D';

export type RushType = 'standard' | 'rush_72' | 'rush_48' | 'rush_48hr' | 'rush_24hr';

export interface PriceBreakdown {
  basePrice: number;
  rushFee: number;
  jurisdictionMultiplier: number;
  subtotal: number;
  tier: MotionTier;
  stateCode: string;       // BD-5: was `jurisdiction`
  currency: 'USD';         // BD-12
}

// ============================================================================
// CONSTANTS — BINDING PRICES
// ============================================================================

/** Flat base prices by tier (LA base pricing) */
const TIER_BASE_PRICES: Record<MotionTier, number> = {
  A: 299,
  B: 599,
  C: 999,
  D: 1499,
};

/** Rush fee as a fraction of base price */
const RUSH_MULTIPLIERS: Record<RushType, number> = {
  standard: 0,
  rush_72: 0.25,     // +25%
  rush_48: 0.25,     // +25% (alias for rush_72)
  rush_48hr: 0.25,   // +25%
  rush_24hr: 0.50,   // +50%
};

// ============================================================================
// TIER LOOKUP
// ============================================================================

/**
 * Motion slug → tier mapping.
 * Derived from MOTION_TYPE_REGISTRY but duplicated here to keep
 * this module server-import-free.
 */
const MOTION_TIER_MAP: Record<string, MotionTier> = {
  // Tier A (20 motions)
  'motion-to-extend-deadline': 'A',
  'motion-for-continuance': 'A',
  'motion-to-withdraw-as-counsel': 'A',
  'motion-for-leave-to-file': 'A',
  'motion-to-appear-pro-hac-vice': 'A',
  'motion-to-substitute-counsel': 'A',
  'motion-to-consolidate': 'A',
  'motion-to-sever': 'A',
  'motion-for-default-judgment': 'A',
  'motion-to-set-aside-default': 'A',
  'motion-to-quash-service': 'A',
  'motion-to-stay-proceedings': 'A',
  'motion-to-seal-records': 'A',
  'motion-for-protective-order-simple': 'A',
  'motion-to-shorten-time': 'A',
  'motion-for-service-by-publication': 'A',
  'motion-for-leave-to-amend-simple': 'A',
  'motion-to-strike-simple': 'A',
  'ex-parte-application-routine': 'A',
  'motion-to-relate-cases': 'A',
  // Tier B (50 motions)
  'motion-to-compel-discovery': 'B',
  'motion-for-sanctions': 'B',
  'motion-for-protective-order-complex': 'B',
  'motion-to-quash-subpoena': 'B',
  'motion-in-limine': 'B',
  'motion-to-exclude-expert': 'B',
  'motion-for-new-trial': 'B',
  'motion-to-reconsider': 'B',
  'motion-for-jnov': 'B',
  'motion-to-vacate-judgment': 'B',
  'motion-to-enforce-judgment': 'B',
  'motion-for-contempt': 'B',
  'motion-to-compel-arbitration': 'B',
  'motion-to-confirm-arbitration-award': 'B',
  'motion-to-vacate-arbitration-award': 'B',
  'motion-for-leave-to-amend-complex': 'B',
  'motion-to-strike-complex': 'B',
  'motion-for-judgment-on-pleadings': 'B',
  'motion-to-transfer-venue': 'B',
  'motion-to-change-venue': 'B',
  'motion-to-dismiss-simple': 'B',
  'motion-for-appointment-of-receiver': 'B',
  'motion-for-preliminary-approval-settlement': 'B',
  'motion-for-final-approval-settlement': 'B',
  'motion-for-attorneys-fees': 'B',
  'motion-for-costs': 'B',
  'motion-to-bifurcate': 'B',
  'motion-for-directed-verdict': 'B',
  'motion-to-reopen-discovery': 'B',
  'motion-to-intervene': 'B',
  'declinatory-exception': 'B',
  'dilatory-exception': 'B',
  'peremptory-exception-no-cause': 'B',
  'peremptory-exception-no-right': 'B',
  'peremptory-exception-prescription': 'B',
  'peremptory-exception-res-judicata': 'B',
  'exception-of-prematurity': 'B',
  'exception-of-vagueness': 'B',
  'demurrer-simple': 'B',
  'motion-to-strike-ca-ccp-435': 'B',
  'motion-for-judgment-on-pleadings-ca': 'B',
  'motion-to-dismiss-12b1': 'B',
  'motion-to-dismiss-12b2': 'B',
  'motion-to-dismiss-12b3': 'B',
  'motion-to-dismiss-12b4': 'B',
  'motion-to-dismiss-12b5': 'B',
  'motion-to-remand': 'B',
  'motion-for-abstention': 'B',
  'motion-for-more-definite-statement': 'B',
  'motion-for-summary-judgment-partial': 'B',
  // Tier C (10 motions)
  'motion-to-dismiss-12b6-complex': 'C',
  'demurrer-complex': 'C',
  'peremptory-exception-complex': 'C',
  'motion-for-writ-of-mandamus': 'C',
  'motion-for-writ-of-prohibition': 'C',
  'motion-for-writ-of-habeas-corpus': 'C',
  'anti-slapp-motion-simple': 'C',
  'motion-for-complex-case-determination': 'C',
  'motion-for-interlocutory-appeal': 'C',
  'motion-for-declaratory-judgment': 'C',
  // Tier D (9 motions)
  'motion-for-summary-judgment': 'D',
  'motion-for-summary-adjudication': 'D',
  'motion-for-partial-summary-judgment': 'D',
  'motion-for-class-certification': 'D',
  'motion-to-decertify-class': 'D',
  'motion-for-preliminary-injunction': 'D',
  'temporary-restraining-order': 'D',
  'daubert-sargent-motion': 'D',
  'anti-slapp-motion-complex': 'D',
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Calculate price synchronously. Pure function, no server dependencies.
 *
 * @param motionType - Motion slug (e.g. 'motion-for-summary-judgment')
 * @param rushType - Rush level
 * @param stateCode - Two-letter state code
 * @param overrideMultiplier - Jurisdiction pricing multiplier (default 1.0)
 * @returns Complete PriceBreakdown
 */
export function calculatePriceSync(
  motionType: string,
  rushType: RushType,
  stateCode: string,
  overrideMultiplier: number = 1.0
): PriceBreakdown {
  const tier = getTierForMotionSlug(motionType);
  const basePrice = TIER_BASE_PRICES[tier];
  const rushRate = RUSH_MULTIPLIERS[rushType] ?? 0;
  const rushFee = Math.round(basePrice * rushRate);
  const subtotal = Math.round((basePrice + rushFee) * overrideMultiplier);

  return {
    basePrice,
    rushFee,
    jurisdictionMultiplier: overrideMultiplier,
    subtotal,
    tier,
    stateCode: stateCode.toUpperCase(),
    currency: 'USD',
  };
}

/**
 * Get tier for a motion slug.
 * Returns 'B' as safe default for unknown slugs (most common tier).
 */
export function getTierForMotionSlug(slug: string): MotionTier {
  return MOTION_TIER_MAP[slug] || 'B';
}

/**
 * Get base price for a tier.
 */
export function getBasePriceForTier(tier: MotionTier): number {
  return TIER_BASE_PRICES[tier];
}

/**
 * Get all rush type options with their display labels.
 */
export function getRushOptions(): Array<{ id: RushType; label: string; multiplier: number }> {
  return [
    { id: 'standard', label: 'Standard', multiplier: 0 },
    { id: 'rush_72', label: 'Rush: 72 hours (+25%)', multiplier: 0.25 },
    { id: 'rush_24hr', label: 'Rush: 24 hours (+50%)', multiplier: 0.50 },
  ];
}
