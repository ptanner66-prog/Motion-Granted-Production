/**
 * Monitoring Module Index
 *
 * Central export for error logging and metrics collection.
 *
 * Source: Chunk 8, Tasks 61-62
 */

export { logger, debug, info, warn, error, fatal, workflowError, apiError, paymentError, citationError } from './error-logger';
export type { LogLevel, ErrorCategory, LogEntry, StoredLogEntry, AlertConfig } from './error-logger';

export { metrics, record, recordPhaseDuration, recordApiLatency, recordDocumentGeneration, recordCitationVerification, recordRevision, recordTotalWorkflowTime, recordQueueWaitTime, recordCheckpointDuration, flush, getAggregatedMetrics, getWorkflowPerformance, getSystemMetricsSummary } from './metrics-collector';
export type { MetricType, MetricEntry, StoredMetric, AggregatedMetrics, WorkflowPerformance } from './metrics-collector';

export { sendAlertEmail } from './alert-sender';
export type { AlertEmailInput } from './alert-sender';
