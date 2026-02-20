/**
 * T-16: Structured step logger for Inngest workflow phases.
 *
 * Wraps step.run() with automatic timing, structured logging,
 * and persistence to phase_execution_logs table.
 *
 * Usage in orchestrator (T-17):
 *   const result = await loggedStep(step, 'execute-phase-III', runId, async () => {
 *     return executePhase('III', input);
 *   }, { orderId, phaseCode: 'III', tier, supabase });
 */

import { getServiceSupabase } from '@/lib/supabase/admin';

interface LoggedStepOptions {
  orderId: string;
  phaseCode: string;
  tier?: string;
  supabase?: ReturnType<typeof getServiceSupabase>;
  metadata?: Record<string, unknown>;
}

interface StepLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (id: string, callback: () => Promise<any>) => Promise<any>;
}

/**
 * Wraps an Inngest step.run() call with structured logging and timing.
 * Logging failures never crash the workflow — every DB write is in try/catch.
 */
export async function loggedStep<T>(
  step: StepLike,
  stepName: string,
  runId: string,
  fn: () => Promise<T>,
  options: LoggedStepOptions
): Promise<T> {
  const startTime = Date.now();
  const supabase = options.supabase ?? getServiceSupabase();

  // Log step start (fire-and-forget)
  try {
    await supabase
      .from('phase_execution_logs')
      .insert({
        order_id: options.orderId,
        run_id: runId,
        phase_code: options.phaseCode,
        step_name: stepName,
        status: 'STARTED',
        started_at: new Date().toISOString(),
        metadata: {
          tier: options.tier,
          ...options.metadata,
        },
      });
  } catch (logErr) {
    console.warn(`[step-logger] Failed to log step start for ${stepName}:`, logErr);
  }

  // Execute the actual step
  try {
    const result = await step.run(stepName, fn);
    const durationMs = Date.now() - startTime;

    // Log step completion (fire-and-forget)
    try {
      await supabase
        .from('phase_execution_logs')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq('order_id', options.orderId)
        .eq('step_name', stepName)
        .eq('status', 'STARTED')
        .order('created_at', { ascending: false })
        .limit(1);
    } catch (logErr) {
      console.warn(`[step-logger] Failed to log step completion for ${stepName}:`, logErr);
    }

    console.log(JSON.stringify({
      level: 'info',
      event: 'step_completed',
      stepName,
      orderId: options.orderId,
      phaseCode: options.phaseCode,
      runId,
      durationMs,
      timestamp: new Date().toISOString(),
    }));

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log step failure (fire-and-forget)
    try {
      await supabase
        .from('phase_execution_logs')
        .update({
          status: 'FAILED',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          error_message: errorMessage,
        })
        .eq('order_id', options.orderId)
        .eq('step_name', stepName)
        .eq('status', 'STARTED')
        .order('created_at', { ascending: false })
        .limit(1);
    } catch (logErr) {
      console.warn(`[step-logger] Failed to log step failure for ${stepName}:`, logErr);
    }

    console.error(JSON.stringify({
      level: 'error',
      event: 'step_failed',
      stepName,
      orderId: options.orderId,
      phaseCode: options.phaseCode,
      runId,
      durationMs,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }));

    throw error; // Re-throw — logging never swallows errors
  }
}

/**
 * Log a phase skip (when a phase is not executed, e.g., Tier A skipping Phase VI).
 */
export async function logPhaseSkip(
  orderId: string,
  runId: string,
  phaseCode: string,
  reason: string,
  supabase?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  const db = supabase ?? getServiceSupabase();

  try {
    await db
      .from('phase_execution_logs')
      .insert({
        order_id: orderId,
        run_id: runId,
        phase_code: phaseCode,
        step_name: `skip-phase-${phaseCode}`,
        status: 'SKIPPED',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        metadata: { reason },
      });
  } catch (logErr) {
    console.warn(`[step-logger] Failed to log phase skip for ${phaseCode}:`, logErr);
  }

  console.log(JSON.stringify({
    level: 'info',
    event: 'phase_skipped',
    orderId,
    phaseCode,
    runId,
    reason,
    timestamp: new Date().toISOString(),
  }));
}
