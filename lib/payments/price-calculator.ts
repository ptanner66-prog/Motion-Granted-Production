/**
 * Price Calculator — Async server wrapper.
 *
 * SP-C Task 10 (Step 6.7) | BD-4: Server-only, fetches multiplier from DB.
 *
 * Imports calculatePriceSync from price-calculator-core.ts and wraps it
 * with async multiplier resolution from the database.
 *
 * @module payments/price-calculator
 */

import { calculatePriceSync, type PriceBreakdown, type RushType } from './price-calculator-core';
import { getJurisdictionMultiplier } from './jurisdiction-pricing';

/**
 * Calculate price with database-driven jurisdiction multiplier.
 *
 * @param motionType - Motion slug
 * @param rushType - Rush level
 * @param stateCode - Two-letter state code
 * @param overrideMultiplier - Optional: skip DB lookup and use this value
 * @returns PriceBreakdown
 */
export async function calculatePrice(
  motionType: string,
  rushType: RushType,
  stateCode: string,
  overrideMultiplier?: number
): Promise<PriceBreakdown> {
  const mult = overrideMultiplier ?? await getJurisdictionMultiplier(stateCode);
  return calculatePriceSync(motionType, rushType, stateCode, mult);
}

// Re-export core types for downstream consumers
export type { PriceBreakdown, RushType, MotionTier } from './price-calculator-core';
export { calculatePriceSync, getTierForMotionSlug, getBasePriceForTier, getRushOptions } from './price-calculator-core';
