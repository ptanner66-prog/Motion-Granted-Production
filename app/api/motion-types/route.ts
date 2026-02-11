/**
 * Motion Types API
 *
 * GET: List all available motion types
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get('tier');
  const jurisdiction = searchParams.get('jurisdiction');
  const includeInactive = searchParams.get('includeInactive') === 'true';

  try {
    let query = supabase
      .from('motion_types')
      .select(`
        id,
        code,
        name,
        description,
        tier,
        federal_applicable,
        state_applicable,
        typical_turnaround_days,
        rush_available,
        min_turnaround_days,
        base_price_cents,
        rush_multiplier,
        required_documents,
        typical_page_range,
        is_active,
        display_order
      `)
      .order('display_order', { ascending: true })
      .order('tier', { ascending: true })
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    if (tier) {
      query = query.eq('tier', tier);
    }

    if (jurisdiction === 'federal') {
      query = query.eq('federal_applicable', true);
    } else if (jurisdiction === 'state') {
      query = query.eq('state_applicable', true);
    }

    const { data: motionTypes, error } = await query;

    if (error) {
      console.error('[MotionTypes] Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch motion types' }, { status: 500 });
    }

    // Group by tier for easier consumption
    interface MotionTypeRow {
      id: string;
      tier: string;
      [key: string]: unknown;
    }
    const grouped = {
      A: motionTypes?.filter((m: MotionTypeRow) => m.tier === 'A') || [],
      B: motionTypes?.filter((m: MotionTypeRow) => m.tier === 'B') || [],
      C: motionTypes?.filter((m: MotionTypeRow) => m.tier === 'C') || [],
    };

    return NextResponse.json({
      motionTypes,
      grouped,
      tiers: {
        A: { name: 'Procedural/Administrative', count: grouped.A.length },
        B: { name: 'Intermediate', count: grouped.B.length },
        C: { name: 'Complex/Dispositive', count: grouped.C.length },
      },
    });
  } catch (error) {
    console.error('[MotionTypes] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
