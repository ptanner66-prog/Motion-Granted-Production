/**
 * Public endpoint for intake form
 *
 * Returns only enabled states and their supported motion types.
 * No authentication required (public read for enabled states via RLS).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-states-metadata');

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
      log.error('Error fetching state metadata', { error });
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
    log.error('Exception in state metadata', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({
      states: [{ stateCode: 'LA', stateName: 'Louisiana', motionTypes: ['MCOMPEL', 'MTD_12B6', 'MTC', 'MSJ'] }],
    });
  }
}
