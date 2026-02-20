// lib/conflicts/resolve.ts
// Conflict resolution functions
// VERSION: 1.0.0

import { getServiceSupabase } from '@/lib/supabase/admin';
import type { ConflictMatch } from './types';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('conflicts-resolve');
/**
 * Mark a conflict as resolved
 */
export async function resolveConflict(
  conflictId: string,
  resolvedBy: string,
  resolutionNote: string
): Promise<ConflictMatch | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('conflict_matches')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_note: resolutionNote
    })
    .eq('id', conflictId)
    .select()
    .single();

  if (error) {
    log.error('Failed to resolve conflict:', error);
    return null;
  }

  return data as ConflictMatch;
}

/**
 * Get all unresolved conflicts for an order
 */
export async function getUnresolvedConflicts(orderId: string): Promise<ConflictMatch[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('conflict_matches')
    .select('*')
    .eq('current_order_id', orderId)
    .eq('resolved', false)
    .order('severity', { ascending: true });  // BLOCKING first

  if (error) {
    log.error('Failed to fetch conflicts:', error);
    return [];
  }

  return data as ConflictMatch[];
}

/**
 * Get conflict history for an attorney
 */
export async function getAttorneyConflictHistory(
  attorneyId: string,
  limit: number = 50
): Promise<ConflictMatch[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('conflict_matches')
    .select('*')
    .eq('current_attorney_id', attorneyId)
    .order('detected_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Failed to fetch attorney conflict history:', error);
    return [];
  }

  return data as ConflictMatch[];
}

/**
 * Check if order has blocking conflicts
 */
export async function hasBlockingConflicts(orderId: string): Promise<boolean> {
  const supabase = getServiceSupabase();

  const { count, error } = await supabase
    .from('conflict_matches')
    .select('*', { count: 'exact', head: true })
    .eq('current_order_id', orderId)
    .eq('severity', 'BLOCKING')
    .eq('resolved', false);

  if (error) {
    // T-88: FAIL CLOSED — infrastructure failure = treat as potential conflict.
    // Admin will see the order in conflict review queue and can clear it manually.
    log.error('[CONFLICT-CHECK] Infrastructure failure — FAILING CLOSED', {
      error: error.message,
      orderId,
    });
    return true;
  }

  return (count || 0) > 0;
}
