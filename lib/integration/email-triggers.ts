/**
 * Email Triggers — Workflow Event → Email Template Mapper
 *
 * Maps workflow events to the correct email template and sends via
 * the sendOrderEmail() system. Each function is idempotent and
 * never throws — email failure must not crash the workflow.
 *
 * Called by:
 * - orchestrator.ts (status transitions)
 * - phase-executors.ts (phase completions)
 * - CRON jobs (hold reminders, escalations, auto-cancel)
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { sendOrderEmail, type EmailEvent } from '../email';
import { normalizeTier } from '@/lib/utils/tier-helpers';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('integration-email-triggers');
// ============================================================================
// TYPES
// ============================================================================

export type WorkflowEvent =
  | 'order_confirmed'
  | 'hold_created'
  | 'hold_reminder_24h'
  | 'hold_escalation_72h'
  | 'hold_auto_cancel'
  | 'research_complete'
  | 'draft_reviewed'
  | 'documents_ready'
  | 'revision_received'
  | 'revision_complete';

interface OrderEmailContext {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  motionType: string;
  motionTypeDisplay: string;
  tier: 'A' | 'B' | 'C' | 'D';
  filingDeadline?: string;
  amountPaid?: string;
  holdReason?: string;
  holdHours?: number;
  holdDaysRemaining?: number;
  revisionNotes?: string;
  documentCount?: number;
  documentList?: string[];
}

// ============================================================================
// TIER TURNAROUND MAPPING
// ============================================================================

const TURNAROUND_MAP: Record<string, string> = {
  'A': '2-3 business days',
  'B': '3-4 business days',
  'C': '4-5 business days',
  'D': '5-7 business days',
};

// ============================================================================
// MOTION TYPE DISPLAY NAMES
// ============================================================================

const MOTION_DISPLAY_NAMES: Record<string, string> = {
  'MTD_12B6': 'Motion to Dismiss',
  'MSJ': 'Motion for Summary Judgment',
  'MCOMPEL': 'Motion to Compel Discovery',
  'MTC': 'Motion to Continue',
  'MSTRIKE': 'Motion to Strike',
  'MEXT': 'Motion to Extend Time',
  'MPRO_HAC': 'Motion for Admission Pro Hac Vice',
};

function getDisplayName(code: string): string {
  return MOTION_DISPLAY_NAMES[code] || code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ============================================================================
// CONTEXT FETCHER
// ============================================================================

async function fetchOrderContext(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderEmailContext | null> {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        order_number,
        motion_type,
        motion_tier,
        tier,
        filing_deadline,
        total_price,
        hold_reason,
        hold_created_at,
        revision_notes,
        profiles:client_id (
          full_name,
          email
        )
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) {
      log.error('[email-triggers] Failed to fetch order context:', error?.message || 'Order not found');
      return null;
    }

    const profile = order.profiles as unknown as Record<string, string | null> | null;
    if (!profile?.email) {
      log.error('[email-triggers] No customer email found for order:', orderId);
      return null;
    }

    const tier = normalizeTier(order.motion_tier || order.tier);
    const motionType = order.motion_type || 'MCOMPEL';

    // Calculate hold duration if applicable
    let holdHours = 0;
    let holdDaysRemaining = 7;
    if (order.hold_created_at) {
      const holdStart = new Date(order.hold_created_at as string).getTime();
      const now = Date.now();
      holdHours = Math.round((now - holdStart) / (1000 * 60 * 60));
      holdDaysRemaining = Math.max(0, 7 - Math.floor(holdHours / 24));
    }

    return {
      customerEmail: profile.email,
      customerName: profile.full_name || 'Counselor',
      orderNumber: order.order_number || '',
      motionType,
      motionTypeDisplay: getDisplayName(motionType),
      tier,
      filingDeadline: (order.filing_deadline as string) || undefined,
      amountPaid: order.total_price ? `$${Number(order.total_price).toFixed(2)}` : undefined,
      holdReason: (order.hold_reason as string) || undefined,
      holdHours,
      holdDaysRemaining,
      revisionNotes: (order.revision_notes as string) || undefined,
    };
  } catch (err) {
    log.error('[email-triggers] Context fetch exception:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ============================================================================
// EVENT → EMAIL MAPPING
// ============================================================================

function buildEmailEvent(
  event: WorkflowEvent,
  ctx: OrderEmailContext
): EmailEvent | null {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://motion-granted.com'}/dashboard`;

  switch (event) {
    case 'order_confirmed':
      return {
        type: 'order_confirmed',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          motionType: ctx.motionType,
          motionTypeDisplay: ctx.motionTypeDisplay,
          tier: ctx.tier,
          estimatedTurnaround: TURNAROUND_MAP[ctx.tier] || '3-4 business days',
          filingDeadline: ctx.filingDeadline,
          amountPaid: ctx.amountPaid || 'See receipt',
          dashboardUrl,
        },
      };

    case 'hold_created':
      return {
        type: 'hold_created',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          holdReason: ctx.holdReason || 'Additional information is required to complete your order.',
          dashboardUrl,
        },
      };

    case 'hold_reminder_24h':
      return {
        type: 'hold_reminder',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          holdReason: ctx.holdReason || 'Additional information is required.',
          hoursOnHold: ctx.holdHours || 24,
          daysRemaining: ctx.holdDaysRemaining ?? 6,
          dashboardUrl,
        },
      };

    case 'hold_escalation_72h':
      return {
        type: 'hold_escalation',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          holdReason: ctx.holdReason || 'Additional information is required.',
          hoursOnHold: ctx.holdHours || 72,
          daysRemaining: ctx.holdDaysRemaining ?? 4,
          dashboardUrl,
        },
      };

    case 'hold_auto_cancel':
      return {
        type: 'order_abandoned',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          refundAmount: ctx.amountPaid || 'Full refund',
          reason: 'No response received within 7 days of the hold notification.',
        },
      };

    case 'research_complete':
      return {
        type: 'progress_update',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          milestone: 'research_complete' as const,
          dashboardUrl,
        },
      };

    case 'draft_reviewed':
      return {
        type: 'progress_update',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          milestone: 'draft_reviewed' as const,
          dashboardUrl,
        },
      };

    case 'documents_ready':
      return {
        type: 'documents_ready',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          motionTypeDisplay: ctx.motionTypeDisplay,
          documentCount: ctx.documentCount || 3,
          documentList: ctx.documentList || [
            'Memorandum of Points and Authorities',
            'Proof of Service',
            'Attorney Instructions',
          ],
          filingDeadline: ctx.filingDeadline,
        },
      };

    case 'revision_received':
      return {
        type: 'revision_received',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          revisionNotes: ctx.revisionNotes || 'Revision requested.',
          estimatedCompletion: '1-2 business days',
          dashboardUrl,
        },
      };

    case 'revision_complete':
      // Re-triggers documents_ready with updated package
      return {
        type: 'documents_ready',
        data: {
          customerName: ctx.customerName,
          orderNumber: ctx.orderNumber,
          motionTypeDisplay: `${ctx.motionTypeDisplay} (Revised)`,
          documentCount: ctx.documentCount || 3,
          documentList: ctx.documentList || [
            'Memorandum of Points and Authorities (Revised)',
            'Proof of Service',
            'Attorney Instructions',
          ],
          filingDeadline: ctx.filingDeadline,
        },
      };

    default: {
      log.error(`[email-triggers] Unknown workflow event: ${event}`);
      return null;
    }
  }
}

// ============================================================================
// MAIN TRIGGER FUNCTION
// ============================================================================

/**
 * Trigger an email for a workflow event.
 *
 * This function NEVER throws. Email failure is logged but does not
 * propagate to the caller. The workflow must continue regardless.
 */
