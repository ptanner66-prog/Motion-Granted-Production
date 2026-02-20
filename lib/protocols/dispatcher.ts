// ============================================================
// lib/protocols/dispatcher.ts
// Protocol Dispatcher — Detection-Only Mode from Day 1
// Source: D9 B-1 | SP-13 AN-1
//
// The dispatcher NEVER short-circuits on HOLD — all 23 protocols
// always run (Decision 1). After a HOLD trigger, remaining protocols
// switch to detectionOnly mode: they check and report but take no action.
// ============================================================

import { createLogger } from '../logging/logger';
import { getProtocolFlags } from './feature-flags';
import type {
  ProtocolContext,
  ProtocolResult,
  ProtocolManifestEntry,
  DispatchResult,
} from './types';

const logger = createLogger('protocol-dispatch');

// BINDING (Decision 8): Only fire during verification phases
const VERIFICATION_PHASES = ['V.1', 'VII.1', 'IX.1'];

// BINDING (PROT-ORC-A): Execution priority order
// P21 > P19 > P02 > P03 > P20 > P18 > P23 > P22 > remaining numerical
const EXECUTION_ORDER = [21, 19, 2, 3, 20, 18, 23, 22, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

// Protocol name registry for manifest
const PROTOCOL_NAMES: Record<number, string> = {
  1: 'Statutory Source Identification',
  2: 'Citation Mismatch Detection',
  3: 'Quote Verification',
  4: 'Parallel Citation Check',
  5: 'New Citation Detection (Mini Phase IV)',
  6: 'Subsequent History Check',
  7: 'Cumulative Failure Escalation',
  8: 'Jurisdiction Mismatch',
  9: 'Date Verification',
  10: 'Loop Exit / Resource Limit',
  11: 'Court Level Verification',
  12: 'Page Limit Check',
  13: 'Citation Format Validation',
  14: 'Reporter Verification',
  15: 'Pinpoint Citation Check',
  16: 'Required Fields Matrix',
  17: 'Duplicate Citation Detection',
  18: 'Dicta Detection',
  19: 'En Banc Detection',
  20: 'Plurality Opinion Detection',
  21: 'Dissent Detection',
  22: 'Upstream Authority Check',
  23: 'Amended Opinion Detection',
};

// Handler registry — populated as handlers are built via registerProtocolHandler()
// Each handler: async (context, supabase?) => ProtocolResult
type ProtocolHandler = (context: ProtocolContext, supabase?: unknown) => Promise<ProtocolResult>;

const handlerRegistry = new Map<number, ProtocolHandler>();

// A-032: Per-protocol circuit breaker — prevents tight failure loops
const protocolFailureCounts = new Map<number, number>();
const MAX_CONSECUTIVE_FAILURES = 3;

function shouldRunProtocol(protocolNumber: number): boolean {
  return (protocolFailureCounts.get(protocolNumber) ?? 0) < MAX_CONSECUTIVE_FAILURES;
}

function recordProtocolFailure(protocolNumber: number): void {
  const count = (protocolFailureCounts.get(protocolNumber) ?? 0) + 1;
  protocolFailureCounts.set(protocolNumber, count);
  if (count >= MAX_CONSECUTIVE_FAILURES) {
    logger.error('protocol.circuit_breaker.tripped', {
      protocolNumber,
      consecutiveFailures: count,
    });
  }
}

function recordProtocolSuccess(protocolNumber: number): void {
  protocolFailureCounts.set(protocolNumber, 0);
}

export function registerProtocolHandler(protocolNumber: number, handler: ProtocolHandler): void {
  handlerRegistry.set(protocolNumber, handler);
}

export function getRegisteredHandlerCount(): number {
  return handlerRegistry.size;
}

export async function dispatchProtocols(
  context: ProtocolContext,
  processedCitationIds?: Set<string>,
  supabase?: unknown
): Promise<DispatchResult> {
  // ── Phase filter (Decision 8) ──
  if (!VERIFICATION_PHASES.includes(context.phase)) {
    logger.info('protocol.dispatch.phase_skipped', {
      orderId: context.orderId,
      phase: context.phase,
    });
    return {
      results: [],
      manifest: EXECUTION_ORDER.map(n => ({
        protocolNumber: n,
        protocolName: PROTOCOL_NAMES[n] || `Protocol ${n}`,
        status: 'NOT_EVALUATED' as const,
        reason: `Phase ${context.phase} is not a verification phase`,
      })),
      holdRequired: false,
      holdProtocol: null,
    };
  }

  // ── HARD STOP resume tracking (D9-005) ──
  if (processedCitationIds?.has(context.citation.id)) {
    logger.info('protocol.dispatch.citation_already_processed', {
      orderId: context.orderId,
      citationId: context.citation.id,
    });
    return {
      results: [],
      manifest: EXECUTION_ORDER.map(n => ({
        protocolNumber: n,
        protocolName: PROTOCOL_NAMES[n] || `Protocol ${n}`,
        status: 'NOT_EVALUATED' as const,
        reason: 'Citation already processed in prior HARD STOP interval',
      })),
      holdRequired: false,
      holdProtocol: null,
    };
  }

  const flags = getProtocolFlags();
  const results: ProtocolResult[] = [];
  const manifest: ProtocolManifestEntry[] = [];
  let holdRequired = false;
  let holdProtocol: number | null = null;

  logger.info('protocol.dispatch.started', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    protocolCount: EXECUTION_ORDER.length,
  });

  const dispatchStart = Date.now();

  for (const protocolNumber of EXECUTION_ORDER) {
    // ── Feature flag check ──
    if (!flags[protocolNumber]) {
      manifest.push({
        protocolNumber,
        protocolName: PROTOCOL_NAMES[protocolNumber] || `Protocol ${protocolNumber}`,
        status: 'NOT_EVALUATED',
        reason: 'Feature flag disabled',
      });
      continue;
    }

    // ── Handler existence check ──
    const handler = handlerRegistry.get(protocolNumber);
    if (!handler) {
      manifest.push({
        protocolNumber,
        protocolName: PROTOCOL_NAMES[protocolNumber] || `Protocol ${protocolNumber}`,
        status: 'NOT_EVALUATED',
        reason: 'Handler not implemented',
      });
      continue;
    }

    // ── A-032: Circuit breaker check ──
    if (!shouldRunProtocol(protocolNumber)) {
      manifest.push({
        protocolNumber,
        protocolName: PROTOCOL_NAMES[protocolNumber] || `Protocol ${protocolNumber}`,
        status: 'NOT_EVALUATED',
        reason: `Circuit breaker tripped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`,
      });
      continue;
    }

    // ── Execute handler ──
    const handlerStart = Date.now();
    try {
      // CRITICAL: If HOLD was triggered by a prior protocol, switch remaining
      // protocols to detectionOnly mode. They still RUN — they still generate
      // AIS entries — but they take NO action (no state changes, no emails).
      const effectiveContext: ProtocolContext = holdRequired
        ? { ...context, detectionOnly: true }
        : context;

      const result = await handler(effectiveContext, supabase);
      const handlerDuration = Date.now() - handlerStart;
      recordProtocolSuccess(protocolNumber); // A-032: Reset circuit breaker on success

      results.push(result);

      if (result.triggered) {
        manifest.push({
          protocolNumber,
          protocolName: PROTOCOL_NAMES[protocolNumber] || `Protocol ${protocolNumber}`,
          status: 'EVALUATED_TRIGGERED',
          aisEntry: result.aisEntry || undefined,
        });

        // Set HOLD flag but do NOT short-circuit
        if (result.holdRequired && !holdRequired) {
          holdRequired = true;
          holdProtocol = protocolNumber;
          logger.info('protocol.dispatch.hold_triggered', {
            orderId: context.orderId,
            protocolNumber,
          });
        }
      } else {
        manifest.push({
          protocolNumber,
          protocolName: PROTOCOL_NAMES[protocolNumber] || `Protocol ${protocolNumber}`,
          status: 'EVALUATED_CLEAN',
        });
      }

      logger.info('protocol.dispatch.handler_completed', {
        orderId: context.orderId,
        phase: context.phase,
        protocolNumber,
        triggered: result.triggered,
        severity: result.severity,
        durationMs: handlerDuration,
      });

    } catch (error) {
      // ── Per-handler error isolation ──
      recordProtocolFailure(protocolNumber); // A-032: Track for circuit breaker
      const handlerDuration = Date.now() - handlerStart;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('protocol.dispatch.handler_error', {
        orderId: context.orderId,
        phase: context.phase,
        protocolNumber,
        error: errorMessage,
        durationMs: handlerDuration,
      });

      manifest.push({
        protocolNumber,
        protocolName: PROTOCOL_NAMES[protocolNumber] || `Protocol ${protocolNumber}`,
        status: 'NOT_EVALUATED',
        reason: `Dispatch error: ${errorMessage}`,
      });
      // Continue to next protocol — never let one handler crash the dispatch
    }
  }

  const totalDuration = Date.now() - dispatchStart;
  const triggeredCount = results.filter(r => r.triggered).length;

  logger.info('protocol.dispatch.completed', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    durationMs: totalDuration,
    triggeredCount,
    holdRequired,
  });

  return { results, manifest, holdRequired, holdProtocol };
}
