/**
 * Workflow Health API Route
 *
 * GET: Returns workflow system health metrics for the WorkflowHealthCard
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWorkflowHealth } from '@/lib/analytics/workflow-health';

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

    const health = await getWorkflowHealth();
    return NextResponse.json(health);
  } catch (error) {
    console.error('[Analytics] Workflow health error:', error);
    return NextResponse.json(
      { error: 'Failed to load workflow health' },
      { status: 500 }
    );
  }
}
