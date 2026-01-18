import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runClerkAssignment, assignClerk, getAssignmentCandidates } from '@/lib/automation';

/**
 * POST /api/automation/clerk-assignment
 * Run clerk assignment for an order or manually assign
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
    const { orderId, clerkId, action } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // Manual assignment
    if (action === 'assign' && clerkId) {
      const result = await assignClerk(orderId, clerkId, user.id);
      return NextResponse.json(result);
    }

    // Run automatic assignment
    const result = await runClerkAssignment(orderId, {
      useAI: body.useAI !== false,
      preferClerkId: clerkId,
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
      approvalRequired: !result.data?.autoAssigned,
    });
  } catch (error) {
    console.error('[API] Clerk assignment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/automation/clerk-assignment?orderId=xxx
 * Get assignment candidates for an order
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
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const result = await getAssignmentCandidates(orderId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      candidates: result.data,
    });
  } catch (error) {
    console.error('[API] Get candidates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
