/**
 * Admin Refund Suggestion Calculator (CAT-B-9-IMPL + T-81)
 *
 * Provides phase-based refund percentage suggestions per the admin guidance matrix.
 * These are SUGGESTIONS displayed in the admin UI — not automated refunds.
 * Admin can override with mandatory reason (min 10 chars).
 */

const PHASE_REFUND_MATRIX: Record<string, { percentage: number; reasoning: string }> = {
  'I':     { percentage: 85, reasoning: 'Minimal work — intake/classification only' },
  'II':    { percentage: 85, reasoning: 'Minimal work — preliminary analysis only' },
  'III':   { percentage: 85, reasoning: 'Minimal work — strategy outline only' },
  'IV':    { percentage: 65, reasoning: 'Research initiated — citation search performed' },
  'IV.A':  { percentage: 65, reasoning: 'Research initiated — element extraction complete' },
  'IV.B':  { percentage: 65, reasoning: 'Research initiated — holding verification complete' },
  'V':     { percentage: 40, reasoning: 'Substantial drafting — initial draft complete' },
  'V.1':   { percentage: 40, reasoning: 'Substantial drafting — CIV verification complete' },
  'VI':    { percentage: 40, reasoning: 'Substantial drafting — opposition analysis complete' },
  'VII':   { percentage: 20, reasoning: 'Near-complete — revision in progress' },
  'VII.1': { percentage: 20, reasoning: 'Near-complete — post-revision CIV complete' },
  'VIII':  { percentage: 20, reasoning: 'Near-complete — grading/revision loop' },
  'VIII.5':{ percentage: 20, reasoning: 'Near-complete — caption QC complete' },
  'IX':    { percentage: 20, reasoning: 'Near-complete — formatting QC complete' },
  'IX.1':  { percentage: 20, reasoning: 'Near-complete — final citation audit complete' },
  'X':     { percentage: 0,  reasoning: 'Delivered — refund at admin discretion only' },
};

export interface RefundSuggestion {
  suggestedRefundCents: number;
  suggestedPercentage: number;
  reasoning: string;
  phase: string;
}

/**
 * Calculate the suggested refund amount based on the current workflow phase.
 *
 * @param amountPaidCents - Total amount paid in cents
 * @param currentPhase - Current workflow phase (e.g., 'I', 'V', 'VIII')
 * @returns Suggested refund amount, percentage, reasoning, and phase
 */
export function calculateAdminRefundSuggestion(
  amountPaidCents: number,
  currentPhase: string,
): RefundSuggestion {
  const phaseKey = currentPhase.toUpperCase().replace(/\s/g, '');
  const matrix = PHASE_REFUND_MATRIX[phaseKey];

  if (!matrix) {
    // Unknown phase — suggest conservative 50%
    return {
      suggestedRefundCents: Math.round(amountPaidCents * 0.5),
      suggestedPercentage: 50,
      reasoning: `Unknown phase "${currentPhase}" — defaulting to 50%. Verify manually.`,
      phase: currentPhase,
    };
  }

  return {
    suggestedRefundCents: Math.round(amountPaidCents * (matrix.percentage / 100)),
    suggestedPercentage: matrix.percentage,
    reasoning: matrix.reasoning,
    phase: currentPhase,
  };
}
