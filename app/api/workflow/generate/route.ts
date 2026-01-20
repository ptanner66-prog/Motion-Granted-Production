/**
 * Motion Generation API with Superprompt
 *
 * POST: Generate a motion using the superprompt engine
 *       Returns the motion text and optionally saves as PDF deliverable
 *
 * This is the main endpoint for motion generation that:
 * 1. Takes the lawyer's superprompt template
 * 2. Merges it with order data (checkout info + documents)
 * 3. Sends to Claude
 * 4. Generates PDF
 * 5. Saves as deliverable (pending admin review)
 * 6. Updates order status
 */

// Vercel serverless function configuration
export const maxDuration = 300; // 5 minutes for motion generation + PDF
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  generateMotionWithSuperprompt,
  getSuperpromptTemplate,
  EXAMPLE_SUPERPROMPT_TEMPLATE,
  AVAILABLE_PLACEHOLDERS,
} from '@/lib/workflow/superprompt-engine';
import { generateDetailedMotionPDF, savePDFAsDeliverable, type MotionDocument } from '@/lib/workflow/pdf-generator';
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
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      orderId,
      superpromptTemplate, // Optional - if not provided, uses stored template or example
      generatePdf = true,
      saveAsDeliverable = true,
      requireReview = true, // Default: requires admin review before sending to client
    } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, parties(*)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Get the superprompt template
    let templateToUse = superpromptTemplate;

    if (!templateToUse) {
      // Try to get stored template for this motion type
      const storedTemplate = await getSuperpromptTemplate(order.motion_type);
      if (storedTemplate.success && storedTemplate.data) {
        templateToUse = storedTemplate.data.template;
      } else {
        // Fall back to example template
        templateToUse = EXAMPLE_SUPERPROMPT_TEMPLATE;
      }
    }

    // Generate the motion
    const generationResult = await generateMotionWithSuperprompt(
      orderId,
      templateToUse,
      { maxTokens: 16000 }
    );

    if (!generationResult.success || !generationResult.data) {
      return NextResponse.json({
        error: generationResult.error || 'Motion generation failed',
      }, { status: 500 });
    }

    const { motion, wordCount, tokensUsed, mergeInfo } = generationResult.data;

    let pdfResult = null;
    let deliverableId = null;

    // Generate PDF if requested
    if (generatePdf) {
      // Build document for PDF
      const plaintiffs = (order.parties || [])
        .filter((p: { party_role: string }) => p.party_role === 'plaintiff')
        .map((p: { party_name: string }) => p.party_name);
      const defendants = (order.parties || [])
        .filter((p: { party_role: string }) => p.party_role === 'defendant')
        .map((p: { party_name: string }) => p.party_name);

      const pdfDoc: MotionDocument = {
        courtName: order.jurisdiction || 'United States District Court',
        caseNumber: order.case_number,
        caseCaption: order.case_caption,
        plaintiffs: plaintiffs.length > 0 ? plaintiffs : ['[PLAINTIFF]'],
        defendants: defendants.length > 0 ? defendants : ['[DEFENDANT]'],
        motionTitle: order.motion_type,
        motionType: order.motion_type,
        argument: motion,
        conclusion: 'WHEREFORE, for the foregoing reasons, this Motion should be granted.',
        certificateOfService: `I hereby certify that on ${new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}, I caused a true and correct copy of the foregoing document to be served upon all counsel of record via the Court's CM/ECF electronic filing system.`,
        attorneyName: '[ATTORNEY NAME]',
        attorneyBarNumber: '[BAR NUMBER]',
        firmName: '[FIRM NAME]',
        firmAddress: '[ADDRESS]',
        firmPhone: '[PHONE]',
        firmEmail: '[EMAIL]',
      };

      pdfResult = await generateDetailedMotionPDF(pdfDoc);

      // Save as deliverable if requested
      if (saveAsDeliverable && pdfResult.success && pdfResult.data) {
        const motionType = (order.motion_type || 'Motion').replace(/\s+/g, '_');
        const caseNum = (order.case_number || 'CASE').replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${motionType}_${caseNum}_DRAFT_${new Date().toISOString().split('T')[0]}.pdf`;

        const saveResult = await savePDFAsDeliverable(
          orderId,
          pdfResult.data.pdfBytes,
          fileName
        );

        if (saveResult.success && saveResult.data) {
          deliverableId = saveResult.data.documentId;
        }
      }
    }

    // Update order status based on review requirement
    const newStatus = requireReview ? 'pending_review' : 'draft_delivered';

    await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Log the generation
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'motion_generated',
      action_details: {
        wordCount,
        tokensUsed,
        placeholdersReplaced: mergeInfo.placeholdersReplaced,
        placeholdersMissing: mergeInfo.placeholdersMissing,
        pdfGenerated: !!pdfResult?.success,
        deliverableId,
        requiresReview: requireReview,
        generatedBy: user.id,
      },
    });

    // If not requiring review, notify client
    if (!requireReview) {
      queueOrderNotification(orderId, 'draft_ready', {
        deliverableReady: true,
      }).catch(err => {
        console.error('Failed to queue notification:', err);
      });
    }

    return NextResponse.json({
      success: true,
      motion: motion,
      wordCount,
      tokensUsed,
      mergeInfo,
      pdf: pdfResult?.success ? {
        generated: true,
        pageCount: pdfResult.data?.pageCount,
        deliverableId,
      } : null,
      status: newStatus,
      message: requireReview
        ? 'Motion generated. Awaiting admin/clerk review before sending to client.'
        : 'Motion generated and delivered to client.',
    });
  } catch (error) {
    console.error('Motion generation error:', error);
    return NextResponse.json({
      error: 'Motion generation failed. Please try again or contact support.',
    }, { status: 500 });
  }
}

/**
 * GET: Get available placeholders for superprompt templates
 */
export async function GET() {
  return NextResponse.json({
    placeholders: AVAILABLE_PLACEHOLDERS,
    exampleTemplate: EXAMPLE_SUPERPROMPT_TEMPLATE,
    instructions: `
To use the superprompt engine:
1. Create a superprompt template using the placeholders above
2. POST to this endpoint with { orderId, superpromptTemplate }
3. The system will merge your template with order data
4. Claude generates the motion
5. PDF is created and saved as deliverable
6. Admin/clerk reviews before delivery to client
    `,
  });
}
