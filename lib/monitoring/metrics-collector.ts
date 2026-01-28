/**
 * Workflow Metrics Collection (Task 62)
 *
 * Collects and stores performance metrics for workflow monitoring.
 *
 * Metrics collected:
 * - Workflow phase durations
 * - API call latencies
 * - Document generation times
 * - Citation verification stats
 * - Revision counts
 * - Error rates
 *
 * Source: Chunk 8, Task 62 - Code Mode Spec Section 24
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export type MetricType =
  | 'workflow_phase_duration'
  | 'api_call_latency'
  | 'document_generation_time'
  | 'citation_verification'
  | 'revision_loop'
  | 'total_workflow_time'
  | 'queue_wait_time'
  | 'checkpoint_duration'
  | 'file_upload_time'
  | 'file_download_time';

export interface MetricEntry {
  type: MetricType;
  value: number;
  unit: 'ms' | 'seconds' | 'count' | 'percentage';
  orderId?: string;
  phase?: string;
  tier?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredMetric {
  id: string;
  metric_type: MetricType;
  metric_value: number;
  metric_unit: string;
  order_id: string | null;
  phase: string | null;
  tier: string | null;
  provider: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AggregatedMetrics {
  metricType: MetricType;
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p99: number;
}

export interface WorkflowPerformance {
  orderId: string;
  totalDurationMs: number;
  phaseBreakdown: Array<{
    phase: string;
    durationMs: number;
    startedAt: string;
    completedAt: string | null;
  }>;
  apiCalls: number;
  totalApiLatencyMs: number;
  revisionCount: number;
  citationsVerified: number;
  citationsFailed: number;
}

// ============================================================================
// METRIC COLLECTOR CLASS
// ============================================================================

class MetricsCollector {
  private buffer: MetricEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 10000; // 10 seconds

  constructor() {
    // Auto-flush buffer periodically
    if (typeof setInterval !== 'undefined') {
      this.flushInterval = setInterval(() => {
        this.flush().catch((err) => {
          console.error('[MetricsCollector] Flush error:', err);
        });
      }, this.FLUSH_INTERVAL_MS);
    }
  }

  /**
   * Record a metric
   */
  record(entry: MetricEntry): void {
    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.BUFFER_SIZE) {
      this.flush().catch((err) => {
        console.error('[MetricsCollector] Flush error:', err);
      });
    }
  }

  /**
   * Record workflow phase duration
   */
  recordPhaseDuration(
    orderId: string,
    phase: string,
    durationMs: number,
    tier?: string
  ): void {
    this.record({
      type: 'workflow_phase_duration',
      value: durationMs,
      unit: 'ms',
      orderId,
      phase,
      tier,
    });
  }

  /**
   * Record API call latency
   */
  recordApiLatency(
    provider: string,
    latencyMs: number,
    options?: {
      orderId?: string;
      phase?: string;
      endpoint?: string;
      statusCode?: number;
    }
  ): void {
    this.record({
      type: 'api_call_latency',
      value: latencyMs,
      unit: 'ms',
      orderId: options?.orderId,
      phase: options?.phase,
      provider,
      metadata: {
        endpoint: options?.endpoint,
        statusCode: options?.statusCode,
      },
    });
  }

  /**
   * Record document generation time
   */
  recordDocumentGeneration(
    orderId: string,
    documentType: string,
    durationMs: number,
    phase?: string
  ): void {
    this.record({
      type: 'document_generation_time',
      value: durationMs,
      unit: 'ms',
      orderId,
      phase,
      metadata: { documentType },
    });
  }

  /**
   * Record citation verification result
   */
  recordCitationVerification(
    orderId: string,
    verified: number,
    failed: number,
    flagged: number
  ): void {
    this.record({
      type: 'citation_verification',
      value: verified,
      unit: 'count',
      orderId,
      metadata: { verified, failed, flagged, total: verified + failed + flagged },
    });
  }

  /**
   * Record revision loop
   */
  recordRevision(
    orderId: string,
    revisionNumber: number,
    reason: string
  ): void {
    this.record({
      type: 'revision_loop',
      value: revisionNumber,
      unit: 'count',
      orderId,
      metadata: { reason },
    });
  }

  /**
   * Record total workflow time
   */
  recordTotalWorkflowTime(
    orderId: string,
    durationMs: number,
    tier?: string
  ): void {
    this.record({
      type: 'total_workflow_time',
      value: durationMs,
      unit: 'ms',
      orderId,
      tier,
    });
  }

  /**
   * Record queue wait time
   */
  recordQueueWaitTime(
    orderId: string,
    waitMs: number
  ): void {
    this.record({
      type: 'queue_wait_time',
      value: waitMs,
      unit: 'ms',
      orderId,
    });
  }

  /**
   * Record checkpoint duration
   */
  recordCheckpointDuration(
    orderId: string,
    checkpoint: string,
    durationMs: number
  ): void {
    this.record({
      type: 'checkpoint_duration',
      value: durationMs,
      unit: 'ms',
      orderId,
      metadata: { checkpoint },
    });
  }

  /**
   * Flush buffer to database
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const supabase = await createClient();

      const rows = entries.map((entry) => ({
        metric_type: entry.type,
        metric_value: entry.value,
        metric_unit: entry.unit,
        order_id: entry.orderId || null,
        phase: entry.phase || null,
        tier: entry.tier || null,
        provider: entry.provider || null,
        metadata: entry.metadata || null,
      }));

      const { error } = await supabase.from('workflow_metrics').insert(rows);

      if (error) {
        console.error('[MetricsCollector] Insert error:', error);
        // Re-add to buffer for retry
        this.buffer.push(...entries);
      }
    } catch (error) {
      console.error('[MetricsCollector] Flush failed:', error);
      // Re-add to buffer for retry
      this.buffer.push(...entries);
    }
  }

  /**
   * Get aggregated metrics for a time period
   */
  async getAggregatedMetrics(
    metricType: MetricType,
    since: Date,
    options?: {
      tier?: string;
      provider?: string;
      phase?: string;
    }
  ): Promise<AggregatedMetrics | null> {
    try {
      const supabase = await createClient();

      let query = supabase
        .from('workflow_metrics')
        .select('metric_value')
        .eq('metric_type', metricType)
        .gte('created_at', since.toISOString())
        .order('metric_value', { ascending: true });

      if (options?.tier) {
        query = query.eq('tier', options.tier);
      }

      if (options?.provider) {
        query = query.eq('provider', options.provider);
      }

      if (options?.phase) {
        query = query.eq('phase', options.phase);
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        return null;
      }

      const values = data.map((d: any) => d.metric_value);
      const count = values.length;
      const sum = values.reduce((a: number, b: number) => a + b, 0);

      return {
        metricType,
        count,
        min: values[0],
        max: values[count - 1],
        avg: sum / count,
        p50: values[Math.floor(count * 0.5)],
        p90: values[Math.floor(count * 0.9)],
        p99: values[Math.floor(count * 0.99)],
      };
    } catch (error) {
      console.error('[MetricsCollector] Aggregation error:', error);
      return null;
    }
  }

  /**
   * Get workflow performance breakdown
   */
  async getWorkflowPerformance(orderId: string): Promise<WorkflowPerformance | null> {
    try {
      const supabase = await createClient();

      // Get all metrics for this order
      const { data: metrics, error: metricsError } = await supabase
        .from('workflow_metrics')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (metricsError || !metrics) {
        return null;
      }

      // Get workflow state for additional info
      const { data: workflowState } = await supabase
        .from('order_workflow_state')
        .select('*')
        .eq('order_id', orderId)
        .single();

      // Calculate totals
      const phaseDurations = metrics.filter((m: any) => m.metric_type === 'workflow_phase_duration');
      const apiLatencies = metrics.filter((m: any) => m.metric_type === 'api_call_latency');
      const revisions = metrics.filter((m: any) => m.metric_type === 'revision_loop');
      const citations = metrics.find((m: any) => m.metric_type === 'citation_verification');

      const totalWorkflowMetric = metrics.find((m: any) => m.metric_type === 'total_workflow_time');
      const totalDurationMs = totalWorkflowMetric?.metric_value ||
        phaseDurations.reduce((sum: number, m: any) => sum + m.metric_value, 0);

      return {
        orderId,
        totalDurationMs,
        phaseBreakdown: phaseDurations.map((m: any) => ({
          phase: m.phase || 'unknown',
          durationMs: m.metric_value,
          startedAt: m.created_at,
          completedAt: null, // Would need to track this separately
        })),
        apiCalls: apiLatencies.length,
        totalApiLatencyMs: apiLatencies.reduce((sum: number, m: any) => sum + m.metric_value, 0),
        revisionCount: revisions.length > 0 ? Math.max(...revisions.map((r: any) => r.metric_value)) : 0,
        citationsVerified: (citations?.metadata as Record<string, number>)?.verified || 0,
        citationsFailed: (citations?.metadata as Record<string, number>)?.failed || 0,
      };
    } catch (error) {
      console.error('[MetricsCollector] Performance query error:', error);
      return null;
    }
  }

  /**
   * Get system-wide metrics summary
   */
  async getSystemMetricsSummary(since: Date): Promise<{
    totalOrders: number;
    avgWorkflowTimeMs: number;
    avgApiLatencyMs: number;
    totalRevisions: number;
    citationVerificationRate: number;
    metricsByTier: Record<string, { count: number; avgTimeMs: number }>;
    apiLatencyByProvider: Record<string, { count: number; avgMs: number }>;
  }> {
    try {
      const supabase = await createClient();

      // Get workflow time metrics
      const { data: workflowMetrics } = await supabase
        .from('workflow_metrics')
        .select('*')
        .eq('metric_type', 'total_workflow_time')
        .gte('created_at', since.toISOString());

      // Get API latency metrics
      const { data: apiMetrics } = await supabase
        .from('workflow_metrics')
        .select('*')
        .eq('metric_type', 'api_call_latency')
        .gte('created_at', since.toISOString());

      // Get revision metrics
      const { data: revisionMetrics } = await supabase
        .from('workflow_metrics')
        .select('*')
        .eq('metric_type', 'revision_loop')
        .gte('created_at', since.toISOString());

      // Get citation metrics
      const { data: citationMetrics } = await supabase
        .from('workflow_metrics')
        .select('*')
        .eq('metric_type', 'citation_verification')
        .gte('created_at', since.toISOString());

      // Calculate averages
      const workflowTimes = workflowMetrics?.map((m: any) => m.metric_value) || [];
      const avgWorkflowTimeMs = workflowTimes.length > 0
        ? workflowTimes.reduce((a: number, b: number) => a + b, 0) / workflowTimes.length
        : 0;

      const apiLatencies = apiMetrics?.map((m: any) => m.metric_value) || [];
      const avgApiLatencyMs = apiLatencies.length > 0
        ? apiLatencies.reduce((a: number, b: number) => a + b, 0) / apiLatencies.length
        : 0;

      // Calculate by tier
      const metricsByTier: Record<string, { count: number; avgTimeMs: number }> = {};
      for (const metric of workflowMetrics || []) {
        const tier = metric.tier || 'unknown';
        if (!metricsByTier[tier]) {
          metricsByTier[tier] = { count: 0, avgTimeMs: 0 };
        }
        metricsByTier[tier].count++;
        metricsByTier[tier].avgTimeMs += metric.metric_value;
      }
      for (const tier of Object.keys(metricsByTier)) {
        metricsByTier[tier].avgTimeMs /= metricsByTier[tier].count;
      }

      // Calculate by provider
      const apiLatencyByProvider: Record<string, { count: number; avgMs: number }> = {};
      for (const metric of apiMetrics || []) {
        const provider = metric.provider || 'unknown';
        if (!apiLatencyByProvider[provider]) {
          apiLatencyByProvider[provider] = { count: 0, avgMs: 0 };
        }
        apiLatencyByProvider[provider].count++;
        apiLatencyByProvider[provider].avgMs += metric.metric_value;
      }
      for (const provider of Object.keys(apiLatencyByProvider)) {
        apiLatencyByProvider[provider].avgMs /= apiLatencyByProvider[provider].count;
      }

      // Calculate citation verification rate
      let totalVerified = 0;
      let totalCitations = 0;
      for (const metric of citationMetrics || []) {
        const metadata = metric.metadata as Record<string, number>;
        if (metadata) {
          totalVerified += metadata.verified || 0;
          totalCitations += metadata.total || 0;
        }
      }
      const citationVerificationRate = totalCitations > 0 ? totalVerified / totalCitations : 0;

      return {
        totalOrders: new Set(workflowMetrics?.map((m: any) => m.order_id)).size,
        avgWorkflowTimeMs,
        avgApiLatencyMs,
        totalRevisions: revisionMetrics?.length || 0,
        citationVerificationRate,
        metricsByTier,
        apiLatencyByProvider,
      };
    } catch (error) {
      console.error('[MetricsCollector] Summary error:', error);
      return {
        totalOrders: 0,
        avgWorkflowTimeMs: 0,
        avgApiLatencyMs: 0,
        totalRevisions: 0,
        citationVerificationRate: 0,
        metricsByTier: {},
        apiLatencyByProvider: {},
      };
    }
  }

  /**
   * Clean up old metrics
   */
  async cleanupOldMetrics(olderThan: Date): Promise<number> {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('workflow_metrics')
        .delete()
        .lt('created_at', olderThan.toISOString())
        .select('id');

      if (error) {
        console.error('[MetricsCollector] Cleanup error:', error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('[MetricsCollector] Cleanup error:', error);
      return 0;
    }
  }

  /**
   * Stop the collector (cleanup)
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Final flush
    this.flush().catch((err) => {
      console.error('[MetricsCollector] Final flush error:', err);
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const metrics = new MetricsCollector();

// Convenience exports
export const {
  record,
  recordPhaseDuration,
  recordApiLatency,
  recordDocumentGeneration,
  recordCitationVerification,
  recordRevision,
  recordTotalWorkflowTime,
  recordQueueWaitTime,
  recordCheckpointDuration,
  flush,
  getAggregatedMetrics,
  getWorkflowPerformance,
  getSystemMetricsSummary,
} = metrics;

export default metrics;
