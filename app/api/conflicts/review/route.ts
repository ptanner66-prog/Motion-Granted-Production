// /app/api/conflicts/review/route.ts
// API route for admin conflict review
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getPendingConflicts,
  getConflictById,
  reviewConflict,
  getConflictStats,
} from '@/lib/services/conflict/conflict-admin-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication and admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await checkAdminRole(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const conflictId = searchParams.get('id');
    const action = searchParams.get('action');

    // Get stats
    if (action === 'stats') {
      const stats = await getConflictStats();
      return NextResponse.json({ stats });
    }

    // Get specific conflict
    if (conflictId) {
      const conflict = await getConflictById(conflictId);
      if (!conflict) {
        return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });
      }
      return NextResponse.json({ conflict });
    }

    // Get pending conflicts list
    const conflicts = await getPendingConflicts();
    return NextResponse.json({ conflicts });
  } catch (error) {
    console.error('[ConflictReview API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication and admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await checkAdminRole(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { conflictId, action, reviewNotes } = body;

    // Validate required fields
    if (!conflictId) {
      return NextResponse.json({ error: 'conflictId is required' }, { status: 400 });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Process review
    const result = await reviewConflict(
      { conflictId, action, reviewNotes },
      user.id
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Conflict ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
    });
  } catch (error) {
    console.error('[ConflictReview API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function checkAdminRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  return data?.role === 'admin' || data?.role === 'super_admin';
}
