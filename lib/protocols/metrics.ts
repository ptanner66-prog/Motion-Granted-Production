// ============================================================
// lib/protocols/metrics.ts
// Protocol metric emission helpers (structured log-based)
// Source: D9 F-1 | SP-13 AR-1
// ============================================================

import { createLogger } from '../logging/logger';

const logger = createLogger('protocol-metrics');

export function emitProtocolMetric(
  metricName: string,
  value: number,
  tags: Record<string, string | number>
): void {
  try {
    logger.info(`metric.${metricName}`, {
      metric: metricName,
      value,
      ...tags,
    });
  } catch {
    // Metric emission should NEVER crash protocol evaluation
  }
}

export const ProtocolMetrics = {
  dispatchDuration: (protocolNumber: number, durationMs: number, orderId: string) =>
    emitProtocolMetric('protocol.dispatch.duration_ms', durationMs, { protocolNumber, orderId }),

  protocolTriggered: (protocolNumber: number, orderId: string, severity: string) =>
    emitProtocolMetric('protocol.dispatch.triggered', 1, { protocolNumber, orderId, severity }),

  holdTriggered: (protocolNumber: number, orderId: string) =>
    emitProtocolMetric('protocol.dispatch.hold_triggered', 1, { protocolNumber, orderId }),

  p7CumulativeCount: (orderId: string, failureCount: number, tier: string) =>
    emitProtocolMetric('protocol.p7.cumulative_count', failureCount, { orderId, tier }),

  p10Triggered: (orderId: string, triggerSource: string) =>
    emitProtocolMetric('protocol.p10.triggered', 1, { orderId, triggerSource }),

  rateLimiterUtilization: (source: string, utilizationPct: number) =>
    emitProtocolMetric('protocol.ratelimiter.utilization', utilizationPct, { source }),

  rateLimiterRejected: (source: string, orderId: string) =>
    emitProtocolMetric('protocol.ratelimiter.rejected', 1, { source, orderId }),

  aisEntriesPerOrder: (orderId: string, count: number) =>
    emitProtocolMetric('protocol.ais.entries_per_order', count, { orderId }),

  manifestNotEvaluated: (orderId: string, count: number) =>
    emitProtocolMetric('protocol.manifest.not_evaluated_count', count, { orderId }),

  persistenceConflict: (orderId: string, protocolNumber: number) =>
    emitProtocolMetric('protocol.persistence.conflict_count', 1, { orderId, protocolNumber }),

  flagsOverridesActive: (count: number) =>
    emitProtocolMetric('protocol.flags.overrides_active', count, {}),
};
