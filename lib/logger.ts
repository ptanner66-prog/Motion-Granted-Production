/**
 * Structured Logging System
 *
 * A8-T12 (LCV-TS-026): Consolidated with lib/security/logger.ts.
 * The canonical PII-safe logger lives in lib/security/logger.ts (289 consumers).
 * This file provides the enhanced Logger class with child contexts,
 * timing, audit, and metric helpers.
 *
 * Both loggers are accessible from either import path:
 *   import { createLogger } from '@/lib/logger';        // re-export from canonical
 *   import { createLogger } from '@/lib/security/logger'; // canonical
 *   import { logger, Logger } from '@/lib/logger';       // enhanced Logger class
 *
 * Production-grade logging with:
 * - Structured JSON output for log aggregation
 * - Log levels with filtering
 * - Request context tracking
 * - Performance timing
 * - Error stack traces
 * - PII redaction
 *
 * Compatible with Vercel Logs, Datadog, Logtail, etc.
 */

// Re-export the canonical PII-safe createLogger so consumers can use either import path
export { createLogger } from '@/lib/security/logger';

import { createLogger as _createLogger } from '@/lib/security/logger';

const log = _createLogger('logger');

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  requestId?: string;
  userId?: string;
  orderId?: string;
  workflowId?: string;
  phase?: string;
  action?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const MIN_LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const SERVICE_NAME = 'motion-granted';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// PII fields to redact
const PII_FIELDS = [
  'email',
  'phone',
  'ssn',
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'credit_card',
  'creditCard',
];

// ============================================================================
// UTILITIES
// ============================================================================

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

function redactPII(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Redact email-like patterns
    if (obj.includes('@') && obj.includes('.')) {
      return '[REDACTED_EMAIL]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactPII(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (PII_FIELDS.some(pii => lowerKey.includes(pii.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactPII(value, depth + 1);
      }
    }
    return result;
  }

  return obj;
}

function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: ENVIRONMENT === 'production' ? undefined : error.stack,
    };
  }

  return {
    name: 'Unknown',
    message: String(error),
  };
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
  metadata?: Record<string, unknown>
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    context: context ? redactPII(context) as LogContext : undefined,
    error: formatError(error),
    metadata: metadata ? redactPII(metadata) as Record<string, unknown> : undefined,
  };
}

function outputLog(entry: LogEntry): void {
  const jsonLog = JSON.stringify(entry);

  switch (entry.level) {
    case 'debug':
      log.debug(jsonLog);
      break;
    case 'info':
      log.info(jsonLog);
      break;
    case 'warn':
      log.warn(jsonLog);
      break;
    case 'error':
    case 'fatal':
      log.error(jsonLog);
      break;
  }
}

// ============================================================================
// LOGGER CLASS
// ============================================================================

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Log at debug level
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    if (!shouldLog('debug')) return;
    outputLog(createLogEntry('debug', message, this.context, undefined, metadata));
  }

  /**
   * Log at info level
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    if (!shouldLog('info')) return;
    outputLog(createLogEntry('info', message, this.context, undefined, metadata));
  }

  /**
   * Log at warn level
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    if (!shouldLog('warn')) return;
    outputLog(createLogEntry('warn', message, this.context, undefined, metadata));
  }

  /**
   * Log at error level
   */
  error(message: string, error?: unknown, metadata?: Record<string, unknown>): void {
    if (!shouldLog('error')) return;
    outputLog(createLogEntry('error', message, this.context, error, metadata));
  }

  /**
   * Log at fatal level
   */
  fatal(message: string, error?: unknown, metadata?: Record<string, unknown>): void {
    if (!shouldLog('fatal')) return;
    outputLog(createLogEntry('fatal', message, this.context, error, metadata));
  }

  /**
   * Time an async operation
   */
  async time<T>(
    label: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const start = performance.now();

    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);

      this.info(`${label} completed`, { ...metadata, duration });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);

      this.error(`${label} failed`, error, { ...metadata, duration });
      throw error;
    }
  }

  /**
   * Log an API request
   */
  request(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    if (!shouldLog(level)) return;

    outputLog(createLogEntry(level, `${method} ${path} ${statusCode}`, this.context, undefined, {
      ...metadata,
      method,
      path,
      statusCode,
      duration: durationMs,
    }));
  }

  /**
   * Log a workflow event
   */
  workflow(
    event: string,
    phase?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.info(`Workflow: ${event}`, {
      ...metadata,
      workflowEvent: event,
      phase,
    });
  }

  /**
   * Log a payment event
   */
  payment(
    event: string,
    amount?: number,
    metadata?: Record<string, unknown>
  ): void {
    this.info(`Payment: ${event}`, {
      ...metadata,
      paymentEvent: event,
      amount,
    });
  }

  /**
   * Log an AI/Claude event
   */
  ai(
    event: string,
    model?: string,
    tokens?: { input?: number; output?: number },
    metadata?: Record<string, unknown>
  ): void {
    this.info(`AI: ${event}`, {
      ...metadata,
      aiEvent: event,
      model,
      inputTokens: tokens?.input,
      outputTokens: tokens?.output,
    });
  }
}

// ============================================================================
// DEFAULT LOGGER INSTANCE
// ============================================================================

export const logger = new Logger();

// ============================================================================
// REQUEST CONTEXT MIDDLEWARE HELPER
// ============================================================================

let requestIdCounter = 0;

export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (requestIdCounter++).toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${counter}-${random}`;
}

/**
 * Create a logger for a specific request
 */
export function createRequestLogger(
  requestId: string,
  userId?: string,
  additionalContext?: LogContext
): Logger {
  return new Logger({
    requestId,
    userId,
    ...additionalContext,
  });
}

// ============================================================================
// WORKFLOW LOGGER FACTORY
// ============================================================================

/**
 * Create a logger for workflow operations
 */
export function createWorkflowLogger(
  orderId: string,
  workflowId: string,
  phase?: string
): Logger {
  return new Logger({
    orderId,
    workflowId,
    phase,
    action: 'workflow',
  });
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export interface AuditEvent {
  action: string;
  resource: string;
  resourceId: string;
  userId?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event (always logged regardless of level)
 */
export function audit(event: AuditEvent): void {
  const entry = createLogEntry('info', `Audit: ${event.action} on ${event.resource}`, {
    userId: event.userId,
    action: 'audit',
  }, undefined, {
    auditAction: event.action,
    resource: event.resource,
    resourceId: event.resourceId,
    changes: event.changes,
    ...event.metadata,
  });

  outputLog(entry);
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

export interface MetricEvent {
  name: string;
  value: number;
  unit: 'ms' | 'count' | 'bytes' | 'percent';
  tags?: Record<string, string>;
}

/**
 * Log a metric event
 */
export function metric(event: MetricEvent): void {
  if (!shouldLog('info')) return;

  const entry = createLogEntry('info', `Metric: ${event.name}`, {
    action: 'metric',
  }, undefined, {
    metricName: event.name,
    metricValue: event.value,
    metricUnit: event.unit,
    metricTags: event.tags,
  });

  outputLog(entry);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default logger;
