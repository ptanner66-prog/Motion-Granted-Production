/**
 * Jurisdiction Pricing — Database-driven pricing multipliers.
 *
 * SP-C Task 8 (Step 6.6) | BD-3: Database-driven from day one.
 *
 * Replaces all hardcoded multiplier maps. Multipliers come from
 * the states table with a 5-minute in-memory cache.
 *
 * @module payments/jurisdiction-pricing
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  multiplier: number;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the pricing multiplier for a state from the database.
 *
 * @param stateCode - Two-letter state code
 * @returns The pricing multiplier (e.g. 1.00, 1.20)
 */
export async function getJurisdictionMultiplier(stateCode: string): Promise<number> {
  const code = stateCode.toUpperCase().trim();

  // Check cache
  const cached = cache.get(code);
  if (cached && Date.now() < cached.expires) {
    return cached.multiplier;
  }

  // Fetch from database
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('states')
    .select('pricing_multiplier')
    .eq('code', code)
    .single();

  if (error || !data) {
    // Default to 1.0 on lookup failure — never block checkout
    const fallback = 1.0;
    cache.set(code, { multiplier: fallback, expires: Date.now() + CACHE_TTL });
    return fallback;
  }

  const mult = Number(data.pricing_multiplier) || 1.0;
  cache.set(code, { multiplier: mult, expires: Date.now() + CACHE_TTL });
  return mult;
}

/**
 * Clear the pricing cache. Call after admin updates pricing multipliers.
 */
export function clearPricingCache(): void {
  cache.clear();
}

/**
 * Get all state multipliers (for admin display).
 */
export async function getAllMultipliers(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('states')
    .select('code, pricing_multiplier');

  const result: Record<string, number> = {};
  if (data) {
    for (const row of data) {
      result[row.code] = Number(row.pricing_multiplier) || 1.0;
    }
  }
  return result;
}
