/**
 * Workflow Execute API
 *
 * POST: Execute current phase or run entire workflow
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeCurrentPhase, runWorkflow, getWorkflowProgress } from '@/lib/workflow';

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
    const body = await request.json().catch(() => ({}));
    const { runAll = false } = body;

    let result;

    if (runAll) {
      // Run entire workflow until complete or blocked
      result = await runWorkflow(workflowId);
    } else {
      // Execute just the current phase
      result = await executeCurrentPhase(workflowId);
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Get updated progress
    const progress = await getWorkflowProgress(workflowId);

    return NextResponse.json({
      result: result.data,
      progress: progress.success ? progress.data : null,
    });
  } catch (error) {
    console.error('Workflow execute error:', error);
    return NextResponse.json(
      { error: 'Workflow execution failed. Please try again.' },
      { status: 500 }
    );
  }
}
