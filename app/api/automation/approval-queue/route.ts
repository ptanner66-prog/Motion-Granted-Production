import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ApprovalQueueItem, ApprovalStatus } from '@/types/automation';
import { createLogger } from '@/lib/security/logger';
import { buildRefundAuditRecord, calculateAdminRefundSuggestion } from '@/lib/payments/refund-calculator';

const log = createLogger('api-automation-approval-queue');

/**
 * GET /api/automation/approval-queue
 * Get pending approvals
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Verify admin authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('approval_queue')
      .select(`
        *,
        order:order_id (
          order_number,
          case_caption,
          motion_type,
          status
        )
      `, { count: 'exact' })
      .eq('status', status)
      .order('urgency', { ascending: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq('approval_type', type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      approvals: data as ApprovalQueueItem[],
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error) {
    log.error('Get approval queue error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/automation/approval-queue
 * Process an approval (approve/reject)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify admin authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
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

    const body = await request.json();
    const { approvalId, action, notes, selectedAlternative, refundAmountCents, overrideReason, orderId: bodyOrderId, suggestedRefundCents, suggestedPercentage } = body;

    if (!approvalId || !action) {
      return NextResponse.json(
        { error: 'Approval ID and action are required' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Fetch the approval
    const { data: approval, error: fetchError } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('id', approvalId)
      .eq('status', 'pending')
      .single();

    if (fetchError || !approval) {
      return NextResponse.json(
        { error: 'Approval not found or already processed' },
        { status: 404 }
      );
    }

    // Update approval status
    const newStatus: ApprovalStatus = action === 'approve' ? 'approved' : 'rejected';

    const { error: updateError } = await supabase
      .from('approval_queue')
      .update({
        status: newStatus,
        reviewed_by: user.id,
        review_notes: notes || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', approvalId);

    if (updateError) throw updateError;

    // Execute post-approval actions based on type
    let nextAction: string | undefined;

    if (action === 'approve') {
      switch (approval.approval_type) {
        case 'conflict_review':
          // Clear conflicts on the order
          await supabase
            .from('orders')
            .update({
              conflict_flagged: false,
              conflict_cleared: true,
              conflict_notes: notes || 'Approved after review',
            })
            .eq('id', approval.order_id);

          // Clear conflict matches
          await supabase
            .from('conflict_matches')
            .update({
              is_cleared: true,
              cleared_by: user.id,
              cleared_at: new Date().toISOString(),
              clear_reason: notes || 'Approved after review',
            })
            .eq('order_id', approval.order_id)
            .eq('is_cleared', false);

          nextAction = 'Proceed with clerk assignment';
          break;

        case 'clerk_assignment':
          // Assign the recommended or selected clerk
          const clerkId = selectedAlternative ||
            (approval.request_details as { candidates?: Array<{ clerkId: string }> })?.candidates?.[0]?.clerkId;

          if (clerkId) {
            // Get current clerk workload
            const { data: clerk } = await supabase
              .from('clerks')
              .select('current_workload')
              .eq('id', clerkId)
              .single();

            // Update order
            await supabase
              .from('orders')
              .update({
                clerk_id: clerkId,
                status: 'assigned',
              })
              .eq('id', approval.order_id);

            // Increment clerk workload
            if (clerk) {
              await supabase
                .from('clerks')
                .update({ current_workload: clerk.current_workload + 1 })
                .eq('id', clerkId);
            }

            nextAction = 'Order assigned to clerk';
          }
          break;

        case 'qa_override':
          // Mark order as ready for delivery
          await supabase
            .from('orders')
            .update({ status: 'DRAFT_DELIVERED' })
            .eq('id', approval.order_id);

          nextAction = 'Draft approved for delivery';
          break;

        case 'refund_request': {
          // Log refund decision to payment_events audit trail
          if (typeof refundAmountCents === 'number' && approval.order_id) {
            // Recalculate suggestion server-side for audit integrity
            const { data: orderData } = await supabase
              .from('orders')
              .select('amount_paid_cents, current_phase')
              .eq('id', approval.order_id)
              .single();

            const suggestion = orderData?.amount_paid_cents && orderData?.current_phase
              ? calculateAdminRefundSuggestion(orderData.amount_paid_cents, orderData.current_phase)
              : {
                  suggestedRefundCents: suggestedRefundCents ?? 0,
                  suggestedPercentage: suggestedPercentage ?? 0,
                  reasoning: 'Calculated client-side (order data unavailable server-side)',
                  phase: 'UNKNOWN',
                };

            const auditRecord = buildRefundAuditRecord({
              orderId: approval.order_id,
              adminId: user.id,
              suggestion,
              actualRefundCents: refundAmountCents,
              overrideReason: overrideReason || undefined,
            });

            const { error: auditError } = await supabase
              .from('payment_events')
              .insert(auditRecord);

            if (auditError) {
              // Log but don't block — refund approval already recorded
              log.error('[refund-audit] Failed to log refund audit:', { error: auditError.message });
            }
          }

          nextAction = 'Process refund in Stripe';
          break;
        }
      }
    } else {
      // Handle rejection actions
      switch (approval.approval_type) {
        case 'conflict_review':
          // Flag as conflicted
          await supabase
            .from('orders')
            .update({
              conflict_flagged: true,
              conflict_cleared: false,
              conflict_notes: notes || 'Conflict confirmed - order rejected',
              status: 'CANCELLED',
            })
            .eq('id', approval.order_id);

          nextAction = 'Order cancelled due to conflict';
          break;

        case 'clerk_assignment':
          nextAction = 'Manual assignment required';
          break;

        case 'qa_override':
          nextAction = 'Document requires revision';
          break;
      }
    }

    // Log the action
    await supabase.from('automation_logs').insert({
      order_id: approval.order_id,
      action_type: action === 'approve' ? 'approval_granted' : 'approval_denied',
      action_details: {
        approvalId,
        approvalType: approval.approval_type,
        reviewedBy: user.id,
        notes,
        selectedAlternative,
      },
      owner_override: true,
    });

    return NextResponse.json({
      success: true,
      message: `Approval ${action}d successfully`,
      nextAction,
    });
  } catch (error) {
    log.error('Process approval error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
