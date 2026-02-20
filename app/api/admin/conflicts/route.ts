/**
 * Admin Conflict Queue API — T-84
 *
 * GET:  Fetch conflict_matches for admin review (service_role, bypasses RLS)
 * POST: Resolve a conflict match (approve/reject)
 *
 * Auth: Requires authenticated user with profiles.role = 'admin'
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Auth check — user must be admin
  const userSupabase = await createClient();
  const { data: { user }, error: authError } = await userSupabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Parse query params
  const { searchParams } = new URL(req.url);
  const pendingOnly = searchParams.get('pendingOnly') !== 'false';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  // Fetch conflicts using service_role (bypasses RLS for cross-user visibility)
  const supabase = getServiceSupabase();
  let query = supabase
    .from('conflict_matches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (pendingOnly) {
    query = query.eq('resolved', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[admin/conflicts] Query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conflicts: data || [] });
}

export async function POST(req: NextRequest) {
  // Auth check — user must be admin
  const userSupabase = await createClient();
  const { data: { user }, error: authError } = await userSupabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { conflictId, resolution, resolutionNotes, orderId } = body as {
    conflictId: string;
    resolution: 'approved' | 'rejected';
    resolutionNotes: string | null;
    orderId: string;
  };

  if (!conflictId || !resolution) {
    return NextResponse.json({ error: 'conflictId and resolution are required' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Update conflict_matches record
  const { error: updateError } = await supabase
    .from('conflict_matches')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      resolution_note: resolutionNotes || null,
    })
    .eq('id', conflictId);

  if (updateError) {
    console.error('[admin/conflicts] Update error:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Handle order status based on resolution
  if (orderId) {
    if (resolution === 'approved') {
      // No conflict — clear the flag and allow order to proceed
      await supabase
        .from('orders')
        .update({
          conflict_flagged: false,
          conflict_notes: `Conflict cleared by admin. ${resolutionNotes || ''}`.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
    }

    if (resolution === 'rejected') {
      // Conflict confirmed — put order on hold
      await supabase
        .from('orders')
        .update({
          status: 'ON_HOLD',
          conflict_flagged: true,
          conflict_notes: `Conflict confirmed by admin. ${resolutionNotes || ''}`.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
    }
  }

  return NextResponse.json({ success: true });
}
