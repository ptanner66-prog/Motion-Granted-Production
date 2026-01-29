// lib/retention/delete-order.ts
// Order data deletion with anonymization
// Task 45 | Version 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import { anonymizeOrderForAnalytics } from './anonymize';
import { logActivity } from '@/lib/activity/activity-logger';

export type DeletionType = 'AUTO' | 'CUSTOMER_REQUESTED' | 'ADMIN';

export interface DeleteResult {
  success: boolean;
  error?: string;
  deleted_at?: string;
}

/**
 * Delete order data while preserving anonymized analytics
 *
 * Order of operations:
 * 1. Anonymize analytics data (BEFORE deletion)
 * 2. Delete storage files (uploads + deliverables)
 * 3. Delete related database records
 * 4. Soft-delete order (clear PII, retain metadata)
 */
export async function deleteOrderData(
  orderId: string,
  deletionType: DeletionType,
  actorUserId?: string
): Promise<DeleteResult> {
  const supabase = await createClient();
  const deletedAt = new Date().toISOString();

  console.log(`[Delete] Starting deletion for order ${orderId} (type: ${deletionType})`);

  try {
    // Step 1: Verify order exists and isn't already deleted
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, user_id, deleted_at')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.deleted_at) {
      return { success: false, error: 'Order already deleted' };
    }

    // Step 2: Anonymize analytics data BEFORE deletion
    try {
      await anonymizeOrderForAnalytics(orderId);
      console.log(`[Delete] Anonymized analytics for order ${orderId}`);
    } catch (anonError) {
      console.error(`[Delete] Anonymization failed for ${orderId}:`, anonError);
      // Continue with deletion even if anonymization fails
    }

    // Step 3: Delete uploaded documents from storage
    try {
      const { data: files } = await supabase.storage
        .from('order-documents')
        .list(orderId);

      if (files && files.length > 0) {
        const filePaths = files.map((f: { name: string }) => `${orderId}/${f.name}`);
        await supabase.storage.from('order-documents').remove(filePaths);
      }
    } catch (storageError) {
      console.warn(`[Delete] Could not delete uploads for ${orderId}:`, storageError);
    }

    // Step 4: Delete deliverables from storage
    try {
      const { data: deliverables } = await supabase.storage
        .from('deliverables')
        .list(orderId);

      if (deliverables && deliverables.length > 0) {
        const deliverablePaths = deliverables.map((f: { name: string }) => `${orderId}/${f.name}`);
        await supabase.storage.from('deliverables').remove(deliverablePaths);
      }
    } catch (storageError) {
      console.warn(`[Delete] Could not delete deliverables for ${orderId}:`, storageError);
    }

    // Step 5: Delete related database records
    const deletePromises = [
      supabase.from('order_documents').delete().eq('order_id', orderId),
      supabase.from('order_deliverables').delete().eq('order_id', orderId),
      supabase.from('phase_executions').delete().eq('order_id', orderId),
      supabase.from('citation_verifications').delete().eq('order_id', orderId),
      supabase.from('checkpoint_events').delete().eq('order_id', orderId),
    ];

    await Promise.allSettled(deletePromises);
    console.log(`[Delete] Deleted related records for order ${orderId}`);

    // Step 6: Soft-delete the order (clear PII, retain metadata)
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        deleted_at: deletedAt,
        deletion_type: deletionType,
        // Clear all PII fields
        case_number: '[DELETED]',
        party_names: null,
        opposing_party_name: null,
        statement_of_facts: null,
        drafting_instructions: null,
        court_name: null,
        judge_name: null,
        // Retain: id, user_id, motion_type, tier, timestamps
      })
      .eq('id', orderId);

    if (updateError) {
      console.error(`[Delete] Failed to soft-delete order ${orderId}:`, updateError);
      return { success: false, error: 'Failed to delete order' };
    }

    // Step 7: Log activity
    await logActivity({
      user_id: actorUserId || order.user_id,
      action: 'order.deleted',
      resource_type: 'order',
      resource_id: orderId,
      details: { deletion_type: deletionType },
    });

    console.log(`[Delete] Successfully deleted order ${orderId}`);

    return { success: true, deleted_at: deletedAt };
  } catch (error) {
    console.error(`[Delete] Unexpected error deleting order ${orderId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
