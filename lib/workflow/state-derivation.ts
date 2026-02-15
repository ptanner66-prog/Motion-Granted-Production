/**
 * Phase I State Derivation Utility
 *
 * SP-C Task 19 (Step 7.14a / Gap 45)
 *
 * When Phase I encounters an order with NULL state field,
 * this utility derives state from the legacy jurisdiction field
 * and writes the derived values back to the database.
 *
 * COLLISION: This is a standalone utility — does NOT modify phase-executors.ts (SP-A owns that).
 *
 * @module workflow/state-derivation
 */

import { createClient } from '@/lib/supabase/server';
import { resolveFromOrder, deriveFederalCircuit, type ResolvedJurisdiction } from '@/lib/jurisdiction/resolver';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-state-derivation');

export interface DerivedState {
  state: string;
  court_type: 'STATE' | 'FEDERAL';
  federal_district: string | null;
  pricing_multiplier_applied: number;
  resolved: ResolvedJurisdiction;
}

/**
 * Derive state from an order's legacy jurisdiction field.
 * Called by Phase I when order.state is NULL.
 *
 * @param orderId - The order UUID
 * @returns The derived state data, or null if already populated
 */
export async function deriveAndWriteState(orderId: string): Promise<DerivedState | null> {
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, state, jurisdiction, court_type, federal_district')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    log.error(`[StateDerivation] Order not found: ${orderId}`, { error });
    return null;
  }

  // Already populated — no derivation needed
  if (order.state) {
    log.info(`[StateDerivation] Order ${orderId} already has state=${order.state}`);
    const resolved = resolveFromOrder(order);
    return {
      state: order.state,
      court_type: (order.court_type || resolved.courtType) as 'STATE' | 'FEDERAL',
      federal_district: order.federal_district || null,
      pricing_multiplier_applied: 1.0,
      resolved,
    };
  }

  // Derive from legacy jurisdiction
  const resolved = resolveFromOrder(order);
  const federalCircuit = resolved.federalCircuit || deriveFederalCircuit(resolved.stateCode);

  // Fetch pricing multiplier from states table
  const { data: stateData } = await supabase
    .from('states')
    .select('pricing_multiplier')
    .eq('code', resolved.stateCode)
    .single();

  const multiplier = stateData?.pricing_multiplier ? Number(stateData.pricing_multiplier) : 1.0;

  const derived: DerivedState = {
    state: resolved.stateCode,
    court_type: resolved.courtType,
    federal_district: resolved.federalDistrict || null,
    pricing_multiplier_applied: multiplier,
    resolved,
  };

  // Write back to database
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      state: derived.state,
      court_type: derived.court_type,
      federal_district: derived.federal_district,
      pricing_multiplier_applied: derived.pricing_multiplier_applied,
    })
    .eq('id', orderId);

  if (updateError) {
    log.error(`[StateDerivation] Failed to write state for order ${orderId}:`, { updateError });
  } else {
    log.info(`[StateDerivation] Derived state for order ${orderId}: ${derived.state} (${derived.court_type})`, {
      federalCircuit,
      jurisdiction: order.jurisdiction,
    });
  }

  return derived;
}
