/**
 * Cost Tracker — D3 Task 14 + IV-005
 *
 * Records AI API costs per phase execution. Validates tier before INSERT.
 * Invalid or missing tiers are recorded as 'UNKNOWN' rather than rejected —
 * losing cost data is worse than having an imprecise tier.
 *
 * IV-005: Source tags distinguish primary vs retry cost.
 * Budget enforcement: primaryCost <= cap (soft), totalCost <= cap * 1.5 (hard).
 * If retry overhead > 20% of order total: fire admin alert.
 *
 * The alert-unknown-tier Inngest cron (hourly) monitors for UNKNOWN entries.
 */

import { getServiceSupabase } from '@/lib/supabase/admin';

const VALID_TIERS = ['A', 'B', 'C', 'D'];

// IV-005: Track primary vs retry cost
export type CostSource = 'primary' | 'retry';

interface CostPayload {
  orderId: string;
  phase: string;
  model: string;
  tier?: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  source?: CostSource;    // IV-005: primary or retry
  attempt?: number;       // IV-005: Inngest attempt number
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

  // IV-005: Include source tag in metadata for cost attribution
  const costMetadata = {
    ...(payload.metadata ?? {}),
    source: payload.source ?? 'primary',
    ...(payload.attempt !== undefined ? { attempt: payload.attempt } : {}),
  };

  const { error } = await supabase.from('cost_tracking').insert({
    order_id: payload.orderId,
    phase: payload.phase,
    model: payload.model,
    tier,
    input_tokens: payload.inputTokens,
    output_tokens: payload.outputTokens,
    total_cost: payload.totalCost,
    metadata: costMetadata,
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

/**
 * IV-005: Get cost breakdown by source (primary vs retry).
 * Used for budget enforcement and retry overhead monitoring.
 */
export async function getOrderCostBySource(orderId: string): Promise<{
  primaryCost: number;
  retryCost: number;
  totalCost: number;
  retryOverheadPercent: number;
}> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('cost_tracking')
    .select('total_cost, metadata')
    .eq('order_id', orderId);

  if (error) {
    console.error('[cost-tracker] Failed to get cost by source:', error);
    return { primaryCost: 0, retryCost: 0, totalCost: 0, retryOverheadPercent: 0 };
  }

  let primaryCost = 0;
  let retryCost = 0;

  for (const row of data ?? []) {
    const cost = Number(row.total_cost || 0);
    const meta = row.metadata as Record<string, unknown> | null;
    if (meta?.source === 'retry') {
      retryCost += cost;
    } else {
      primaryCost += cost;
    }
  }

  const totalCost = primaryCost + retryCost;
  const retryOverheadPercent = totalCost > 0 ? (retryCost / totalCost) * 100 : 0;

  return { primaryCost, retryCost, totalCost, retryOverheadPercent };
}
