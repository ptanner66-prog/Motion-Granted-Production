/**
 * Admin HOLD Resolution API — SP-22 Tasks 15-19
 *
 * POST: Admin resolves a HOLD with one of 3 actions:
 *   - RESUME: Resume workflow at the phase determined by hold_reason
 *   - CANCEL: Cancel order with refund
 *   - ESCALATE: Mark for further review
 *
 * Emits checkpoint/hold.resolved which cancels all pending HOLD timer functions.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { getResumePhase } from '@/lib/workflow/resume-handler';
import { handleHoldTimeout } from '@/lib/inngest/checkpoint-timeout';
import { createLogger } from '@/lib/security/logger';
import { queueNotification } from '@/lib/automation/notification-sender';

const log = createLogger('api-admin-hold-resolve');

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify admin
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { orderId, action, notes } = body as {
      orderId: string;
      action: 'RESUME' | 'CANCEL' | 'ESCALATE';
      notes?: string;
    };

    if (!orderId || !action) {
      return NextResponse.json({ error: 'orderId and action are required' }, { status: 400 });
    }

    if (!['RESUME', 'CANCEL', 'ESCALATE'].includes(action)) {
      return NextResponse.json({ error: 'action must be RESUME, CANCEL, or ESCALATE' }, { status: 400 });
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, hold_reason, resume_phase, current_phase')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'on_hold' && order.status !== 'hold_pending') {
      return NextResponse.json(
        { error: `Order is not on hold (status: ${order.status})` },
        { status: 400 }
      );
    }

    const holdReason = order.hold_reason ?? 'evidence_gap';
    const now = new Date().toISOString();

    switch (action) {
      case 'RESUME': {
        // Determine resume phase based on hold_reason
        const resumePhase = getResumePhase(holdReason, order.resume_phase);

        // Update order status
        await supabase
          .from('orders')
          .update({
            status: 'in_progress',
            hold_resolved_at: now,
            updated_at: now,
          })
          .eq('id', orderId);

        // Update workflow
        await supabase
          .from('order_workflows')
          .update({
            status: 'in_progress',
            checkpoint_pending: null,
            hold_response: 'ADMIN_RESUME',
            hold_response_at: now,
            last_activity_at: now,
          })
          .eq('order_id', orderId)
          .in('status', ['on_hold']);

        // Emit resolution event — cancels all pending timer functions
        await inngest.send({
          name: 'checkpoint/hold.resolved',
          data: {
            orderId,
            checkpointId: '',
            action: 'RESUMED',
            holdReason,
            resolvedBy: user.id,
          },
        });

        // Log
        await supabase.from('automation_logs').insert({
          order_id: orderId,
          action_type: 'hold_admin_resume',
          action_details: {
            action: 'RESUME',
            holdReason,
            resumePhase,
            resolvedBy: user.id,
            notes,
          },
        });

        log.info('HOLD resolved by admin: RESUME', { orderId, resumePhase });
        return NextResponse.json({
          success: true,
          action: 'RESUME',
          resumePhase,
          message: `Order resumed. Workflow will continue from ${resumePhase}.`,
        });
      }

      case 'CANCEL': {
        // Get checkpoint for handleHoldTimeout
        const { data: checkpoint } = await supabase
          .from('checkpoint_events')
          .select('id')
          .eq('order_id', orderId)
          .eq('event_type', 'HOLD_TRIGGERED')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        await handleHoldTimeout(checkpoint?.id ?? 'admin-cancel', orderId);

        // Log
        await supabase.from('automation_logs').insert({
          order_id: orderId,
          action_type: 'hold_admin_cancel',
          action_details: {
            action: 'CANCEL',
            holdReason,
            resolvedBy: user.id,
            notes,
          },
        });

        log.info('HOLD resolved by admin: CANCEL', { orderId });
        return NextResponse.json({
          success: true,
          action: 'CANCEL',
          message: 'Order cancelled with refund.',
        });
      }

      case 'ESCALATE': {
        // Mark for further review — emit hold.resolved to cancel 7d timer (CONFLICT-F08)
        await supabase
          .from('orders')
          .update({
            hold_escalated: true,
            updated_at: now,
          })
          .eq('id', orderId);

        // Emit resolution event to cancel pending timer cascade
        await inngest.send({
          name: 'checkpoint/hold.resolved',
          data: {
            orderId,
            checkpointId: '',
            action: 'ESCALATED',
            holdReason,
            resolvedBy: user.id,
          },
        });

        // Queue admin notification
        const adminEmail = process.env.ADMIN_EMAIL || process.env.ALERT_EMAIL;
        if (adminEmail) {
          await queueNotification({
            type: 'hold_manual_escalation',
            recipientId: 'admin',
            recipientEmail: adminEmail,
            orderId,
            subject: `ESCALATION: Hold Requires Attention - ${orderId}`,
            templateData: {
              holdReason,
              escalatedBy: user.id,
              notes,
            },
            priority: 10,
          });
        }

        // Log
        await supabase.from('automation_logs').insert({
          order_id: orderId,
          action_type: 'hold_admin_escalate',
          action_details: {
            action: 'ESCALATE',
            holdReason,
            resolvedBy: user.id,
            notes,
          },
        });

        log.info('HOLD escalated by admin', { orderId });
        return NextResponse.json({
          success: true,
          action: 'ESCALATE',
          message: 'Order escalated for further review.',
        });
      }
    }
  } catch (error) {
    log.error('Hold resolve error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Failed to resolve HOLD. Please try again.' },
      { status: 500 }
    );
  }
}
