/**
 * Approve and Deliver Motion API
 *
 * One-click approve: generates DOCX from the conversation's motion and delivers to client
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { queueOrderNotification } from '@/lib/automation/notification-sender';
import { sendEmail } from '@/lib/resend';
import { DraftReadyEmail } from '@/emails/draft-ready';
import { createElement } from 'react';
import { createLogger } from '@/lib/security/logger';
import { STORAGE_BUCKETS } from '@/lib/config/storage';

const log = createLogger('api-chat-approve');

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

    // Validate orderId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID format' }, { status: 400 });
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

    // Generate DOCX from the motion content
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');

    const motionData = conversation.generated_motion;
    let docxBuffer: Buffer;

    // Check if the motion is a structured object (from Phase V/VIII output)
    const motionObj = typeof motionData === 'string' ? (() => { try { return JSON.parse(motionData); } catch { return null; } })() : motionData;
    const isStructured = motionObj && typeof motionObj === 'object' && (motionObj.caption || motionObj.title || motionObj.introduction);

    if (isStructured) {
      // Structured motion — render with proper formatting
      const font = 'Times New Roman';
      const bodySize = 24;
      const children: InstanceType<typeof Paragraph>[] = [];

      const textToParas = (text: string, opts?: { bold?: boolean; alignment?: typeof AlignmentType.CENTER }) => {
        for (const line of String(text).split('\n')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, font, size: bodySize, bold: opts?.bold })],
            alignment: opts?.alignment,
            spacing: { after: 200 },
          }));
        }
      };
      const spacer = () => children.push(new Paragraph({ children: [], spacing: { after: 200 } }));

      if (motionObj.caption) { textToParas(String(motionObj.caption), { bold: true, alignment: AlignmentType.CENTER }); spacer(); }
      if (motionObj.title) {
        children.push(new Paragraph({
          children: [new TextRun({ text: String(motionObj.title), font, size: bodySize, bold: true, allCaps: true })],
          alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, spacing: { after: 300 },
        }));
        spacer();
      }
      if (motionObj.introduction) { textToParas(String(motionObj.introduction)); spacer(); }
      if (motionObj.statementOfFacts) {
        children.push(new Paragraph({ children: [new TextRun({ text: 'STATEMENT OF FACTS', font, size: bodySize, bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }));
        textToParas(String(motionObj.statementOfFacts)); spacer();
      }
      const legalArgs = motionObj.legalArguments as Array<{ heading?: string; content?: string }> | undefined;
      if (legalArgs && Array.isArray(legalArgs)) {
        for (const arg of legalArgs) {
          if (arg.heading) children.push(new Paragraph({ children: [new TextRun({ text: arg.heading, font, size: bodySize, bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }));
          if (arg.content) textToParas(arg.content);
          spacer();
        }
      }
      if (motionObj.conclusion) {
        children.push(new Paragraph({ children: [new TextRun({ text: 'CONCLUSION', font, size: bodySize, bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }));
        textToParas(String(motionObj.conclusion)); spacer();
      }
      if (motionObj.prayerForRelief) { textToParas(String(motionObj.prayerForRelief)); spacer(); }
      if (motionObj.signature) { spacer(); textToParas(String(motionObj.signature)); }
      if (motionObj.certificateOfService) {
        children.push(new Paragraph({ children: [], pageBreakBefore: true }));
        children.push(new Paragraph({ children: [new TextRun({ text: 'CERTIFICATE OF SERVICE', font, size: bodySize, bold: true })], alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }));
        textToParas(String(motionObj.certificateOfService));
      }

      docxBuffer = Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children }] })));
    } else {
      // Plain text — wrap line-by-line
      const text = typeof motionData === 'string' ? motionData : JSON.stringify(motionData, null, 2);
      const lines = text.split('\n');
      const paragraphs = lines.map((line: string) => new Paragraph({
        children: [new TextRun({ text: line, font: 'Times New Roman', size: 24 })],
        spacing: { after: 240 },
      }));
      docxBuffer = Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] })));
    }
    const fileName = `${order.order_number}_motion.docx`;
    const storagePath = `orders/${orderId}/deliverables/${fileName}`;

    // Upload DOCX to storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKETS.ORDER_DOCUMENTS)
      .upload(storagePath, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadError) {
      log.error('Storage upload failed', { bucket: STORAGE_BUCKETS.ORDER_DOCUMENTS, storagePath, error: uploadError.message });
      return NextResponse.json({ error: `Failed to upload DOCX: ${uploadError.message}` }, { status: 500 });
    }

    // FIX-B FIX-3: Use signed URL (1hr) instead of permanent public URL.
    // Legal documents must never be accessible via unauthenticated permanent URLs.
    const { data: signedData } = await supabase.storage
      .from(STORAGE_BUCKETS.ORDER_DOCUMENTS)
      .createSignedUrl(storagePath, 3600);
    const fileUrl = signedData?.signedUrl ?? storagePath;

    // Insert document record
    await supabase.from('documents').insert({
      order_id: orderId,
      file_name: fileName,
      file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file_size: docxBuffer.length,
      file_url: storagePath,
      document_type: 'motion',
      is_deliverable: true,
      uploaded_by: user.id,
    });

    // Update order status to delivered
    await supabase
      .from('orders')
      .update({
        status: 'draft_delivered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Send Inngest event to unblock the workflow's waitForEvent step (if waiting)
    try {
      await inngest.send({
        name: 'workflow/checkpoint-approved',
        data: {
          orderId,
          action: 'APPROVE',
          approvedBy: user.id,
          approvedAt: new Date().toISOString(),
        },
      });
      log.info(`[CP3] Sent Inngest approval event for order ${orderId}`);
    } catch (inngestError) {
      log.error('[CP3] Failed to send Inngest approval event (non-fatal)', {
        error: inngestError instanceof Error ? inngestError.message : inngestError,
        orderId,
      });
    }

    // Update conversation status
    await supabase
      .from('conversations')
      .update({ status: 'completed' })
      .eq('id', conversation.id);

    // Log the approval (using valid action_type 'status_changed')
    try {
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'status_changed',
        action_details: {
          change_type: 'motion_approved',
          approvedBy: user.id,
          approverName: profile.full_name,
          deliverableUrl: fileUrl,
          approvedAt: new Date().toISOString(),
        },
      });
    } catch (logErr) {
      log.error('Failed to log approval', { error: logErr instanceof Error ? logErr.message : logErr });
      // Don't fail the request if logging fails
    }

    // Send notification to client immediately
    const clientProfile = order.profiles as { full_name: string; email: string } | null;
    if (clientProfile?.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://motiongranted.com';
      const deliveredDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Send email directly for immediate delivery
      try {
        await sendEmail({
          to: clientProfile.email,
          subject: `Your Draft is Ready - ${order.order_number}`,
          react: createElement(DraftReadyEmail, {
            orderNumber: order.order_number,
            motionType: order.motion_type || 'Motion',
            caseCaption: order.case_caption || '',
            deliveredDate,
            portalUrl: `${baseUrl}/dashboard`,
            orderUrl: `${baseUrl}/orders/${orderId}`,
          }),
        });
        log.info('Email sent for order', { orderNumber: order.order_number });
      } catch (emailErr) {
        log.error('Failed to send email directly', { error: emailErr instanceof Error ? emailErr.message : emailErr });
        // Fall back to queue if direct send fails
        await queueOrderNotification(orderId, 'draft_ready', {
          clientName: clientProfile.full_name || 'Client',
          clientEmail: clientProfile.email,
          deliverableReady: true,
        }).catch(err => {
          log.error('Failed to queue notification', { error: err instanceof Error ? err.message : err });
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Motion approved and delivered',
      deliverableUrl: fileUrl,
      status: 'draft_delivered',
    });
  } catch (error) {
    log.error('Approve motion error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({
      error: 'Failed to approve motion. Please try again.',
    }, { status: 500 });
  }
}
