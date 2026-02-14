/**
 * Workflow Approve API
 *
 * POST: Approve a phase requiring review
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { approvePhase, getWorkflowProgress } from '@/lib/workflow';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-workflow-approve-phase');

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { phaseNumber, notes } = body;

    if (typeof phaseNumber !== 'number') {
      return NextResponse.json(
        { error: 'phaseNumber is required' },
        { status: 400 }
      );
    }

    const result = await approvePhase(workflowId, phaseNumber, user.id, notes);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Get updated progress
    const progress = await getWorkflowProgress(workflowId);

    return NextResponse.json({
      success: true,
      progress: progress.success ? progress.data : null,
    });
  } catch (error) {
    log.error('Workflow approve error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Workflow approval failed. Please try again.' },
      { status: 500 }
    );
  }
}
