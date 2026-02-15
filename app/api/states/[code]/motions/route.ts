/**
 * GET /api/states/[code]/motions?courtType=STATE|FEDERAL
 *
 * Returns available motion types for a state + court type combination.
 * Reads from state_motion_availability table (BD-7).
 *
 * SP-C Task 5 (Step 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface MotionAvailabilityResponse {
  motions: Array<{
    motion_type: string;
    court_type: string;
    enabled: boolean;
  }>;
  stateCode: string;
  courtType: string;
}

interface MotionAvailabilityError {
  error: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse<MotionAvailabilityResponse | MotionAvailabilityError>> {
  try {
    const { code } = await params;
    const stateCode = code.toUpperCase();
    const courtType = request.nextUrl.searchParams.get('courtType')?.toUpperCase() || 'STATE';

    if (courtType !== 'STATE' && courtType !== 'FEDERAL') {
      return NextResponse.json(
        { error: 'courtType must be STATE or FEDERAL' },
        { status: 400 }
      );
    }

    if (!stateCode || stateCode.length !== 2) {
      return NextResponse.json(
        { error: 'Invalid state code' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: motions, error } = await supabase
      .from('state_motion_availability')
      .select('motion_type, court_type, enabled')
      .eq('state_code', stateCode)
      .eq('court_type', courtType)
      .eq('enabled', true)
      .order('motion_type', { ascending: true });

    if (error) {
      console.error(`[API /api/states/${stateCode}/motions] DB error:`, error);
      return NextResponse.json(
        { error: 'Failed to load motions' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      motions: motions || [],
      stateCode,
      courtType,
    });
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return response;
  } catch (err) {
    console.error('[API /api/states/[code]/motions] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
