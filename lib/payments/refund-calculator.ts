/**
 * Admin Refund Suggestion Calculator (CAT-B-9-IMPL)
 *
 * Provides phase-based refund percentage suggestions per the admin guidance matrix.
 * This is an ADVISORY tool — admins can override at their discretion.
 */

const PHASE_REFUND_PERCENTAGES: Record<string, number> = {
  'I': 85,
  'II': 85,
  'III': 85,
  'IV': 65,
  'V': 40,
  'V.1': 40,
  'VI': 40,
  'VII': 20,
  'VII.1': 20,
  'VIII': 20,
  'VIII.5': 20,
  'IX': 20,
  'IX.1': 20,
  'X': 0,
};

export interface RefundSuggestion {
  suggestedRefundCents: number;
  suggestedPercentage: number;
  reasoning: string;
}

/**
 * Calculate the suggested refund amount based on the current workflow phase.
 *
 * @param amountPaidCents - Total amount paid in cents
 * @param currentPhase - Current workflow phase (e.g., 'I', 'V', 'VIII')
 * @returns Suggested refund amount and reasoning
 */
export function calculateAdminRefundSuggestion(
  amountPaidCents: number,
  currentPhase: string
): RefundSuggestion {
  const pct = PHASE_REFUND_PERCENTAGES[currentPhase] ?? 0;

  return {
    suggestedRefundCents: Math.round(amountPaidCents * pct / 100),
    suggestedPercentage: pct,
    reasoning: pct > 0
      ? `Phase ${currentPhase}: ${pct}% refund suggested per admin guidance matrix.`
      : `Phase ${currentPhase}: No refund suggested — work is substantially complete.`,
  };
}
