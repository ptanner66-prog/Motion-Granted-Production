/**
 * Checkpoint Event Logger
 *
 * SP-3 Task 2 (D5 W2-2): Centralized, immutable audit logger for all
 * checkpoint lifecycle events.
 *
 * CRITICAL: Logging failures NEVER block checkpoint operations.
 * A failed audit log is recoverable (replay from Inngest event history);
 * a blocked CP3 approval is not.
 *
 * Depends on: SP-2 W1-1 (checkpoint_events table with REVOKE UPDATE/DELETE)
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface CheckpointEventInput {
  orderId: string;
  checkpointId?: string;   // For HOLD checkpoints
  packageId?: string;      // For CP3 operations
  eventType: string;
  actor: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an immutable checkpoint event to the audit log.
 *
 * Both checkpointId and packageId are optional:
 * - HOLD uses checkpointId
 * - CP3 uses packageId
 * - Never both
 *
 * Returns { id } on success, { id: 'LOGGING_FAILED' } on failure.
 * Caller proceeds normally regardless of logging outcome.
 */
export async function logCheckpointEvent(
  supabase: SupabaseClient,
  input: CheckpointEventInput
): Promise<{ id: string }> {
  try {
    const { data, error } = await supabase
      .from('checkpoint_events')
      .insert({
        order_id: input.orderId,
        checkpoint_id: input.checkpointId ?? null,
        package_id: input.packageId ?? null,
        event_type: input.eventType,
        actor: input.actor,
        metadata: input.metadata ?? {},
      })
      .select('id')
      .single();

    if (error) {
      console.error('[checkpoint-logger] Failed to write event:', {
        error: error.message,
        orderId: input.orderId,
        eventType: input.eventType,
      });
      return { id: 'LOGGING_FAILED' };
    }

    return { id: data.id };
  } catch (err) {
    console.error('[checkpoint-logger] Unexpected error:', err);
    return { id: 'LOGGING_FAILED' };
  }
}
