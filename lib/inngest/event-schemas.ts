/**
 * Canonical Event Validation — Motion Granted
 *
 * SP-12 AK-6: Zod schemas for all Inngest events.
 * Used to validate event payloads before emission and on receipt.
 *
 * Every Inngest event in Motion Granted should have a schema here.
 * Unknown events pass through validation (forward compatibility).
 */

import { z } from 'zod';

// All canonical Inngest events for Motion Granted
export const EventSchemas = {
  'order/submitted': z.object({
    orderId: z.string().uuid(),
    tier: z.string(),
    motionType: z.string(),
  }),

  'order/revision-requested': z.object({
    orderId: z.string().uuid(),
    attorneyFeedback: z.string().optional(),
    reworkCycleNumber: z.number().min(1).max(3),
  }),

  'order/protocol-10-exit': z.object({
    orderId: z.string().uuid(),
    trigger: z.enum(['COST_CAP', 'MAX_LOOPS']),
    loopCount: z.number(),
    currentPhase: z.string(),
  }),

  'order/upgrade-completed': z.object({
    orderId: z.string().uuid(),
    previousTier: z.string(),
    newTier: z.string(),
    differentialCents: z.number(),
  }),

  'order/cancelled': z.object({
    orderId: z.string().uuid(),
    reason: z.string(),
  }),

  'checkpoint/cp3.reached': z.object({
    orderId: z.string().uuid(),
    workflowId: z.string(),
    packageId: z.string().uuid(),
    tier: z.enum(['A', 'B', 'C', 'D']).optional(),
    attorneyEmail: z.string().email().optional(),
  }),

  'workflow/checkpoint-approved': z.object({
    orderId: z.string().uuid(),
    workflowId: z.string(),
    action: z.enum(['APPROVE', 'REQUEST_CHANGES', 'CANCEL']),
    feedback: z.string().optional(),
  }),

  'conflict/review-started': z.object({
    orderId: z.string().uuid(),
    matchingOrderIds: z.array(z.string()),
    caseNumber: z.string(),
  }),

  'dispute/evidence-compile': z.object({
    orderId: z.string().uuid(),
    disputeId: z.string(),
  }),
} as const;

export type EventName = keyof typeof EventSchemas;

/**
 * Validate an Inngest event payload against its canonical schema.
 *
 * @param name - Event name (e.g., 'order/submitted')
 * @param data - Event payload to validate
 * @returns true if valid or unknown event, false if validation fails
 */
export function validateEvent(name: string, data: unknown): boolean {
  const schema = EventSchemas[name as EventName];
  if (!schema) {
    console.warn(`No schema for event: ${name}`);
    return true; // Unknown events pass through
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`Event validation failed for ${name}:`, result.error.message);
    return false;
  }
  return true;
}

/**
 * Validate and return parsed event data.
 * Throws if validation fails.
 *
 * @param name - Event name
 * @param data - Event payload
 * @returns Parsed event data
 * @throws Error if validation fails
 */
export function parseEvent<T extends EventName>(
  name: T,
  data: unknown
): z.infer<(typeof EventSchemas)[T]> {
  const schema = EventSchemas[name];
  return schema.parse(data);
}
