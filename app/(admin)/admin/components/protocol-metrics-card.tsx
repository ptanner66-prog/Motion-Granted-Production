// ============================================================
// app/(admin)/admin/components/protocol-metrics-card.tsx
// Admin dashboard card for protocol dispatch observability
// Source: D9 F-1 | SP-13 AR-1
//
// Data source for launch: Supabase query against protocol_results
// grouped by protocol_number. Structured log metrics provide
// additional telemetry for monitoring dashboards.
// ============================================================

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ProtocolMetricRow {
  protocol_number: number;
  trigger_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
}

interface ProtocolMetricsCardProps {
  /** Time window in hours for metrics (default: 24) */
  windowHours?: number;
}

export function ProtocolMetricsCard({ windowHours = 24 }: ProtocolMetricsCardProps) {
  const [metrics, setMetrics] = useState<ProtocolMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flagOverrides, setFlagOverrides] = useState(0);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const supabase = createClient();
        const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

        // Query protocol_results grouped by protocol_number
        const { data, error: queryError } = await supabase
          .from('protocol_results')
          .select('protocol_number, triggered, severity')
          .gte('created_at', since);

        if (queryError) {
          setError(queryError.message);
          return;
        }

        // Aggregate in client
        const byProtocol = new Map<number, ProtocolMetricRow>();
        for (const row of data || []) {
          const existing = byProtocol.get(row.protocol_number) || {
            protocol_number: row.protocol_number,
            trigger_count: 0,
            critical_count: 0,
            warning_count: 0,
            info_count: 0,
          };

          if (row.triggered) {
            existing.trigger_count++;
            if (row.severity === 'CRITICAL') existing.critical_count++;
            else if (row.severity === 'WARNING') existing.warning_count++;
            else if (row.severity === 'INFO') existing.info_count++;
          }

          byProtocol.set(row.protocol_number, existing);
        }

        setMetrics(
          Array.from(byProtocol.values()).sort((a, b) => b.trigger_count - a.trigger_count)
        );

        // Check feature flag overrides
        const envDisabled = process.env.NEXT_PUBLIC_DISABLED_PROTOCOLS || '';
        const overrideCount = envDisabled
          ? envDisabled.split(',').filter(s => s.trim()).length
          : 0;
        setFlagOverrides(overrideCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, [windowHours]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-[#1e3a5f]">Protocol Metrics</h3>
        <p className="mt-2 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-lg font-semibold text-red-800">Protocol Metrics</h3>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  const totalTriggers = metrics.reduce((sum, m) => sum + m.trigger_count, 0);
  const totalCritical = metrics.reduce((sum, m) => sum + m.critical_count, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1e3a5f]">Protocol Metrics</h3>
        <span className="text-xs text-gray-500">Last {windowHours}h</span>
      </div>

      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-[#1e3a5f]">{totalTriggers}</p>
          <p className="text-xs text-gray-500">Total Triggers</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl font-bold ${totalCritical > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {totalCritical}
          </p>
          <p className="text-xs text-gray-500">Critical</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl font-bold ${flagOverrides > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {flagOverrides}
          </p>
          <p className="text-xs text-gray-500">Flag Overrides</p>
        </div>
      </div>

      {/* Per-protocol breakdown */}
      {metrics.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Top Triggered Protocols</p>
          <div className="space-y-1">
            {metrics.slice(0, 5).map(m => (
              <div key={m.protocol_number} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">P{m.protocol_number}</span>
                <div className="flex gap-2">
                  {m.critical_count > 0 && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                      {m.critical_count} crit
                    </span>
                  )}
                  {m.warning_count > 0 && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                      {m.warning_count} warn
                    </span>
                  )}
                  {m.info_count > 0 && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                      {m.info_count} info
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.length === 0 && (
        <p className="mt-4 text-sm text-gray-500 text-center">No protocol results in this window.</p>
      )}
    </div>
  );
}
