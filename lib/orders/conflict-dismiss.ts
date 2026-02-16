/**
 * Conflict Dismiss Utility
 *
 * SP-4 Task 7 (DST-12): Log dismissed intake conflict warnings.
 *
 * When an attorney dismisses a conflict warning during order intake,
 * this function records the dismissal in conflict_matches (NOT conflict_events).
 *
 * CRITICAL: Table is conflict_matches — per CC-R3 Combined canonical.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ConflictDismissParams {
  orderId: string;
  matchedOrderId: string;
  matchScore: number;
  userId: string;
}

/**
 * Record a dismissed conflict match during intake.
 * Called when the attorney acknowledges and dismisses a conflict warning.
 */
export async function logDismissedConflict(
  supabase: SupabaseClient,
  params: ConflictDismissParams
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.from('conflict_matches').insert({
    order_id: params.orderId,
    matched_order_id: params.matchedOrderId,
    match_type: 'party_name_intake',
    similarity_score: params.matchScore,
    resolution: 'DISMISSED_BY_ATTORNEY',
    dismissed_at: new Date().toISOString(),
    dismissed_by: params.userId,
  });

  if (error) {
    console.error('[conflict-dismiss] Failed to log dismissed conflict:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}
