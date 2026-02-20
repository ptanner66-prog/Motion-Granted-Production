/**
 * GET /api/states/[code]/federal-districts
 *
 * Returns federal districts available for a given state.
 * Public endpoint — no authentication required (intake form loads before login).
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const stateCode = code.toUpperCase();

    if (!/^[A-Z]{2}$/.test(stateCode)) {
      return NextResponse.json(
        { error: 'Invalid state code. Must be 2 uppercase letters.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch federal districts from the states table
    const { data: state, error } = await supabase
      .from('states')
      .select('federal_districts, federal_circuits')
      .eq('code', stateCode)
      .single();

    if (error || !state) {
      return NextResponse.json(
        { error: `State ${stateCode} not found` },
        { status: 404 }
      );
    }

    const response = NextResponse.json({
      stateCode,
      federalDistricts: state.federal_districts || [],
      federalCircuits: state.federal_circuits || [],
    });
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return response;
  } catch (err) {
    console.error('[API /api/states/[code]/federal-districts] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
