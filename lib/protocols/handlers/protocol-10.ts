// lib/protocols/handlers/protocol-10.ts
// D9 Canonical Protocol 10 Type Definitions (V-7 / D7-CORR-002)
//
// Protocol 10 triggers when quality thresholds cannot be met.
// This file is the CANONICAL location for trigger sources and context.
// All consumers MUST import from here — never define local copies.

/**
 * D9 canonical trigger sources for Protocol 10.
 * These are the ONLY valid reasons Protocol 10 can fire.
 */
export type Protocol10TriggerSource =
  | 'PHASE_VII_GRADE_FAILURE'  // Phase VII judge simulation failed quality threshold
  | 'CP3_REJECTION'           // Attorney rejected at CP3 (after max rework cap)
  | 'COST_CAP_EXCEEDED';      // Sub-loop AI cost exceeded tier cap

/**
 * D9 canonical context for Protocol 10 trigger.
 * Passed to all Protocol 10 handlers and stored in audit logs.
 */
export interface Protocol10TriggerContext {
  orderId: string;
  workflowId: string;
  tier: string;
  triggerSource: Protocol10TriggerSource;
  loopCount: number;
  maxLoops: number;
  costDetails?: {
    totalCost: number;
    capAmount: number;
  };
}
