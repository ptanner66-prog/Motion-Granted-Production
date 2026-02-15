/**
 * Admin API for state management
 *
 * GET  /api/admin/states - List all states (enabled + disabled) with full config
 * PATCH /api/admin/states - Enable/disable a state (legacy toggle interface)
 *
 * Requires admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toggleState } from '@/lib/admin/state-toggle';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-states');

export interface AdminStateResponse {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  state_courts_enabled: boolean;
  federal_circuits: string[];
  federal_districts: string[];
  pricing_multiplier: number;
  formatting_profile: string;
  motion_availability: Record<string, unknown>;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
}

export interface AdminStatesApiResponse {
  states: AdminStateResponse[];
}

export interface AdminStatesApiError {
  error: string;
}

export async function GET(): Promise<NextResponse<AdminStatesApiResponse | AdminStatesApiError>> {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch ALL states for admin view
    const { data: states, error } = await supabase
      .from('states')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      log.error('Database error fetching states', { error: error.message });
      return NextResponse.json(
        { error: 'Failed to fetch states' },
        { status: 500 }
      );
    }

    return NextResponse.json({ states: (states || []) as AdminStateResponse[] });
  } catch (err) {
    log.error('GET error', { error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/states
 * Legacy toggle interface - enables/disables a state via the jurisdiction_toggles table.
 * Kept for backward compatibility with the existing admin jurisdictions page.
 */
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
    log.error('PATCH error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
