/**
 * Checkpoint Handlers — Cost Headroom Warning
 *
 * SP-4 Task 12 (D3 Task 17): Cost headroom check at CP3 entry.
 * Warns the attorney if remaining cost budget is low (<30%).
 *
 * CRITICAL: Cost queries MUST filter .eq('is_rework_reset', false)
 * per D4 Task D-5 binding rule.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getCostCap } from '@/lib/config/cost-caps';

/**
 * Calculate remaining cost headroom for an order.
 *
 * @returns headroomPct (0-100) and a warning string if < 30%.
 */
export async function getCostHeadroom(
  supabase: SupabaseClient,
  orderId: string,
  tier: string
): Promise<{ headroomPct: number; warning: string | null }> {
  const cap = getCostCap(tier);

  const { data } = await supabase
    .from('cost_tracking')
    .select('total_cost')
    .eq('order_id', orderId)
    .eq('is_rework_reset', false); // R4 CORRECTION

  const spent = (data ?? []).reduce(
    (sum: number, row: { total_cost: number | null }) => sum + (row.total_cost ?? 0),
    0
  );
  const headroomPct = cap > 0 ? Math.round(((cap - spent) / cap) * 100) : 0;

  const warning = headroomPct < 30
    ? `Only ${headroomPct}% of cost budget remains ($${(cap - spent).toFixed(2)} of $${cap}). Additional rework may exceed the cap.`
    : null;

  return { headroomPct, warning };
}
