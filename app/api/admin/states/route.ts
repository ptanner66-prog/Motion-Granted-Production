/**
 * Admin API for state toggle management
 *
 * GET  /api/admin/states - List all states with toggle status
 * PATCH /api/admin/states - Enable/disable a state
 *
 * Requires admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStateToggles, toggleState } from '@/lib/admin/state-toggle';

export async function GET() {
  try {
    const supabase = await createClient();
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const toggles = await getStateToggles(supabase);
    return NextResponse.json({ states: toggles });
  } catch (error) {
    console.error('[api/admin/states] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { stateCode, enabled, motionTypes } = body;

    if (!stateCode || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'stateCode and enabled are required' }, { status: 400 });
    }

    const result = await toggleState(supabase, stateCode, enabled, user.id, motionTypes);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, stateCode, enabled });
  } catch (error) {
    console.error('[api/admin/states] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
