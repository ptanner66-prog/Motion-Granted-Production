// app/api/states/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export interface StateResponse {
  code: string;
  name: string;
  state_courts_enabled: boolean;
  federal_circuits: string[];
  federal_districts: string[];
  pricing_multiplier: number;
  motion_availability: {
    state_specific?: string[];
  };
}

export interface StatesApiResponse {
  states: StateResponse[];
}

export interface StatesApiError {
  error: string;
}

/**
 * GET /api/states
 * Returns all enabled states for the customer intake form dropdown.
 * This is a public endpoint - no authentication required.
 */
export async function GET(): Promise<NextResponse<StatesApiResponse | StatesApiError>> {
  try {
    const supabase = await createClient();

    const { data: states, error } = await supabase
      .from('states')
      .select(`
        code,
        name,
        state_courts_enabled,
        federal_circuits,
        federal_districts,
        pricing_multiplier,
        motion_availability
      `)
      .eq('enabled', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API /api/states] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to load states' },
        { status: 500 }
      );
    }

    if (!states) {
      return NextResponse.json({ states: [] });
    }

    const response = NextResponse.json({ states: states as StateResponse[] });
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return response;
  } catch (err) {
    console.error('[API /api/states] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
