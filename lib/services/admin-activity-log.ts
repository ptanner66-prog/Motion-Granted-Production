// /lib/services/admin-activity-log.ts
// Admin activity logging per SECURITY_IMPLEMENTATION_CHECKLIST_v1 Section 5
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('services-admin-activity-log');
/**
 * Admin actions to log:
 * - View customer order
 * - View customer documents
 * - Download deliverable
 * - Change order status
 * - Access user profile
 * - Approve/reject conflict
 * - Initiate refund
 * - Delete data
 */

export type AdminAction =
  | 'VIEW_ORDER'
  | 'VIEW_DOCUMENTS'
  | 'DOWNLOAD_DELIVERABLE'
  | 'CHANGE_ORDER_STATUS'
  | 'VIEW_USER_PROFILE'
  | 'APPROVE_CONFLICT'
  | 'REJECT_CONFLICT'
  | 'INITIATE_REFUND'
  | 'DELETE_DATA'
  | 'EXPORT_DATA'
  | 'MODIFY_USER'
  | 'VIEW_AUDIT_LOG';

export type TargetType = 'order' | 'user' | 'document' | 'deliverable' | 'conflict' | 'system';

export interface AdminActivityEntry {
  adminUserId: string;
  action: AdminAction;
  targetType: TargetType;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an admin action
 */
export async function logAdminActivity(entry: AdminActivityEntry): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('admin_activity_log').insert({
      admin_user_id: entry.adminUserId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      details: entry.details || {},
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
      created_at: new Date().toISOString(),
    });

    log.info(`[AdminLog] ${entry.action} on ${entry.targetType}:${entry.targetId} by ${entry.adminUserId}`);
  } catch (error) {
    // Don't throw - logging failure shouldn't break the operation
    log.error('[AdminLog] Failed to log activity:', error);
  }
}

/**
 * Get admin activity log with filters
 */
export async function getAdminActivityLog(filters: {
  adminUserId?: string;
  action?: AdminAction;
  targetType?: TargetType;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ entries: any[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('admin_activity_log')
    .select('*, admin:profiles!admin_user_id(email, full_name)', { count: 'exact' });

  if (filters.adminUserId) query = query.eq('admin_user_id', filters.adminUserId);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.targetType) query = query.eq('target_type', filters.targetType);
  if (filters.targetId) query = query.eq('target_id', filters.targetId);
  if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
  if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

  query = query.order('created_at', { ascending: false });

  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);

  const { data, error, count } = await query;

  if (error) {
    log.error('[AdminLog] Error fetching log:', error);
    return { entries: [], total: 0 };
  }

  return { entries: data || [], total: count || 0 };
}

/**
 * Helper to create activity logger middleware
 */
export function createAdminLogger(adminUserId: string, ipAddress?: string, userAgent?: string) {
  return {
    viewOrder: (orderId: string) => logAdminActivity({
      adminUserId, action: 'VIEW_ORDER', targetType: 'order', targetId: orderId, ipAddress, userAgent,
    }),
    viewDocuments: (orderId: string) => logAdminActivity({
      adminUserId, action: 'VIEW_DOCUMENTS', targetType: 'order', targetId: orderId, ipAddress, userAgent,
    }),
    downloadDeliverable: (deliverableId: string, orderId: string) => logAdminActivity({
      adminUserId, action: 'DOWNLOAD_DELIVERABLE', targetType: 'deliverable', targetId: deliverableId,
      details: { order_id: orderId }, ipAddress, userAgent,
    }),
    changeOrderStatus: (orderId: string, fromStatus: string, toStatus: string) => logAdminActivity({
      adminUserId, action: 'CHANGE_ORDER_STATUS', targetType: 'order', targetId: orderId,
      details: { from: fromStatus, to: toStatus }, ipAddress, userAgent,
    }),
    viewUserProfile: (userId: string) => logAdminActivity({
      adminUserId, action: 'VIEW_USER_PROFILE', targetType: 'user', targetId: userId, ipAddress, userAgent,
    }),
    approveConflict: (conflictId: string, orderId: string) => logAdminActivity({
      adminUserId, action: 'APPROVE_CONFLICT', targetType: 'conflict', targetId: conflictId,
      details: { order_id: orderId }, ipAddress, userAgent,
    }),
    rejectConflict: (conflictId: string, orderId: string, reason: string) => logAdminActivity({
      adminUserId, action: 'REJECT_CONFLICT', targetType: 'conflict', targetId: conflictId,
      details: { order_id: orderId, reason }, ipAddress, userAgent,
    }),
    initiateRefund: (orderId: string, amount: number, reason: string) => logAdminActivity({
      adminUserId, action: 'INITIATE_REFUND', targetType: 'order', targetId: orderId,
      details: { amount, reason }, ipAddress, userAgent,
    }),
    deleteData: (targetType: TargetType, targetId: string, dataType: string) => logAdminActivity({
      adminUserId, action: 'DELETE_DATA', targetType, targetId,
      details: { data_type: dataType }, ipAddress, userAgent,
    }),
  };
}
