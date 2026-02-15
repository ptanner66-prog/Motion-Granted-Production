/**
 * CIV Batch Citation Verification API
 *
 * POST: Verify multiple citations for an order
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyBatch, type BatchVerificationRequest, type CitationToVerify } from '@/lib/civ/pipeline';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-civ-batch');

export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check authorization - admin or clerk only
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.orderId || !body.citations || !Array.isArray(body.citations)) {
      return NextResponse.json(
        { error: 'orderId and citations array are required' },
        { status: 400 }
      );
    }

    // Validate order exists
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('id', body.orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Map citations to proper format
    const citations: CitationToVerify[] = body.citations.map((c: {
      citation: string;
      caseName?: string;
      proposition: string;
      propositionType?: string;
      quote?: string;
      jurisdiction?: string;
      motionType?: string;
    }) => ({
      citationString: c.citation,
      caseName: c.caseName,
      proposition: c.proposition,
      propositionType: c.propositionType || 'SECONDARY',
      quoteInDraft: c.quote,
      jurisdictionContext: c.jurisdiction,
      motionTypeContext: c.motionType,
    }));

    const batchRequest: BatchVerificationRequest = {
      orderId: body.orderId,
      phase: body.phase || 'V.1',
      citations,
      options: {
        parallelLimit: body.parallelLimit || 5,
      },
    };

    const result = await verifyBatch(batchRequest);

    // Log batch verification
    await supabase.from('automation_logs').insert({
      order_id: body.orderId,
      action_type: 'civ_batch_verification',
      action_details: {
        phase: body.phase || 'V.1',
        totalCitations: result.totalCitations,
        verified: result.verified,
        flagged: result.flagged,
        rejected: result.rejected,
        blocked: result.blocked,
        averageConfidence: result.summary.averageConfidence,
        totalDurationMs: result.summary.totalDurationMs,
        estimatedCost: result.summary.estimatedTotalCost,
      },
    });

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      result,
    });
  } catch (error) {
    log.error('CIV batch verification error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch verification failed' },
      { status: 500 }
    );
  }
}
