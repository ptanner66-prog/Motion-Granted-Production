/**
 * CIV Single Citation Verification API
 *
 * POST: Verify a single citation through the 7-step CIV pipeline
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyCitation, type CitationToVerify } from '@/lib/civ/pipeline';

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
    if (!body.citation || !body.proposition) {
      return NextResponse.json(
        { error: 'citation and proposition are required' },
        { status: 400 }
      );
    }

    const citationToVerify: CitationToVerify = {
      citationString: body.citation,
      caseName: body.caseName,
      proposition: body.proposition,
      propositionType: body.propositionType || 'SECONDARY',
      quoteInDraft: body.quote,
      jurisdictionContext: body.jurisdiction,
      motionTypeContext: body.motionType,
    };

    const result = await verifyCitation(
      citationToVerify,
      body.orderId,
      body.phase || 'V.1'
    );

    // Log verification
    await supabase.from('automation_logs').insert({
      order_id: body.orderId || null,
      action_type: 'civ_single_verification',
      action_details: {
        citation: body.citation,
        result: result.compositeResult.status,
        confidence: result.compositeResult.confidenceScore,
        flags: result.compositeResult.flags.length,
        durationMs: result.metadata.verificationDurationMs,
        cost: result.metadata.estimatedCost,
      },
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('CIV verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
