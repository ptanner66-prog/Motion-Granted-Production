// lib/retention/retention-service.ts
// Core retention management functions
// Tasks 43-45 | Version 1.0 — January 28, 2026

import { getServiceSupabase } from '@/lib/supabase/admin';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('retention-retention-service');
const DEFAULT_RETENTION_DAYS = 365; // ST-001: CCP §340.6 — 1-year malpractice discovery statute
const MAX_RETENTION_DAYS = 730; // 2 years hard cap
const REMINDER_DAYS_BEFORE = 14;

/**
 * ST6-01: Only terminal states are safe to delete or send deletion reminders.
 * Any order in a non-terminal state is actively being processed
 * or awaiting user action and MUST NOT be auto-deleted.
 */
export const DELETABLE_STATUSES = [
  'COMPLETED', 'CANCELLED', 'CANCELLED_USER', 'CANCELLED_SYSTEM',
  'CANCELLED_CONFLICT', 'REFUNDED',
] as const;

export interface RetentionStatus {
  retention_expires_at: string | null;
  days_remaining: number | null;
  can_extend: boolean;
  max_extension_date: string;
  extended_by_customer: boolean;
  deletion_reminder_sent: boolean;
  is_deleted: boolean;
}

export interface RetentionExtendResult {
  success: boolean;
  error?: string;
  retention_expires_at?: string;
  days_remaining?: number;
}

/**
 * Get retention status for an order
 */
export async function getRetentionStatus(orderId: string): Promise<RetentionStatus | null> {
  const supabase = getServiceSupabase();

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      delivered_at,
      retention_expires_at,
      retention_extended_by_customer,
      deletion_reminder_sent,
      deleted_at
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return null;
  }

  if (order.deleted_at) {
    return {
      retention_expires_at: null,
      days_remaining: null,
      can_extend: false,
      max_extension_date: '',
      extended_by_customer: false,
      deletion_reminder_sent: false,
      is_deleted: true,
    };
  }

  const now = new Date();
  const expiresAt = order.retention_expires_at ? new Date(order.retention_expires_at) : null;
  const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : new Date();

  // Calculate max extension date (2 years from delivery)
  const maxDate = new Date(deliveredAt.getTime() + MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Calculate days remaining
  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  // Can extend if not already at max
  const canExtend = expiresAt ? expiresAt < maxDate : true;

  return {
    retention_expires_at: order.retention_expires_at,
    days_remaining: daysRemaining,
    can_extend: canExtend,
    max_extension_date: maxDate.toISOString(),
    extended_by_customer: order.retention_extended_by_customer || false,
    deletion_reminder_sent: order.deletion_reminder_sent || false,
    is_deleted: false,
  };
}

/**
 * Set initial retention date on order delivery
 */
export async function setInitialRetention(orderId: string): Promise<void> {
  const supabase = getServiceSupabase();

  const deliveredAt = new Date();
  const expiresAt = new Date(deliveredAt);
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_RETENTION_DAYS);

  const { error } = await supabase
    .from('orders')
    .update({
      delivered_at: deliveredAt.toISOString(),
      retention_expires_at: expiresAt.toISOString(),
      retention_extended_by_customer: false,
      deletion_reminder_sent: false,
    })
    .eq('id', orderId);

  if (error) {
    log.error(`[Retention] Failed to set initial retention for ${orderId}:`, error);
    throw error;
  }

  log.info(`[Retention] Set retention for order ${orderId}: expires ${expiresAt.toISOString()}`);
}

/**
 * Extend retention for an order
 */
