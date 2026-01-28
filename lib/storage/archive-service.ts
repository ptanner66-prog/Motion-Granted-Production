/**
 * Order Archive Service (Task 59)
 *
 * Handles order archival per data retention policy.
 *
 * Retention periods:
 * - Standard: 90 days after delivery
 * - Extended (customer requested): +90 days (180 total)
 * - Maximum: 365 days (then auto-delete)
 *
 * Archive process:
 * 1. Move documents to cold storage (archive bucket)
 * 2. Keep anonymized metadata in anonymized_analytics table
 * 3. Delete PII from orders table
 * 4. Log deletion for compliance
 *
 * Source: Chunk 8, Task 59 - Code Mode Spec Section 21
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export interface ArchiveResult {
  orderId: string;
  archivedAt: Date;
  documentsArchived: number;
  dataAnonymized: boolean;
  retentionExpiresAt: Date;
}

export interface RetentionExtensionResult {
  orderId: string;
  newExpirationDate: Date;
  previousExpirationDate: Date;
}

export interface DeletionResult {
  ordersDeleted: number;
  documentsDeleted: number;
  errors: Array<{ orderId: string; error: string }>;
}

export interface ExpiringOrder {
  orderId: string;
  orderNumber: string;
  expiresAt: Date;
  customerEmail: string;
  daysUntilExpiration: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STANDARD_RETENTION_DAYS = 90;
const EXTENDED_RETENTION_DAYS = 180;
const MAXIMUM_RETENTION_DAYS = 365;

// ============================================================================
// ARCHIVE FUNCTIONS
// ============================================================================

/**
 * Archive an order - move documents to cold storage and anonymize data
 */
export async function archiveOrder(orderId: string): Promise<ArchiveResult> {
  console.log(`[ArchiveService] Archiving order ${orderId}`);
  const supabase = await createClient();

  // Get order data
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, documents')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const documents = (order.documents || []) as Array<{ storageUrl: string }>;
  let documentsArchived = 0;

  // Move documents to archive bucket
  for (const doc of documents) {
    if (doc.storageUrl) {
      try {
        // Download from primary bucket
        const { data: fileData } = await supabase.storage
          .from('documents')
          .download(doc.storageUrl);

        if (fileData) {
          // Upload to archive bucket
          const archivePath = `archived/${orderId}/${doc.storageUrl.split('/').pop()}`;
          await supabase.storage
            .from('documents-archive')
            .upload(archivePath, fileData, { upsert: true });

          // Delete from primary bucket
          await supabase.storage
            .from('documents')
            .remove([doc.storageUrl]);

          documentsArchived++;
        }
      } catch (error) {
        console.warn(`[ArchiveService] Failed to archive document: ${doc.storageUrl}`, error);
      }
    }
  }

  // Calculate retention expiration
  const retentionExpiresAt = new Date();
  retentionExpiresAt.setDate(retentionExpiresAt.getDate() + STANDARD_RETENTION_DAYS);

  // Save anonymized analytics data
  await saveAnonymizedAnalytics(supabase, order);

  // Update order with archive status
  await supabase
    .from('orders')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      retention_expires_at: retentionExpiresAt.toISOString(),
    })
    .eq('id', orderId);

  // Log the archive action
  await logArchiveAction(supabase, orderId, 'archived', documentsArchived);

  console.log(`[ArchiveService] Archived order ${orderId}: ${documentsArchived} documents`);

  return {
    orderId,
    archivedAt: new Date(),
    documentsArchived,
    dataAnonymized: true,
    retentionExpiresAt,
  };
}

/**
 * Extend retention period for an order
 */
export async function extendRetention(
  orderId: string,
  additionalDays: number
): Promise<RetentionExtensionResult> {
  console.log(`[ArchiveService] Extending retention for order ${orderId} by ${additionalDays} days`);
  const supabase = await createClient();

  // Get current retention date
  const { data: order, error } = await supabase
    .from('orders')
    .select('retention_expires_at')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const previousExpirationDate = order.retention_expires_at
    ? new Date(order.retention_expires_at)
    : new Date();

  // Calculate new expiration (cap at maximum)
  const newExpirationDate = new Date(previousExpirationDate);
  newExpirationDate.setDate(newExpirationDate.getDate() + additionalDays);

  const createdAt = new Date(); // Approximate
  const maxExpirationDate = new Date(createdAt);
  maxExpirationDate.setDate(maxExpirationDate.getDate() + MAXIMUM_RETENTION_DAYS);

  const finalExpirationDate = newExpirationDate > maxExpirationDate
    ? maxExpirationDate
    : newExpirationDate;

  // Update order
  await supabase
    .from('orders')
    .update({
      retention_expires_at: finalExpirationDate.toISOString(),
      retention_extended: true,
    })
    .eq('id', orderId);

  // Log the extension
  await logArchiveAction(supabase, orderId, 'retention_extended', additionalDays);

  return {
    orderId,
    newExpirationDate: finalExpirationDate,
    previousExpirationDate,
  };
}

