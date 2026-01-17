import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runQACheck, overrideQACheck, getQAHistory } from '@/lib/automation';

/**
 * POST /api/automation/qa-check
 * Run QA check on a deliverable document
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

    if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
      return NextResponse.json({ error: 'Admin or clerk access required' }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, documentId, action, reason } = body;

    if (!orderId || !documentId) {
      return NextResponse.json(
        { error: 'Order ID and document ID are required' },
        { status: 400 }
      );
    }

    // Handle override action
    if (action === 'override') {
      const result = await overrideQACheck(orderId, documentId, user.id, reason || 'Manual override');
      return NextResponse.json(result);
    }

    // Run QA check
    const result = await runQACheck(orderId, documentId, {
      useAI: body.useAI !== false,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      approvalRequired: result.data?.recommendation !== 'deliver',
    });
  } catch (error) {
    console.error('[API] QA check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/automation/qa-check?orderId=xxx&documentId=yyy
 * Get QA check history for an order/document
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const documentId = searchParams.get('documentId');

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const result = await getQAHistory(orderId, documentId || undefined);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      history: result.data,
    });
  } catch (error) {
    console.error('[API] Get QA history error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
