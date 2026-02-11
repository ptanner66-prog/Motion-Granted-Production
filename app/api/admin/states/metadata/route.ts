/**
 * Public endpoint for intake form
 *
 * Returns only enabled states and their supported motion types.
 * No authentication required (public read for enabled states via RLS).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: states, error } = await supabase
      .from('jurisdiction_toggles')
      .select('state_code, state_name, supported_motion_types')
      .eq('enabled', true)
      .eq('accepting_orders', true)
      .order('state_name');

    if (error) {
      console.error('[api/states/metadata] Error:', error);
      return NextResponse.json({
        states: [{
          stateCode: 'LA',
          stateName: 'Louisiana',
          motionTypes: ['MCOMPEL', 'MTD_12B6', 'MTC', 'MSJ', 'MIL', 'MTL', 'MSEAL'],
        }],
      });
    }

    return NextResponse.json({
      states: (states || []).map((s: Record<string, unknown>) => ({
        stateCode: s.state_code,
        stateName: s.state_name,
        motionTypes: (s.supported_motion_types as string[]) || [],
      })),
    });
  } catch (error) {
    console.error('[api/states/metadata] Exception:', error);
    return NextResponse.json({
      states: [{ stateCode: 'LA', stateName: 'Louisiana', motionTypes: ['MCOMPEL', 'MTD_12B6', 'MTC', 'MSJ'] }],
    });
  }
}
