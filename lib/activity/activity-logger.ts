// lib/activity/activity-logger.ts
// Activity logging for audit trail
// Tasks 61-62 | Version 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export interface ActivityLogEntry {
  user_id?: string;
  user_email?: string;
  user_role?: 'admin' | 'attorney' | 'system';
  action: string;
  resource_type: 'order' | 'user' | 'workflow' | 'retention' | 'auth' | 'system';
  resource_id?: string;
  details?: Record<string, unknown>;
}

/**
 * Log an activity for audit trail
 */
export async function logActivity(entry: ActivityLogEntry): Promise<void> {
  try {
    const supabase = await createClient();

    // Get request headers for IP/User-Agent
    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    try {
      const headersList = await headers();
      ipAddress = headersList.get('x-forwarded-for')?.split(',')[0] ||
                  headersList.get('x-real-ip') ||
                  null;
      userAgent = headersList.get('user-agent') || null;
    } catch {
      // Headers may not be available in all contexts
    }

    // Get user email if user_id provided but no email
    let userEmail = entry.user_email;
    let userRole = entry.user_role;

    if (entry.user_id && (!userEmail || !userRole)) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, role')
        .eq('id', entry.user_id)
        .single();

      if (profile) {
        userEmail = userEmail || profile.email;
        userRole = userRole || profile.role;
      }
    }

    const { error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: entry.user_id || null,
        user_email: userEmail || null,
        user_role: userRole || 'system',
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id || null,
        details: entry.details || {},
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (error) {
      console.error('[Activity] Failed to log activity:', error);
      // Don't throw - logging should never break main flow
    }
  } catch (error) {
    console.error('[Activity] Unexpected error logging activity:', error);
    // Don't throw - logging should never break main flow
  }
}

/**
 * Common activity actions
 */
export const ACTIVITIES = {
  // Auth
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_RESET: 'auth.password_reset',

  // Orders
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_DELETED: 'order.deleted',
  ORDER_DELIVERED: 'order.delivered',

  // Retention
  RETENTION_EXTENDED: 'retention.extended',
  RETENTION_DELETED: 'retention.deleted',
  RETENTION_REMINDER_SENT: 'retention.reminder_sent',

  // Workflow
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',
  PHASE_COMPLETED: 'workflow.phase_completed',

  // Admin
  ADMIN_USER_UPDATED: 'admin.user_updated',
  ADMIN_ORDER_VIEWED: 'admin.order_viewed',
  ADMIN_EXPORT: 'admin.export',
} as const;
