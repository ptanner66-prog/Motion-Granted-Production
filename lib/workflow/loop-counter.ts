/**
 * Loop Counter — Cost Cap Exit + Sub-loop Cost Tracking
 *
 * SP-4 Tasks 10+13 (D3 Tasks 6+13):
 *   - recordCostCapExit(): Records COST_CAP_EXCEEDED loop source entry
 *   - checkSubLoopCostCap(): Checks if sub-loop AI cost exceeds tier cap
 *   - triggerProtocol10(): Idempotent Protocol 10 trigger with cost-cap disclosure
 *
 * CRITICAL: All cost queries MUST filter .eq('is_rework_reset', false)
 * per D4 Task D-5 binding rule.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { LoopTrigger } from '@/lib/types/shared-interfaces';
import { getCostCap } from '@/lib/config/cost-caps';

/**
 * Record a COST_CAP_EXCEEDED loop source entry.
 * Called when a sub-loop's AI cost exceeds the tier cap.
 */
export async function recordCostCapExit(
  supabase: SupabaseClient,
  orderId: string,
  phase: string,
  tier: string,
  totalCost: number
): Promise<void> {
  const trigger: LoopTrigger = 'COST_CAP_EXCEEDED';
  await supabase.from('loop_sources').insert({
    order_id: orderId,
    phase,
    trigger,
    metadata: { tier, totalCost, cap: getCostCap(tier) },
  });
}

/**
 * Check sub-loop cost cap.
 * MUST filter is_rework_reset = false per D4 Task D-5.
 *
 * @returns Whether the cap is exceeded, current total, and the cap value.
 */
export async function checkSubLoopCostCap(
  supabase: SupabaseClient,
  orderId: string,
  tier: string
): Promise<{ exceeded: boolean; totalCost: number; cap: number }> {
  const cap = getCostCap(tier);

  const { data } = await supabase
    .from('cost_tracking')
    .select('total_cost')
    .eq('order_id', orderId)
    .eq('is_rework_reset', false); // R4 CORRECTION: exclude reset rows

  const totalCost = (data ?? []).reduce(
    (sum: number, row: { total_cost: number | null }) => sum + (row.total_cost ?? 0),
    0
  );

  return { exceeded: totalCost >= cap, totalCost, cap };
}

/**
 * Idempotent Protocol 10 trigger.
 * D3 Task 13: Only fires once per order (checks protocol_10_triggered flag).
 *
 * Protocol 10 is the cost-cap exit path: when AI costs exceed the tier cap,
 * the workflow exits the sub-loop and proceeds to final assembly with a
 * cost-cap disclosure notice.
 */
export async function triggerProtocol10(
  supabase: SupabaseClient,
  orderId: string,
  phase: string,
  tier: string,
  totalCost: number
): Promise<{ triggered: boolean; alreadyTriggered: boolean }> {
  // Idempotency check: only trigger once per order
  const { data: order } = await supabase
    .from('orders')
    .select('protocol_10_triggered')
    .eq('id', orderId)
    .single();

  if (order?.protocol_10_triggered) {
    return { triggered: false, alreadyTriggered: true };
  }

  // Set the flag atomically
  const { data: updated, error } = await supabase
    .from('orders')
    .update({ protocol_10_triggered: true })
    .match({ id: orderId, protocol_10_triggered: false })
    .select('id')
    .single();

  if (error || !updated) {
    // Another process set the flag first
    return { triggered: false, alreadyTriggered: true };
  }

  // Record cost cap exit in loop_sources
  await recordCostCapExit(supabase, orderId, phase, tier, totalCost);

  console.info(
    `[protocol-10] Triggered for order ${orderId}: tier=${tier}, cost=$${totalCost.toFixed(2)}, cap=$${getCostCap(tier)}`
  );

  return { triggered: true, alreadyTriggered: false };
}
