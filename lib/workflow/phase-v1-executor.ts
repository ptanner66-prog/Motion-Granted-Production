/**
 * Phase V.1 Executor — Citation Verification (CODE MODE)
 *
 * REPLACES the existing Phase V.1 fallback path in phase-executors.ts
 * that degraded to shallow CourtListener existence checks when the
 * CIV pipeline errored.
 *
 * This executor:
 * 1. Extracts citations from the Phase V draft using Eyecite
 * 2. Deduplicates (prevents phantom fragment double-counting)
 * 3. Runs the FULL 7-step CIV pipeline on each unique citation
 * 4. Returns structured results with hard gate pass/fail
 *
 * HARD GATE: If CIV pipeline fails, the workflow PAUSES.
 * The motion does NOT proceed to Phase VI. Instead:
 * - Store failure details in phase execution record
 * - Set order status to ON_HOLD with reason 'CITATION_VERIFICATION_FAILED'
 * - Log for admin review
 *
 * INTEGRATION: This file exports a single function that is called
 * from the Phase V.1 step in phase-executors.ts. See INTEGRATION_GUIDE.md
 * for exact wiring instructions.
 *
 * EMERGENCY FIX: 2026-02-17 — Addresses BUG 1 + BUG 2
 */

import {
  runCIVPipeline,
  type CIVPipelineOutput,
} from '@/lib/citation/civ-pipeline-runner';

// ============================================================================
// TYPES
// ============================================================================

export interface PhaseV1Input {
  orderId: string;
  phase?: 'V.1' | 'VII.1' | 'IX.1';  // Which CIV phase is calling (default: 'V.1')
  tier: 'A' | 'B' | 'C' | 'D';
  draftText: string;        // Full motion text from Phase V (or revised text for VII.1/IX.1)
  rawCitations: string[];   // Citations extracted by Eyecite (may contain duplicates/fragments)
}

export interface PhaseV1Output {
  phase: 'V.1' | 'VII.1' | 'IX.1';
  status: 'completed' | 'failed';
  success: boolean;
  durationMs: number;
  nextPhase: string | null;   // null if hard gate failed
  output: {
    civPipelineResults: CIVPipelineOutput | null;
    passesHardGate: boolean;
    holdingMismatches: number;
    citationsVerified: number;
    citationsTotal: number;
    verificationRate: string;
    usedCIVPipeline: true;   // ALWAYS true. Never false again.

    // Legacy fields for backward compatibility with existing dashboard
    auditTrail: {
      timestamp: string;
      usedCIVPipeline: true;
      verified: number;
      removed: number;
      flaggedForReview: number;
      verifiedViaCourtListenerBank: number;
      verifiedNow: number;
    };

    // Legacy verification results array (dashboard expects this shape)
    verificationResults: Array<{
      citation: string;
      courtlistener_id: string | null;
      verified: boolean;
      action: 'kept' | 'removed' | 'flagged';
      holdingVerified: boolean;
      holdingClassification: string | null;
      failReasons: string[];
    }>;

    citationVerification: {
      totalInDraft: number;
      verified: number;
      unverified: number;
      removed: number;
      verificationRate: string;
    };

    overallStatus: 'pass' | 'fail' | 'flag';
  };
}

// ============================================================================
// EXECUTOR
// ============================================================================

/**
 * Execute Phase V.1 with the FULL CIV pipeline.
 *
 * This is the function that gets called from phase-executors.ts.
 * It replaces the shallow existence check fallback path.
 *
 * NEVER falls back to shallow checks. If the pipeline errors,
 * the motion is BLOCKED, not silently passed.
 */
