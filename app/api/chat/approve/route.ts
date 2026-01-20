/**
 * Approve and Deliver Motion API
 *
 * One-click approve: generates PDF from the conversation's motion and delivers to client
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateMotionPDF, savePDFAsDeliverable } from '@/lib/workflow/pdf-generator';
import { queueOrderNotification } from '@/lib/automation/notification-sender';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Get order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, profiles(full_name, email)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Get conversation with generated motion
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'No conversation found for this order' }, { status: 404 });
    }

    if (!conversation.generated_motion) {
      return NextResponse.json({ error: 'No motion has been generated yet' }, { status: 400 });
    }

    // Generate PDF from the motion
    const pdfResult = await generateMotionPDF({
      title: `${order.motion_type} - ${order.case_caption || order.case_number}`,
      content: conversation.generated_motion,
      caseNumber: order.case_number,
      caseCaption: order.case_caption,
      court: order.jurisdiction,
      filingDate: new Date().toISOString(),
    });

    if (!pdfResult.success || !pdfResult.data?.pdfBuffer) {
      return NextResponse.json({ error: pdfResult.error || 'Failed to generate PDF' }, { status: 500 });
    }

    // Save PDF as deliverable
    const saveResult = await savePDFAsDeliverable(
      orderId,
      pdfResult.data.pdfBuffer,
      `${order.order_number}_motion.pdf`
    );

    if (!saveResult.success || !saveResult.data) {
      return NextResponse.json({ error: saveResult.error || 'Failed to save PDF' }, { status: 500 });
    }

    // Update order status to delivered
    await supabase
      .from('orders')
      .update({
        status: 'draft_delivered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Update conversation status
    await supabase
      .from('conversations')
      .update({ status: 'completed' })
      .eq('id', conversation.id);

    // Log the approval
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'motion_approved',
      action_details: {
        approvedBy: user.id,
        approverName: profile.full_name,
        deliverableUrl: saveResult.data.fileUrl,
        approvedAt: new Date().toISOString(),
      },
    });

    // Send notification to client
    const clientProfile = order.profiles as { full_name: string; email: string } | null;
    if (clientProfile?.email) {
      await queueOrderNotification(orderId, 'draft_ready', {
        clientName: clientProfile.full_name || 'Client',
        clientEmail: clientProfile.email,
        deliverableReady: true,
      }).catch(err => {
        console.error('Failed to queue notification:', err);
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Motion approved and delivered',
      deliverableUrl: saveResult.data.fileUrl,
      status: 'draft_delivered',
    });
  } catch (error) {
    console.error('Approve motion error:', error);
    return NextResponse.json({
      error: 'Failed to approve motion. Please try again.',
    }, { status: 500 });
  }
}
