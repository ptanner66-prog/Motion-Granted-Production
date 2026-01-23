/**
 * Admin Approve Order API
 *
 * POST /api/orders/[id]/approve
 *
 * Approves a motion draft and triggers:
 * 1. PDF generation
 * 2. Status update to draft_delivered
 * 3. Client notification
 *
 * This is the critical step between generation and delivery.
 * Requires admin authentication.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { generateMotionPDF, savePDFAsDeliverable } from '@/lib/workflow/pdf-generator';
import { queueOrderNotification } from '@/lib/automation/notification-sender';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const supabase = await createClient();

  // Verify admin authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'clerk')) {
    return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
  }

  // Use admin client for updates
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    // Get order with latest conversation
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select(`
        *,
        conversations(
          id,
          generated_motion,
          created_at
        ),
        profiles!orders_client_id_fkey(
          full_name,
          email,
          bar_number,
          firm_name,
          firm_address,
          firm_phone
        ),
        parties(party_name, party_role)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verify order is in pending_review status
    if (order.status !== 'pending_review') {
      return NextResponse.json({
        error: `Order is in '${order.status}' status. Only orders in 'pending_review' can be approved.`,
        currentStatus: order.status,
      }, { status: 400 });
    }

    // Get the latest motion content
    const latestConversation = order.conversations
      ?.sort((a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

    if (!latestConversation?.generated_motion) {
      return NextResponse.json({
        error: 'No generated motion found for this order',
      }, { status: 400 });
    }

    const motionContent = latestConversation.generated_motion;

    // Generate PDF
    let pdfUrl: string | null = null;
    let pdfError: string | null = null;

    try {
      // Generate PDF with motion content
      const pdfResult = await generateMotionPDF({
        title: `${order.motion_type} - ${order.case_caption || order.case_number || 'Motion'}`,
        content: motionContent,
        caseNumber: order.case_number,
        caseCaption: order.case_caption,
        court: order.jurisdiction,
        filingDate: new Date().toISOString(),
      });

      if (pdfResult.success && pdfResult.data?.pdfBuffer) {
        // Use savePDFAsDeliverable for consistent storage
        const fileName = `${order.order_number}_${order.motion_type}_motion.pdf`;
        const saveResult = await savePDFAsDeliverable(
          orderId,
          pdfResult.data.pdfBuffer,
          fileName,
          user.id
        );

        if (saveResult.success && saveResult.data) {
          pdfUrl = saveResult.data.fileUrl;
        } else {
          pdfError = saveResult.error || 'Failed to save PDF';
        }
      } else {
        pdfError = pdfResult.error || 'PDF generation failed';
      }
    } catch (err) {
      pdfError = err instanceof Error ? err.message : 'PDF generation error';
      console.error('[Approve] PDF generation error:', err);
    }

    // Update order status to draft_delivered
    const { error: updateError } = await adminClient
      .from('orders')
      .update({
        status: 'draft_delivered',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('[Approve] Status update error:', updateError);
      return NextResponse.json({
        error: `Failed to update order status: ${updateError.message}`,
      }, { status: 500 });
    }

    // Log approval
    await adminClient.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'order_approved',
      action_details: {
        approvedBy: user.id,
        approverEmail: user.email,
        pdfGenerated: !!pdfUrl,
        pdfUrl,
        pdfError,
      },
    });

    // Queue notification to client
    try {
      await queueOrderNotification(orderId, 'draft_ready');
    } catch (notifyError) {
      console.error('[Approve] Notification queue error:', notifyError);
      // Don't fail the request - notification can be retried
    }

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber: order.order_number,
      status: 'draft_delivered',
      pdfGenerated: !!pdfUrl,
      pdfUrl,
      pdfError,
      message: pdfUrl
        ? 'Order approved, PDF generated, and client notified'
        : `Order approved but PDF generation had an issue: ${pdfError}`,
    });

  } catch (error) {
    console.error('[Approve] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Approval failed',
    }, { status: 500 });
  }
}
