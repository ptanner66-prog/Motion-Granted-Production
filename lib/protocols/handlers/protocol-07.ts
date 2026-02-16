// ============================================================
// lib/protocols/handlers/protocol-07.ts
// Protocol 7 — Cumulative Failure Escalation
// Source: D9 C-2 | SP-13 AO-2
//
// BINDING (Decision 5): CUMULATIVE scope — counts failures across
// the entire order, no phase filter.
// BINDING (Decision 6): No explicit reset — MAX(id) subquery
// handles rework naturally.
// ============================================================

import { createLogger } from '../../logging/logger';
import { PROTOCOL_7_THRESHOLDS } from '../../config/protocol-thresholds';
import { isControllingAuthority } from '../../config/jurisdiction-courts';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-07');
export const VERSION = '1.0.0';

export async function handleProtocol7(
  context: ProtocolContext,
  supabase: { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: number | null; error: { message: string } | null }> }
): Promise<ProtocolResult> {
  // ── Canonical P7 query (Decision 5 — BINDING, CUMULATIVE scope) ──
  const { data, error } = await supabase.rpc('get_p7_failure_count', {
    p_order_id: context.orderId,
  });

  if (error) {
    logger.error('protocol.p7.query_failed', {
      orderId: context.orderId,
      error: error.message,
    });
    return {
      protocolNumber: 7,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  const failureCount: number = data ?? 0;
  const thresholds = PROTOCOL_7_THRESHOLDS[context.tier] || PROTOCOL_7_THRESHOLDS['A'];

  // ── Controlling authority override (ST-D9P8-07) ──
  let hasControllingFailure = false;
  if (failureCount > 0 && context.verificationResult?.metadata?.court) {
    hasControllingFailure = isControllingAuthority(
      context.verificationResult.metadata.court as string,
      context.jurisdiction
    );
  }

  // ── Threshold evaluation ──
  let triggered = false;
  let severity: 'INFO' | 'WARNING' | 'CRITICAL' | null = null;
  let holdRequired = false;

  if (hasControllingFailure && failureCount >= 1) {
    // Controlling authority failure: immediate CRITICAL regardless of count
    triggered = true;
    severity = 'CRITICAL';
    holdRequired = true;
  } else if (failureCount >= thresholds.critical) {
    triggered = true;
    severity = 'CRITICAL';
    holdRequired = true;
  } else if (failureCount >= thresholds.pause) {
    triggered = true;
    severity = 'WARNING';
    holdRequired = false;
  }

  logger.info('protocol.p7.evaluated', {
    orderId: context.orderId,
    phase: context.phase,
    protocolNumber: 7,
    failureCount,
    tier: context.tier,
    pauseThreshold: thresholds.pause,
    criticalThreshold: thresholds.critical,
    hasControllingFailure,
    triggered,
    severity,
  });

  if (!triggered) {
    return {
      protocolNumber: 7,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  return {
    protocolNumber: 7,
    triggered: true,
    severity,
    actionTaken: severity === 'CRITICAL' ? 'HOLD_TRIGGERED' : 'PAUSE_WARNING',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 7,
      severity: severity!,
      title: severity === 'CRITICAL'
        ? 'Citation Verification — Critical Failure Threshold'
        : 'Citation Verification — Elevated Failure Count',
      description: `${failureCount} citation${failureCount !== 1 ? 's' : ''} failed verification (Tier ${context.tier} threshold: warning at ${thresholds.pause}, critical at ${thresholds.critical}).${hasControllingFailure ? ' Includes controlling authority citation.' : ''}`,
      recommendation: severity === 'CRITICAL'
        ? 'Production halted for review. Multiple citations could not be verified against available legal databases. Careful review required before filing.'
        : 'Elevated failure count detected. Review flagged citations before filing.',
    },
    holdRequired,
    handlerVersion: VERSION,
  };
}
