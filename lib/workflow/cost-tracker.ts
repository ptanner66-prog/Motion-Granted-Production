/**
 * Cost Tracker — D3 Task 14 + IV-005 + SP-12 AK-2/AK-5
 *
 * Records AI API costs per phase execution. Validates tier before INSERT.
 * Invalid or missing tiers are recorded as 'UNKNOWN' rather than rejected —
 * losing cost data is worse than having an imprecise tier.
 *
 * IV-005: Source tags distinguish primary vs retry cost.
 * Budget enforcement: primaryCost <= cap (soft), totalCost <= cap * 1.5 (hard).
 * If retry overhead > 20% of order total: fire admin alert.
 *
 * SP-12 AK-2: Per-cycle cost cap checks (A=$5, B=$35, C=$75, D=$125).
 * SP-12 AK-5: Order-level cost ceiling (per_cycle_cap × maxRevisionLoops × 1.5).
 *
 * The alert-unknown-tier Inngest cron (hourly) monitors for UNKNOWN entries.
 */

import { getServiceSupabase } from '@/lib/supabase/admin';
import { getCostCap } from '@/lib/config/cost-caps';
import { getTierConfig } from '@/lib/config/tier-config';

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

// ============================================================================
// SP-12 AK-2: PER-CYCLE COST CAP CHECKS
// ============================================================================

export interface CostTrackingResult {
  currentCycleCost: number;  // cents
  totalOrderCost: number;    // cents across all cycles
  cap: number;               // per-cycle cap in cents
  capExceeded: boolean;
  budgetRemaining: number;   // cents remaining in current cycle
}

/**
 * Check if the current cycle cost exceeds the per-cycle cap.
 * Binding: A=$5, B=$35, C=$75, D=$125
 *
 * @param currentCycleCost - Cost in cents for current revision cycle
 * @param tier - Motion tier (A, B, C, D)
 * @returns Whether cap is exceeded, the cap value, and remaining budget
 */
export function checkCostCap(
  currentCycleCost: number,
  tier: string
): { exceeded: boolean; cap: number; remaining: number } {
  const capDollars = getCostCap(tier);
  const capCents = capDollars * 100;

  return {
    exceeded: currentCycleCost >= capCents,
    cap: capCents,
    remaining: Math.max(0, capCents - currentCycleCost),
  };
}

/**
 * SP-9 Y-5 budget enforcement:
 *   primaryCost ≤ cap
 *   totalCost (primary + retry) ≤ cap × 1.5
 *
 * @param primaryCost - Primary (non-retry) cost in cents
 * @param retryCost - Retry cost in cents
 * @param tier - Motion tier
 */
export function checkBudgetEnforcement(
  primaryCost: number,
  retryCost: number,
  tier: string
): { primaryOk: boolean; totalOk: boolean; retryOverheadPercent: number } {
  const capDollars = getCostCap(tier);
  const capCents = capDollars * 100;

  const totalCost = primaryCost + retryCost;
  const retryOverheadPercent = primaryCost > 0 ? (retryCost / primaryCost) * 100 : 0;

  return {
    primaryOk: primaryCost <= capCents,
    totalOk: totalCost <= capCents * 1.5,
    retryOverheadPercent,
  };
}

// ============================================================================
// SP-12 AK-5: ORDER-LEVEL COST CEILING
// ============================================================================

/**
 * Get the order-level cost ceiling (across ALL cycles for one order).
 * Distinct from per-cycle cap (AK-2).
 * ceiling = per_cycle_cap × maxRevisionLoops × 1.5
 *
 * Check values:
 *   A = $5 × 2 × 1.5 = $15 ceiling
 *   B = $35 × 3 × 1.5 = $157.50 ceiling
 *   C = $75 × 3 × 1.5 = $337.50 ceiling
 *   D = $125 × 4 × 1.5 = $750 ceiling
 *
 * @param tier - Motion tier
 * @returns Order ceiling in cents
 */
export function getOrderCostCeiling(tier: string): number {
  const config = getTierConfig(tier);
  const perCycleCapDollars = getCostCap(tier);
  const perCycleCapCents = perCycleCapDollars * 100;
  return perCycleCapCents * config.maxRevisionLoops * 1.5;
}
