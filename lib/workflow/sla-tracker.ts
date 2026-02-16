/**
 * SLA Tracking Instrumentation — Motion Granted
 *
 * SP-12 AL-1 | v5-XDC-009
 *
 * Tracks order delivery against SLA targets by tier and rush type.
 * [v5-XDC-009] Column is 'completed_at' NOT 'order_completed_at'.
 *
 * SLA targets represent maximum hours from order creation to
 * attorney approval at CP3.
 */

export interface SLAMetrics {
  orderId: string;
  tier: string;
  rushType: string;
  createdAt: Date;
  deliveredAt: Date | null;    // Phase X assembly complete
  completedAt: Date | null;    // Attorney approves at CP3 — [v5-XDC-009]
  totalDurationMs: number | null;
  withinSLA: boolean | null;
}

// SLA targets by tier + rush (in hours)
const SLA_TARGETS_HOURS: Record<string, Record<string, number>> = {
  A: { STANDARD: 72, '48HR': 48, '24HR': 24 },
  B: { STANDARD: 120, '48HR': 48, '24HR': 24 },
  C: { STANDARD: 168, '48HR': 72, '24HR': 48 },
  D: { STANDARD: 240, '48HR': 96, '24HR': 72 },
};

/**
 * Calculate SLA metrics for an order.
 *
 * @param tier - Motion tier (A, B, C, D)
 * @param rushType - Rush type (STANDARD, 48HR, 24HR)
 * @param createdAt - Order creation timestamp
 * @param completedAt - CP3 approval timestamp [v5-XDC-009: completed_at]
 * @returns SLA metrics including target hours and within-SLA status
 */
export function calculateSLA(
  tier: string,
  rushType: string,
  createdAt: Date,
  completedAt: Date | null
): SLAMetrics & { targetHours: number } {
  const tierTargets = SLA_TARGETS_HOURS[tier.toUpperCase()];
  const targetHours = tierTargets?.[rushType] ?? 168; // Default to 168h (1 week)

  if (!completedAt) {
    return {
      orderId: '',
      tier,
      rushType,
      createdAt,
      deliveredAt: null,
      completedAt: null,
      totalDurationMs: null,
      withinSLA: null,
      targetHours,
    };
  }

  const durationMs = completedAt.getTime() - createdAt.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);

  return {
    orderId: '',
    tier,
    rushType,
    createdAt,
    deliveredAt: null,
    completedAt,
    totalDurationMs: durationMs,
    withinSLA: durationHours <= targetHours,
    targetHours,
  };
}

/**
 * Get SLA target hours for a tier and rush type.
 *
 * @param tier - Motion tier
 * @param rushType - Rush type
 * @returns Target hours
 */
export function getSLATargetHours(tier: string, rushType: string): number {
  const tierTargets = SLA_TARGETS_HOURS[tier.toUpperCase()];
  return tierTargets?.[rushType] ?? 168;
}

/**
 * Check if an order is at risk of missing its SLA.
 * Returns true if elapsed time exceeds 80% of the SLA target.
 *
 * @param tier - Motion tier
 * @param rushType - Rush type
 * @param createdAt - Order creation timestamp
 * @returns true if at risk of SLA breach
 */
export function isSLAAtRisk(tier: string, rushType: string, createdAt: Date): boolean {
  const targetHours = getSLATargetHours(tier, rushType);
  const elapsedMs = Date.now() - createdAt.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  return elapsedHours >= targetHours * 0.8;
}
