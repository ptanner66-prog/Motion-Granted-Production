/**
 * VIOLATION ALERTS
 *
 * Alert system for phase enforcement violations.
 * Logs violations and notifies admins of critical issues.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-violation-alerts');
// ============================================================================
// ADMIN CLIENT
// ============================================================================

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// VIOLATION TYPES
// ============================================================================

export type ViolationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ViolationDetails {
  orderId: string;
  orderNumber?: string;
  attemptedPhase?: string;
  currentPhase?: string;
  reason: string;
  severity: ViolationSeverity;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ALERT FUNCTIONS
// ============================================================================

/**
 * Alert for phase gate violations.
 * These are CRITICAL - someone tried to skip a phase.
 */
export async function alertPhaseViolation(
  orderId: string,
  attemptedPhase: string,
  reason: string
): Promise<void> {
  const supabase = getAdminClient();

  // Log to database
  if (supabase) {
    await supabase.from('workflow_violations').insert({
      order_id: orderId,
      attempted_phase: attemptedPhase,
      reason,
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
    });
  }

  // Console alert with visual emphasis
  log.error(`
╔══════════════════════════════════════════════════════════════╗
║                    PHASE VIOLATION ALERT                      ║
╠══════════════════════════════════════════════════════════════╣
║ Order ID: ${orderId.substring(0, 36).padEnd(46)}║
║ Attempted Phase: ${attemptedPhase.padEnd(40)}║
║ Reason: ${reason.substring(0, 48).padEnd(48)}║
║ Time: ${new Date().toISOString().padEnd(50)}║
╚══════════════════════════════════════════════════════════════╝
  `);

  // In production, this would send to Slack/email/PagerDuty
  await sendAdminNotification({
    type: 'PHASE_VIOLATION',
    orderId,
    attemptedPhase,
    reason,
    severity: 'CRITICAL',
  });
}

/**
 * Alert for citation violations.
 * HIGH severity - potential hallucinated citations.
 */
export async function alertCitationViolation(
  orderId: string,
  invalidCitations: string[],
  phase: string
): Promise<void> {
  const supabase = getAdminClient();

  const reason = `Found ${invalidCitations.length} citations not in citation bank during Phase ${phase}: ${invalidCitations.slice(0, 3).join('; ')}${invalidCitations.length > 3 ? '...' : ''}`;

  if (supabase) {
    await supabase.from('workflow_violations').insert({
      order_id: orderId,
      attempted_phase: phase,
      reason,
      severity: 'HIGH',
      timestamp: new Date().toISOString(),
    });
  }

  log.warn(`
╔══════════════════════════════════════════════════════════════╗
║                   CITATION VIOLATION ALERT                    ║
╠══════════════════════════════════════════════════════════════╣
║ Order ID: ${orderId.substring(0, 36).padEnd(46)}║
║ Phase: ${phase.padEnd(48)}║
║ Invalid Citations: ${String(invalidCitations.length).padEnd(38)}║
║ Time: ${new Date().toISOString().padEnd(50)}║
╚══════════════════════════════════════════════════════════════╝
  `);

  await sendAdminNotification({
    type: 'CITATION_VIOLATION',
    orderId,
    phase,
    invalidCitations,
    severity: 'HIGH',
  });
}

/**
 * Alert for output boundary violations.
 * MEDIUM severity - Claude tried to generate more than the phase requires.
 */
export async function alertOutputViolation(
  orderId: string,
  phase: string,
  violationReason: string
): Promise<void> {
  const supabase = getAdminClient();

  if (supabase) {
    await supabase.from('workflow_violations').insert({
      order_id: orderId,
      attempted_phase: phase,
      reason: violationReason,
      severity: 'MEDIUM',
      timestamp: new Date().toISOString(),
    });
  }

  log.warn(`
╔══════════════════════════════════════════════════════════════╗
║                   OUTPUT VIOLATION ALERT                      ║
╠══════════════════════════════════════════════════════════════╣
║ Order ID: ${orderId.substring(0, 36).padEnd(46)}║
║ Phase: ${phase.padEnd(48)}║
║ Reason: ${violationReason.substring(0, 48).padEnd(48)}║
╚══════════════════════════════════════════════════════════════╝
  `);
}

/**
 * Alert for bypass attempts.
 * CRITICAL - someone tried to bypass the workflow entirely.
 */
export async function alertBypassAttempt(
  source: string,
  details: string
): Promise<void> {
  const supabase = getAdminClient();

  if (supabase) {
    await supabase.from('workflow_violations').insert({
      order_id: '00000000-0000-0000-0000-000000000000', // System-level violation
      attempted_phase: 'BYPASS',
      reason: `Bypass attempt from ${source}: ${details}`,
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
    });
  }

  log.error(`
╔══════════════════════════════════════════════════════════════╗
║                   WORKFLOW BYPASS ALERT                       ║
╠══════════════════════════════════════════════════════════════╣
║ Source: ${source.padEnd(48)}║
║ Details: ${details.substring(0, 48).padEnd(48)}║
║ Time: ${new Date().toISOString().padEnd(50)}║
╚══════════════════════════════════════════════════════════════╝
  `);

  await sendAdminNotification({
    type: 'BYPASS_ATTEMPT',
    source,
    details,
    severity: 'CRITICAL',
  });
}