export async function extendRetention(
  orderId: string,
  newExpirationDate: Date
): Promise<RetentionExtendResult> {
  const supabase = getServiceSupabase();

  // Get order
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('delivered_at, deleted_at, retention_expires_at')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    return { success: false, error: 'Order not found' };
  }

  if (order.deleted_at) {
    return { success: false, error: 'Order has already been deleted' };
  }

  // Calculate max allowed date (2 years from delivery)
  const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : new Date();
  const maxDate = new Date(deliveredAt.getTime() + MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Enforce hard cap
  const finalDate = newExpirationDate > maxDate ? maxDate : newExpirationDate;

  // Don't allow extending to past
  if (finalDate < new Date()) {
    return { success: false, error: 'Cannot set expiration date in the past' };
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      retention_expires_at: finalDate.toISOString(),
      retention_extended_by_customer: true,
      retention_extension_date: new Date().toISOString(),
      deletion_reminder_sent: false,
      deletion_reminder_sent_at: null,
    })
    .eq('id', orderId);

  if (updateError) {
    log.error(`[Retention] Failed to extend retention for ${orderId}:`, updateError);
    return { success: false, error: 'Failed to update retention' };
  }

  const daysRemaining = Math.ceil((finalDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  log.info(`[Retention] Extended retention for order ${orderId}: expires ${finalDate.toISOString()}`);

  return {
    success: true,
    retention_expires_at: finalDate.toISOString(),
    days_remaining: daysRemaining,
  };
}

/**
 * Get orders due for deletion reminder (14 days before expiry).
 *
 * ST6-05: Only sends reminders for orders in terminal states.
 * Do NOT send reminders to orders in active states like REVISION_REQ,
 * PROCESSING, HOLD_PENDING, AWAITING_APPROVAL, INTAKE, etc.
 * An attorney receiving "your data will be deleted" while actively
 * revising is confusing and alarming.
 */
export async function getOrdersDueForReminder(): Promise<Array<{
  id: string;
  client_id: string;
  motion_type: string;
  case_number: string | null;
  retention_expires_at: string;
}>> {
  const supabase = getServiceSupabase();

  const reminderCutoff = new Date();
  reminderCutoff.setDate(reminderCutoff.getDate() + REMINDER_DAYS_BEFORE);

  const { data, error } = await supabase
    .from('orders')
    .select('id, client_id, motion_type, case_number, retention_expires_at')
    .lte('retention_expires_at', reminderCutoff.toISOString())
    .is('deleted_at', null)
    .eq('deletion_reminder_sent', false)
    .not('retention_expires_at', 'is', null)
    .in('status', [...DELETABLE_STATUSES]); // ST6-05: terminal states only

  if (error) {
    log.error('[Retention] Error fetching orders for reminder:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark reminder as sent for an order
 */
export async function markReminderSent(orderId: string): Promise<void> {
  const supabase = getServiceSupabase();

  await supabase
    .from('orders')
    .update({
      deletion_reminder_sent: true,
      deletion_reminder_sent_at: new Date().toISOString(),
    })
    .eq('id', orderId);
}

/**
 * Get orders past retention date (ready for deletion).
 * Only returns orders in terminal states (DELETABLE_STATUSES).
 *
 * ST6-01: Added status guard to prevent deletion of active orders.
 */
export async function getExpiredOrders(): Promise<Array<{ id: string; status: string }>> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('orders')
    .select('id, status')
    .lte('retention_expires_at', new Date().toISOString())
    .is('deleted_at', null)
    .not('retention_expires_at', 'is', null)
    .in('status', [...DELETABLE_STATUSES]);

  if (error) {
    log.error('[Retention] Error fetching expired orders:', error);
    return [];
  }

  return data || [];
}

/**
 * Detect non-terminal orders with expired retention.
 * These are anomalies requiring admin investigation — an active order
 * should never have an expired retention date.
 *
 * ST6-01: Anomaly detection layer for stuck orders.
 */
export async function getStuckExpiredOrders(): Promise<Array<{
  id: string;
  status: string;
  retention_expires_at: string;
}>> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('orders')
    .select('id, status, retention_expires_at')
    .lte('retention_expires_at', new Date().toISOString())
    .is('deleted_at', null)
    .not('retention_expires_at', 'is', null)
    .not('status', 'in', `(${[...DELETABLE_STATUSES].join(',')})`);

  if (error) {
    log.error('[Retention] Error fetching stuck expired orders:', error);
    return [];
  }

  return data || [];
}