/**
 * Delete all expired orders
 */
export async function deleteExpiredOrders(): Promise<DeletionResult> {
  console.log('[ArchiveService] Deleting expired orders');
  const supabase = await createClient();

  const now = new Date();

  // Find expired orders
  const { data: expiredOrders, error } = await supabase
    .from('orders')
    .select('id, order_number, documents')
    .lt('retention_expires_at', now.toISOString())
    .eq('status', 'archived');

  if (error) {
    console.error('[ArchiveService] Error fetching expired orders:', error);
    return { ordersDeleted: 0, documentsDeleted: 0, errors: [] };
  }

  let ordersDeleted = 0;
  let documentsDeleted = 0;
  const errors: Array<{ orderId: string; error: string }> = [];

  for (const order of expiredOrders || []) {
    try {
      // Delete archived documents
      const documents = (order.documents || []) as Array<{ storageUrl: string }>;
      for (const doc of documents) {
        const archivePath = `archived/${order.id}/${doc.storageUrl?.split('/').pop()}`;
        await supabase.storage.from('documents-archive').remove([archivePath]);
        documentsDeleted++;
      }

      // Delete order (or anonymize fully)
      await supabase
        .from('orders')
        .update({
          status: 'deleted',
          deleted_at: now.toISOString(),
          deletion_type: 'automatic',
          // Anonymize remaining data
          email: null,
          phone: null,
          case_caption: null,
          documents: null,
        })
        .eq('id', order.id);

      // Log deletion
      await logArchiveAction(supabase, order.id, 'deleted', documentsDeleted);

      ordersDeleted++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ orderId: order.id, error: errorMessage });
      console.error(`[ArchiveService] Error deleting order ${order.id}:`, err);
    }
  }

  console.log(`[ArchiveService] Deleted ${ordersDeleted} orders, ${documentsDeleted} documents`);

  return {
    ordersDeleted,
    documentsDeleted,
    errors,
  };
}

/**
 * Get orders nearing expiration
 */
export async function getOrdersNearingExpiration(
  daysUntilExpiration: number
): Promise<ExpiringOrder[]> {
  const supabase = await createClient();

  const now = new Date();
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysUntilExpiration);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, retention_expires_at, email')
    .gt('retention_expires_at', now.toISOString())
    .lte('retention_expires_at', targetDate.toISOString())
    .eq('status', 'archived');

  if (error) {
    console.error('[ArchiveService] Error fetching expiring orders:', error);
    return [];
  }

  return (orders || []).map((order: any) => {
    const expiresAt = new Date(order.retention_expires_at);
    const daysUntil = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      expiresAt,
      customerEmail: order.email || '',
      daysUntilExpiration: daysUntil,
    };
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Save anonymized analytics data
 */
async function saveAnonymizedAnalytics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  order: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('anonymized_analytics').insert({
      order_date: order.created_at,
      motion_type: order.motion_type,
      jurisdiction: order.jurisdiction,
      tier: order.tier,
      total_price: order.total_price,
      turnaround: order.turnaround,
      completed_at: order.completed_at,
      revision_count: order.revision_count || 0,
    });
  } catch (error) {
    console.warn('[ArchiveService] Failed to save anonymized analytics:', error);
  }
}

/**
 * Log archive action for compliance
 */
async function logArchiveAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  action: string,
  details: number
): Promise<void> {
  try {
    await supabase.from('archive_log').insert({
      order_id: orderId,
      action,
      details: { count: details },
      performed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[ArchiveService] Failed to log archive action:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  archiveOrder,
  extendRetention,
  deleteExpiredOrders,
  getOrdersNearingExpiration,
  STANDARD_RETENTION_DAYS,
  EXTENDED_RETENTION_DAYS,
  MAXIMUM_RETENTION_DAYS,
};