export async function executePhaseV1(input: PhaseV1Input): Promise<PhaseV1Output> {
  const startTime = Date.now();
  const { orderId, tier, draftText, rawCitations } = input;
  const phase = input.phase ?? 'V.1';

  console.log(
    `[PHASE_V1] Starting full CIV pipeline for order=${orderId} phase=${phase} tier=${tier} rawCitations=${rawCitations.length}`
  );

  try {
    // Run the full CIV pipeline (includes deduplication internally)
    const civResults = await runCIVPipeline({
      orderId,
      phase,
      tier,
      draftText,
      rawCitations,
      batchSize: phase === 'IX.1' ? 4 : 2, // HIGH_STAKES batch size for V.1/VII.1
    });

    // Build legacy-compatible output
    const verificationResults = civResults.results.map(r => ({
      citation: r.citation,
      courtlistener_id: r.courtlistenerId,
      verified: r.overallStatus === 'PASS' || r.overallStatus === 'FLAG',
      action: r.overallStatus === 'NOT_FOUND'
        ? 'removed' as const
        : r.overallStatus === 'FAIL'
          ? 'removed' as const
          : r.overallStatus === 'FLAG'
            ? 'flagged' as const
            : 'kept' as const,
      holdingVerified:
        r.propositionVerification?.classification === 'EXACT' ||
        r.propositionVerification?.classification === 'CONSISTENT',
      holdingClassification: r.propositionVerification?.classification ?? null,
      failReasons: r.failReasons,
    }));

    const verified = verificationResults.filter(r => r.verified).length;
    const removed = verificationResults.filter(r => r.action === 'removed').length;
    const flagged = verificationResults.filter(r => r.action === 'flagged').length;

    const overallStatus = !civResults.passesHardGate
      ? 'fail' as const
      : flagged > 0
        ? 'flag' as const
        : 'pass' as const;

    // Determine next phase based on which CIV phase is running
    const nextPhaseMap: Record<string, string> = { 'V.1': 'VI', 'VII.1': 'VII', 'IX.1': 'X' };
    const output: PhaseV1Output = {
      phase,
      status: civResults.passesHardGate ? 'completed' : 'failed',
      success: civResults.passesHardGate,
      durationMs: Date.now() - startTime,
      nextPhase: civResults.passesHardGate ? (nextPhaseMap[phase] ?? 'VI') : null,
      output: {
        civPipelineResults: civResults,
        passesHardGate: civResults.passesHardGate,
        holdingMismatches: civResults.summary.holdingMismatches,
        citationsVerified: verified,
        citationsTotal: civResults.results.length,
        verificationRate: civResults.summary.verificationRate,
        usedCIVPipeline: true,

        auditTrail: {
          timestamp: new Date().toISOString(),
          usedCIVPipeline: true,
          verified,
          removed,
          flaggedForReview: flagged,
          verifiedViaCourtListenerBank: civResults.results.filter(
            r => r.courtlistenerId !== null
          ).length,
          verifiedNow: civResults.results.filter(
            r => r.courtlistenerId === null && r.exists
          ).length,
        },

        verificationResults,

        citationVerification: {
          totalInDraft: civResults.results.length,
          verified,
          unverified: civResults.results.length - verified,
          removed,
          verificationRate: civResults.summary.verificationRate,
        },

        overallStatus,
      },
    };

    console.log(
      `[PHASE_V1] Complete: order=${orderId} status=${output.status} ` +
      `holdingMismatches=${civResults.summary.holdingMismatches} ` +
      `passesHardGate=${civResults.passesHardGate}`
    );

    return output;

  } catch (error) {
    console.error(`[PHASE_V1] Fatal error for order=${orderId} phase=${phase}:`, error);

    // On pipeline error, FAIL SAFE — do not let the motion through.
    // Default ALL safety booleans to RESTRICTIVE values.
    return {
      phase,
      status: 'failed',
      success: false,
      durationMs: Date.now() - startTime,
      nextPhase: null,
      output: {
        civPipelineResults: null,
        passesHardGate: false,    // FAIL SAFE: default to restrictive
        holdingMismatches: -1,    // -1 indicates error, not measured
        citationsVerified: 0,
        citationsTotal: rawCitations.length,
        verificationRate: 'ERROR',
        usedCIVPipeline: true,    // Pipeline was INVOKED, even though it errored

        auditTrail: {
          timestamp: new Date().toISOString(),
          usedCIVPipeline: true,
          verified: 0,
          removed: 0,
          flaggedForReview: 0,
          verifiedViaCourtListenerBank: 0,
          verifiedNow: 0,
        },

        verificationResults: [],

        citationVerification: {
          totalInDraft: rawCitations.length,
          verified: 0,
          unverified: rawCitations.length,
          removed: 0,
          verificationRate: '0%',
        },

        overallStatus: 'fail',
      },
    };
  }
}
