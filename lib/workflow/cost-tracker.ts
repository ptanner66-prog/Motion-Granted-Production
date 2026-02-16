/**
 * Cost Tracker — D3 Task 14
 *
 * Records AI API costs per phase execution. Validates tier before INSERT.
 * Invalid or missing tiers are recorded as 'UNKNOWN' rather than rejected —
 * losing cost data is worse than having an imprecise tier.
 *
 * The alert-unknown-tier Inngest cron (hourly) monitors for UNKNOWN entries.
 */

import { getServiceSupabase } from '@/lib/supabase/admin';

const VALID_TIERS = ['A', 'B', 'C', 'D'];

interface CostPayload {
  orderId: string;
  phase: string;
  model: string;
  tier?: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  metadata?: Record<string, unknown>;
}

/**
 * Record API cost for a phase execution.
 * Validates tier and falls back to 'UNKNOWN' if invalid/missing.
 */
export async function recordCost(payload: CostPayload): Promise<void> {
  const supabase = getServiceSupabase();

  // D3 Task 14: Validate tier before INSERT
  let tier = payload.tier;
  if (!tier || !VALID_TIERS.includes(tier)) {
    console.warn('[cost-tracker] Invalid or missing tier, using UNKNOWN', {
      orderId: payload.orderId,
      receivedTier: payload.tier,
      phase: payload.phase,
      model: payload.model,
    });
    tier = 'UNKNOWN';
  }

  const { error } = await supabase.from('cost_tracking').insert({
    order_id: payload.orderId,
    phase: payload.phase,
    model: payload.model,
    tier,
    input_tokens: payload.inputTokens,
    output_tokens: payload.outputTokens,
    total_cost: payload.totalCost,
    metadata: payload.metadata ?? {},
  });

  if (error) {
    console.error('[cost-tracker] Failed to record cost:', {
      orderId: payload.orderId,
      phase: payload.phase,
      error: error.message,
    });
    throw new Error(`Cost tracking INSERT failed: ${error.message}`);
  }
}

/**
 * Get total cost for an order across all phases.
 */
export async function getOrderTotalCost(orderId: string): Promise<number> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('cost_tracking')
    .select('total_cost')
    .eq('order_id', orderId);

  if (error) {
    console.error('[cost-tracker] Failed to get total cost:', error);
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + Number(row.total_cost || 0), 0);
}
