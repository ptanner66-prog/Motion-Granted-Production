/**
 * Flag Compiler (SP-19 Block 2)
 *
 * Aggregates per-step flags from the 7-step citation pipeline into a
 * composite risk profile.  This is distinct from the legacy FlagManager
 * (lib/citation/flag-manager.ts) which tracks individual flag lifecycle;
 * the compiler produces a read-only summary for protocol decisions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompiledFlags {
  /** Total number of flags across all steps */
  total: number;
  /** Count of flags grouped by flag type */
  byType: Record<string, number>;
  /** Highest severity encountered */
  maxSeverity: 'NONE' | 'FLAG' | 'BLOCK';
  /** Human-readable one-liner */
  summary: string;
}

interface StepFlag {
  type: string;
  severity?: string;
}

interface StepResult {
  flags?: StepFlag[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile flags from pipeline step results into an aggregate risk assessment.
 *
 * @param stepResults - Record keyed by step name (e.g. "step_1", "step_6")
 *                      where each value contains an optional `flags` array.
 */
export function compileFlags(
  stepResults: Record<string, StepResult | undefined | null>
): CompiledFlags {
  const allFlags: StepFlag[] = [];

  for (const result of Object.values(stepResults)) {
    if (result?.flags && Array.isArray(result.flags)) {
      allFlags.push(...result.flags);
    }
  }

  const byType: Record<string, number> = {};
  let maxSeverity: 'NONE' | 'FLAG' | 'BLOCK' = 'NONE';

  for (const flag of allFlags) {
    byType[flag.type] = (byType[flag.type] || 0) + 1;

    if (flag.severity === 'BLOCK') {
      maxSeverity = 'BLOCK';
    } else if (flag.severity === 'FLAG' && maxSeverity !== 'BLOCK') {
      maxSeverity = 'FLAG';
    }
  }

  return {
    total: allFlags.length,
    byType,
    maxSeverity,
    summary:
      allFlags.length === 0
        ? 'No flags'
        : `${allFlags.length} flag(s) (max severity: ${maxSeverity})`,
  };
}
