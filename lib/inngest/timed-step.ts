/**
 * Timed Step Wrapper — Motion Granted
 *
 * SP-12 AL-2: Wraps Inngest step.run with duration monitoring.
 *
 * Threshold alerts:
 *   250s = WARNING (soft limit — approaching Vercel timeout)
 *   290s = CRITICAL (10s from Vercel 300s timeout)
 *
 * Used for observability — does not abort the step, only logs warnings.
 */

export interface TimedStepResult<T> {
  result: T;
  durationMs: number;
  phase: string;
  tier: string;
}

/**
 * Create a timed step wrapper around Inngest's step object.
 *
 * @param stepFn - Inngest step object (provides step.run)
 * @returns Wrapped step function that adds timing instrumentation
 *
 * @example
 * ```typescript
 * const timedStep = createTimedStep(step);
 * const { result, durationMs } = await timedStep(
 *   'execute-phase-vii',
 *   'VII',
 *   'B',
 *   async () => { return executePhaseVII(input); }
 * );
 * ```
 */
export function createTimedStep(stepFn: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> }) {
  return async function timedStep<T>(
    name: string,
    phase: string,
    tier: string,
    fn: () => Promise<T>
  ): Promise<TimedStepResult<T>> {
    const start = Date.now();

    const result = await stepFn.run(name, fn) as T;

    const durationMs = Date.now() - start;

    // Threshold alerts
    if (durationMs > 290000) { // 290s
      console.error(`[STEP_DURATION] CRITICAL: ${name} took ${durationMs}ms (limit: 300s)`, {
        phase, tier, durationMs,
      });
    } else if (durationMs > 250000) { // 250s
      console.warn(`[STEP_DURATION] WARNING: ${name} took ${durationMs}ms (threshold: 250s)`, {
        phase, tier, durationMs,
      });
    }

    return { result, durationMs, phase, tier };
  };
}
