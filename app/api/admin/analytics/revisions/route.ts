/**
 * Revision Analytics API Route
 *
 * GET: Returns revision loop metrics for the RevisionAnalyticsCard
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRevisionStats } from '@/lib/analytics/revision-stats';

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

    const stats = await getRevisionStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[Analytics] Revision stats error:', error);
    return NextResponse.json(
      { error: 'Failed to load revision statistics' },
      { status: 500 }
    );
  }
}
