// ============================================================
// lib/protocols/handlers/protocol-10.ts
// Protocol 10 — Unified Loop Exit / Resource Limit
// 3 entry points, 1 function (Decision 7 Option A)
// Source: D9 C-3 | SP-13 AO-3
//
// D9 Canonical Protocol 10 Type Definitions (V-7 / D7-CORR-002)
// This file is the CANONICAL location for trigger sources and context.
// All consumers MUST import from here — never define local copies.
// ============================================================

import { createLogger } from '../../logging/logger';
import { getTierConfig } from '../../config/tier-config';
import type { AISEntry } from '../types';

const logger = createLogger('protocol-10');
export const VERSION = '1.0.0';

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

/**
 * Unified Protocol 10 trigger function.
 *
 * Three entry points (all call this single function):
 * 1. Phase VII Grade Failure — Fn1 when loop counter at max
 * 2. CP3 Attorney Rejection — Fn2 when attorney Request Changes at max
 * 3. Cost-Cap Exit — Fn1 when checkSubLoopCostCap() detects ceiling exceeded
 */
export async function triggerProtocol10(
  context: Protocol10TriggerContext,
  supabase: { from: (table: string) => { upsert: (row: unknown, opts?: unknown) => Promise<{ error: { message: string } | null }> } }
): Promise<{ enhancedDisclosure: string; aisEntry: AISEntry }> {
  const disclosure = generateEnhancedDisclosure(context);
  const aisEntry = buildProtocol10AISEntry(context, disclosure);

  // Write to phase_context (UPSERT on order_id + context_key)
  const { error } = await supabase.from('phase_context').upsert(
    {
      order_id: context.orderId,
      context_key: 'protocol_10_disclosure',
      context_value: JSON.stringify({
        disclosure,
        triggerSource: context.triggerSource,
        loopCount: context.loopCount,
        maxLoops: context.maxLoops,
        tier: context.tier,
      }),
    },
    { onConflict: 'order_id,context_key' }
  );

  if (error) {
    logger.error('protocol.p10.persistence_failed', {
      orderId: context.orderId,
      error: error.message,
    });
    throw error; // Let calling Inngest step retry (UPSERT is idempotent)
  }

  logger.info('protocol.p10.triggered', {
    orderId: context.orderId,
    triggerSource: context.triggerSource,
    loopCount: context.loopCount,
    maxLoops: context.maxLoops,
    tier: context.tier,
  });

  return { enhancedDisclosure: disclosure, aisEntry };
}

function generateEnhancedDisclosure(context: Protocol10TriggerContext): string {
  // DYNAMIC — do NOT hardcode "3 loops" (D9-013 / D4-005)
  let maxLoops: number;
  try {
    const tierConfig = getTierConfig(context.tier);
    maxLoops = tierConfig.maxRevisionLoops;
  } catch {
    maxLoops = context.maxLoops;
  }

  switch (context.triggerSource) {
    case 'PHASE_VII_GRADE_FAILURE':
      return `This document has undergone ${context.loopCount} of ${maxLoops} permitted revision cycles. The quality threshold was not met within the allowed iterations. Enhanced disclosure is provided below detailing specific areas where the document may require additional attorney review before filing.`;
    case 'CP3_REJECTION':
      return `This document was revised ${context.loopCount} times following attorney-requested changes. The maximum revision limit of ${maxLoops} cycles has been reached. Enhanced disclosure is provided below.`;
    case 'COST_CAP_EXCEEDED':
      return `Processing of this document was halted because the AI processing cost reached the tier ceiling ($${context.costDetails?.capAmount ?? 'N/A'}). The document was delivered at the current quality level. Enhanced disclosure is provided below detailing areas that may require additional attorney review.`;
  }
}

function buildProtocol10AISEntry(
  context: Protocol10TriggerContext,
  disclosure: string
): AISEntry {
  return {
    category: 'RESOURCE_LIMIT',
    protocolNumber: 10,
    severity: 'CRITICAL',
    title: context.triggerSource === 'COST_CAP_EXCEEDED'
      ? 'Processing Halted — Resource Limit'
      : 'Maximum Revision Cycles Reached',
    description: disclosure,
    recommendation: 'Review all flagged sections carefully before filing. This document may contain areas that did not meet the automated quality threshold.',
  };
}
