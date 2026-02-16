// ============================================================
// lib/workflow/resolve-cp3.ts
// CP3 Resolution — Attorney (NOT admin) per R2v2 BD-4
// Source: D9 C-5 | SP-13 AO-5
//
// R2v2 Binding Decision 4: The CP3 actor is the attorney, not an admin.
// All function parameters and DB writes use actorId + actor_type.
// ============================================================

import { createLogger } from '../logging/logger';
import { getServiceSupabase } from '../supabase/admin';
import { logCheckpointEvent } from './checkpoint-logger';
import { cancelCP3Timeouts } from './cp3-timeouts';
import {
  CP3_REWORK_CAP,
  type CP3Action,
} from './checkpoint-types';

// Checkpoint event types for audit logging (CP3-specific)
const CP3_EVENTS = {
  APPROVED: 'CP3_APPROVED',
  REJECTED: 'CP3_REJECTED',
  CANCELLED: 'CP3_CANCELLED',
} as const;

const logger = createLogger('resolve-cp3');

export interface CP3Resolution {
  success: boolean;
  action: CP3Action;
  protocol10Triggered: boolean;
  error?: string;
}

/**
 * Resolve CP3 checkpoint — attorney action (NOT admin per R2v2 BD-4).
 *
 * @param orderId - Order UUID
 * @param packageId - Delivery package UUID (was checkpointId in prior spec)
 * @param action - Attorney decision: APPROVE, REQUEST_CHANGES, or CANCEL
 * @param actorId - Attorney's auth.users UUID (was adminId — corrected per BD-4)
 * @param notes - Attorney notes (was adminComments)
 */
export async function resolveCP3(
  orderId: string,
  packageId: string,
  action: CP3Action,
  actorId: string,
  notes?: string
): Promise<CP3Resolution> {
  const supabase = getServiceSupabase();

  logger.info('cp3.resolution.started', {
    orderId,
    packageId,
    action,
  });

  try {
    // Cancel timeout reminders regardless of action
    await cancelCP3Timeouts(supabase, orderId);

    switch (action) {
      case 'APPROVE': {
        // Mark order as completed
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            status: 'completed',
            cp3_entered_at: null,
          })
          .eq('id', orderId);

        if (updateError) throw updateError;

        await logCheckpointEvent(supabase, {
          orderId,
          packageId,
          eventType: CP3_EVENTS.APPROVED,
          actor: 'attorney',
          metadata: { actorId, notes },
        });

        return { success: true, action: 'APPROVE', protocol10Triggered: false };
      }

      case 'REQUEST_CHANGES': {
        // Get current rework count
        const { data: order, error: fetchError } = await supabase
          .from('orders')
          .select('attorney_rework_count')
          .eq('id', orderId)
          .single();

        if (fetchError || !order) throw fetchError || new Error('Order not found');

        const currentCount = order.attorney_rework_count ?? 0;
        const newCount = currentCount + 1;

        // Check if at rework cap
        if (newCount > CP3_REWORK_CAP) {
          // Cap exceeded — trigger Protocol 10
          const { error: p10Error } = await supabase
            .from('orders')
            .update({
              protocol_10_triggered: true,
              attorney_rework_count: newCount,
            })
            .eq('id', orderId);

          if (p10Error) throw p10Error;

          await logCheckpointEvent(supabase, {
            orderId,
            packageId,
            eventType: CP3_EVENTS.REJECTED,
            actor: 'attorney',
            metadata: { actorId, notes, reworkCount: newCount, protocol10Triggered: true },
          });

          // Record rejection
          await supabase.from('cp3_rejections').insert({
            order_id: orderId,
            package_id: packageId,
            actor_id: actorId,
            actor_type: 'attorney',
            change_notes: notes,
            rejection_number: newCount,
          });

          return { success: true, action: 'REQUEST_CHANGES', protocol10Triggered: true };
        }

        // Normal rework — increment counter and route back
        const { error: reworkError } = await supabase
          .from('orders')
          .update({
            attorney_rework_count: newCount,
            cp3_change_notes: parseAttorneyNotes(notes),
            status: 'in_progress',
            cp3_entered_at: null,
          })
          .eq('id', orderId);

        if (reworkError) throw reworkError;

        await logCheckpointEvent(supabase, {
          orderId,
          packageId,
          eventType: CP3_EVENTS.REJECTED,
          actor: 'attorney',
          metadata: { actorId, notes, reworkCount: newCount },
        });

        // Record rejection
        await supabase.from('cp3_rejections').insert({
          order_id: orderId,
          package_id: packageId,
          actor_id: actorId,
          actor_type: 'attorney',
          change_notes: notes,
          rejection_number: newCount,
        });

        return { success: true, action: 'REQUEST_CHANGES', protocol10Triggered: false };
      }

      case 'CANCEL': {
        const { error: cancelError } = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancellation_type: 'CP3_CANCEL',
            cp3_entered_at: null,
          })
          .eq('id', orderId);

        if (cancelError) throw cancelError;

        await logCheckpointEvent(supabase, {
          orderId,
          packageId,
          eventType: CP3_EVENTS.CANCELLED,
          actor: 'attorney',
          metadata: { actorId, notes },
        });

        return { success: true, action: 'CANCEL', protocol10Triggered: false };
      }

      default:
        return { success: false, action, protocol10Triggered: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('cp3.resolution.failed', {
      orderId,
      action,
      error: errorMessage,
    });
    return { success: false, action, protocol10Triggered: false, error: errorMessage };
  }
}

/**
 * Parse attorney notes for injection into Phase VII context.
 * Strips any potential injection attempts while preserving useful feedback.
 */
function parseAttorneyNotes(notes?: string): string {
  if (!notes) return '';
  // Basic sanitization: trim, limit length, strip control characters
  return notes
    .trim()
    .slice(0, 5000) // Max 5000 chars for notes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Strip control chars
}