// ============================================================================
// ADMIN NOTIFICATION
// ============================================================================

interface NotificationPayload {
  type: string;
  severity: ViolationSeverity;
  orderId?: string;
  [key: string]: unknown;
}

/**
 * Send notification to admin channels.
 * Sends email alerts for HIGH/CRITICAL violations in production.
 */
async function sendAdminNotification(payload: NotificationPayload): Promise<void> {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'admin@motion-granted.com';

  if (process.env.NODE_ENV === 'production') {
    try {
      const { sendAlertEmail } = await import('@/lib/monitoring/alert-sender');
      await sendAlertEmail({
        to: adminEmail,
        subject: `[${payload.severity}] Workflow Violation: ${payload.type}`,
        level: payload.severity === 'CRITICAL' ? 'FATAL' : 'ERROR',
        category: 'WORKFLOW_ERROR',
        message: `Violation detected: ${payload.type}${payload.orderId ? ` (Order: ${payload.orderId})` : ''}`,
        orderId: payload.orderId,
        metadata: payload,
      });
    } catch (emailError) {
      log.error('[ViolationAlerts] Failed to send admin alert email:', emailError);
    }

    // For critical violations, also pause the workflow
    if (payload.severity === 'CRITICAL' && payload.orderId) {
      await pauseWorkflowForReview(payload.orderId);
    }
  }
}

/**
 * Pause a workflow for admin review after a critical violation.
 */
async function pauseWorkflowForReview(orderId: string): Promise<void> {
  const supabase = getAdminClient();
  if (!supabase) return;

  await supabase
    .from('order_workflows')
    .update({
      status: 'blocked',
      metadata: {
        blocked_reason: 'Critical violation detected - requires admin review',
        blocked_at: new Date().toISOString(),
      },
    })
    .eq('order_id', orderId);

  log.error(`[VIOLATION ALERT] Workflow paused for order ${orderId} due to critical violation`);
}

// ============================================================================
// VIOLATION QUERIES
// ============================================================================

/**
 * Get unresolved violations for an order.
 */
export async function getUnresolvedViolations(orderId: string): Promise<{
  count: number;
  violations: Array<{
    id: string;
    attemptedPhase: string;
    reason: string;
    severity: ViolationSeverity;
    timestamp: string;
  }>;
}> {
  const supabase = getAdminClient();
  if (!supabase) return { count: 0, violations: [] };

  const { data, error } = await supabase
    .from('workflow_violations')
    .select('id, attempted_phase, reason, severity, timestamp')
    .eq('order_id', orderId)
    .eq('resolved', false)
    .order('timestamp', { ascending: false });

  if (error || !data) return { count: 0, violations: [] };

  return {
    count: data.length,
    violations: data.map(v => ({
      id: v.id,
      attemptedPhase: v.attempted_phase,
      reason: v.reason,
      severity: v.severity as ViolationSeverity,
      timestamp: v.timestamp,
    })),
  };
}

/**
 * Get all unresolved critical violations across all orders.
 */
export async function getAllCriticalViolations(): Promise<Array<{
  orderId: string;
  orderNumber?: string;
  attemptedPhase: string;
  reason: string;
  timestamp: string;
  hoursUnresolved: number;
}>> {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('workflow_violations')
    .select(`
      order_id,
      attempted_phase,
      reason,
      timestamp,
      orders(order_number)
    `)
    .eq('severity', 'CRITICAL')
    .eq('resolved', false)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  const now = new Date().getTime();

  return data.map(v => {
    // Handle Supabase join which may return array or object
    const ordersData = v.orders as { order_number?: string } | { order_number?: string }[] | null;
    const orderNumber = Array.isArray(ordersData)
      ? ordersData[0]?.order_number
      : ordersData?.order_number;

    return {
      orderId: v.order_id,
      orderNumber,
      attemptedPhase: v.attempted_phase,
      reason: v.reason,
      timestamp: v.timestamp,
      hoursUnresolved: Math.round((now - new Date(v.timestamp).getTime()) / (1000 * 60 * 60)),
    };
  });
}

/**
 * Mark a violation as resolved.
 */
export async function resolveViolation(
  violationId: string,
  resolvedBy: string,
  notes?: string
): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('workflow_violations')
    .update({
      resolved: true,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      resolution_notes: notes,
    })
    .eq('id', violationId);

  return !error;
}