export async function triggerEmail(
  supabase: SupabaseClient,
  event: WorkflowEvent,
  orderId: string
): Promise<{ sent: boolean; error?: string }> {
  try {
    log.info(`[email-triggers] Triggering email:`, { event, orderId });

    // Fetch order context
    const ctx = await fetchOrderContext(supabase, orderId);
    if (!ctx) {
      const msg = `Cannot send ${event} email — order context unavailable`;
      log.error(`[email-triggers] ${msg}`, { orderId });
      return { sent: false, error: msg };
    }

    // Build the email event
    const emailEvent = buildEmailEvent(event, ctx);
    if (!emailEvent) {
      const msg = `No email template mapped for event: ${event}`;
      log.error(`[email-triggers] ${msg}`, { orderId });
      return { sent: false, error: msg };
    }

    // Send the email
    const result = await sendOrderEmail(ctx.customerEmail, emailEvent, orderId);

    if (result.success) {
      log.info(`[email-triggers] Email sent:`, { event, orderId, to: ctx.customerEmail });
    } else {
      log.error(`[email-triggers] Email send failed:`, { event, orderId, error: result.error });
    }

    return { sent: result.success, error: result.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown email trigger error';
    log.error(`[email-triggers] Exception:`, { event, orderId, error: msg });
    return { sent: false, error: msg };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

