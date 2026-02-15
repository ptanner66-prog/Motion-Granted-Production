/**
 * Citation Statistics API Route
 *
 * GET: Returns citation verification metrics for the CitationStatsCard
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCitationStats } from '@/lib/analytics/citation-stats';

export async function GET() {
  try {
    const supabase = await createClient();

    // Verify admin auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const stats = await getCitationStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[Analytics] Citation stats error:', error);
    return NextResponse.json(
      { error: 'Failed to load citation statistics' },
      { status: 500 }
    );
  }
}
