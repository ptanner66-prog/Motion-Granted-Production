/**
 * Protocol 7 Cumulative Failure Counter — Motion Granted
 *
 * SP-12 AJ-5 | P0 | v5-XDC-024
 *
 * CUMULATIVE scope — queries by order_id, NOT by phase.
 * D9-004 (per-phase) is DEAD. D9-015 (cumulative) is BINDING.
 *
 * Protocol 7 triggers when cumulative citation failures across ALL phases
 * reach the tier-specific failure limit. This prevents low-quality
 * work products from continuing through the pipeline.
 *
 * Binding thresholds (02/15/26 R3):
 *   A: 3 failures / 5 total
 *   B: 5 failures / 8 total
 *   C: 7 failures / 12 total
 *   D: 7 failures / 12 total
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Binding thresholds (02/15/26 R3):
const P7_THRESHOLDS: Record<string, { failureLimit: number; totalLimit: number }> = {
  A: { failureLimit: 3, totalLimit: 5 },
  B: { failureLimit: 5, totalLimit: 8 },
  C: { failureLimit: 7, totalLimit: 12 },
  D: { failureLimit: 7, totalLimit: 12 },
};

export interface Protocol7Result {
  triggered: boolean;
  failureCount: number;
  totalCount: number;
  threshold: { failureLimit: number; totalLimit: number };
  tier: string;
}

/**
 * Check Protocol 7 cumulative citation failure threshold.
 *
 * [v5-XDC-024] CUMULATIVE query — by order_id only, NO phase filter.
 *
 * @param orderId - Order to check
 * @param tier - Motion tier (A, B, C, D)
 * @param supabase - Supabase client (service role)
 * @returns Protocol7Result indicating whether P7 is triggered
 */
export async function checkProtocol7(
  orderId: string,
  tier: string,
  supabase: SupabaseClient
): Promise<Protocol7Result> {
  const threshold = P7_THRESHOLDS[tier.toUpperCase()];
  if (!threshold) {
    throw new Error(`Unknown tier for Protocol 7: ${tier}`);
  }

  // CUMULATIVE query — by order_id only, NO phase filter
  // [v5-XDC-024] This is the BINDING query pattern
  const { count: failureCount } = await supabase
    .from('citation_verifications')
    .select('*', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('removed_in_revision', false)  // Exclude citations removed during revision
    .eq('overall_status', 'FAILED');

  const { count: totalCount } = await supabase
    .from('citation_verifications')
    .select('*', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('removed_in_revision', false);

  const failures = failureCount ?? 0;
  const total = totalCount ?? 0;

  // P7 triggers when failures reach the limit for the tier
  const triggered = failures >= threshold.failureLimit;

  return {
    triggered,
    failureCount: failures,
    totalCount: total,
    threshold,
    tier,
  };
}

/**
 * Get Protocol 7 thresholds for a tier.
 */
export function getP7Thresholds(tier: string): { failureLimit: number; totalLimit: number } {
  const threshold = P7_THRESHOLDS[tier.toUpperCase()];
  if (!threshold) {
    throw new Error(`Unknown tier for Protocol 7: ${tier}`);
  }
  return threshold;
}
