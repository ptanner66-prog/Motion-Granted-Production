/**
 * HOLD Event Schema — SP-22 Task 6
 *
 * Unified payload schema for all checkpoint/hold.* events.
 * Every HOLD event emitter MUST use buildHoldEventPayload() to ensure consistency.
 */

export type HoldReason =
  | 'evidence_gap'
  | 'tier_reclassification'
  | 'revision_stall'
  | 'citation_critical_failure';

export type HoldDetails =
  | { type: 'evidence_gap'; gaps: Array<{ field: string; description: string }> }
  | { type: 'revision_stall'; deficiencies: string[]; loopCount: number; stallRatio: number }
  | { type: 'citation_critical_failure'; failures: Array<{ citation: string; error: string }>; phase: string }
  | { type: 'tier_reclassification'; oldTier: string; newTier: string; reason: string };

export interface HoldCreatedEvent {
  orderId: string;
  holdId: string;
  checkpointId: string;
  holdReason: HoldReason;
  customerEmail: string;
  createdAt: string; // ISO 8601
  details: HoldDetails;
}

export interface HoldResolvedEvent {
  orderId: string;
  checkpointId: string;
  action: 'RESUMED' | 'CANCELLED';
  holdReason: string;
  resolvedBy?: string;
}

/**
 * Build a canonical HOLD event payload.
 * All HOLD event emitters should use this function.
 */
export function buildHoldEventPayload(
  orderId: string,
  holdReason: string,
  details: Record<string, unknown>,
  meta: { holdId: string; checkpointId: string; customerEmail: string }
): HoldCreatedEvent {
  return {
    orderId,
    holdId: meta.holdId,
    checkpointId: meta.checkpointId,
    holdReason: holdReason as HoldReason,
    customerEmail: meta.customerEmail,
    createdAt: new Date().toISOString(),
    details: { type: holdReason, ...details } as HoldDetails,
  };
}
