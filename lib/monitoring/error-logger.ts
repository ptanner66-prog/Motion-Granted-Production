/**
 * Error Logging & Alerting System (Task 61)
 *
 * Centralized error logging with alerting capabilities.
 *
 * Log Levels: DEBUG, INFO, WARN, ERROR, FATAL
 * Error Categories: WORKFLOW_ERROR, API_ERROR, PAYMENT_ERROR, CITATION_ERROR, SYSTEM_ERROR
 *
 * Alerting (via Resend email):
 * - FATAL errors: immediate email
 * - ERROR threshold: 5+ in 5 minutes → alert
 * - WORKFLOW_ERROR: always alert
 *
 * Source: Chunk 8, Task 61 - Code Mode Spec Section 23
 */

import { createClient } from '@/lib/supabase/server';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('monitoring-error-logger');
// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export type ErrorCategory =
  | 'WORKFLOW_ERROR'
  | 'API_ERROR'
  | 'PAYMENT_ERROR'
  | 'CITATION_ERROR'
  | 'SYSTEM_ERROR'
  | 'VALIDATION_ERROR'
  | 'DATABASE_ERROR'
  | 'AUTHENTICATION_ERROR';

export interface LogEntry {
  level: LogLevel;
  category?: ErrorCategory;
  message: string;
  orderId?: string;
  userId?: string;
  phase?: string;
  metadata?: Record<string, unknown>;
  error?: Error | unknown;
  stack?: string;
}

export interface StoredLogEntry {
  id: string;
  level: LogLevel;
  category: ErrorCategory | null;
  message: string;
  order_id: string | null;
  user_id: string | null;
  phase: string | null;
  metadata: Record<string, unknown> | null;
  stack_trace: string | null;
  created_at: string;
}

export interface AlertConfig {
  enabled: boolean;
  adminEmail: string;
  errorThreshold: number;
  errorWindowMinutes: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

const DEFAULT_MIN_LOG_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG';

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  enabled: process.env.NODE_ENV === 'production',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@motiongranted.com',
  errorThreshold: 5,
  errorWindowMinutes: 5,
};

// In-memory error tracking for threshold alerts
const recentErrors: Array<{ timestamp: number; category: ErrorCategory }> = [];
let lastAlertSent = 0;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between alerts

// ============================================================================
// LOGGER CLASS
// ============================================================================

class ErrorLogger {
  private minLogLevel: LogLevel;
  private alertConfig: AlertConfig;

  constructor() {
    this.minLogLevel = (process.env.LOG_LEVEL as LogLevel) || DEFAULT_MIN_LOG_LEVEL;
    this.alertConfig = {
      ...DEFAULT_ALERT_CONFIG,
      enabled: process.env.ALERTING_ENABLED === 'true' || DEFAULT_ALERT_CONFIG.enabled,
      adminEmail: process.env.ADMIN_ALERT_EMAIL || DEFAULT_ALERT_CONFIG.adminEmail,
    };
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log({ level: 'DEBUG', message, metadata });
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log({ level: 'INFO', message, metadata });
  }

  /**
   * Log a warning message
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log({ level: 'WARN', message, metadata });
  }

  /**
   * Log an error with optional category
   */
  error(
    message: string,
    options?: {
      category?: ErrorCategory;
      error?: Error | unknown;
      orderId?: string;
      userId?: string;
      phase?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    this.log({
      level: 'ERROR',
      message,
      category: options?.category,
      error: options?.error,
      orderId: options?.orderId,
      userId: options?.userId,
      phase: options?.phase,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a fatal error - triggers immediate alert
   */
  fatal(
    message: string,
    options?: {
      category?: ErrorCategory;
      error?: Error | unknown;
      orderId?: string;
      userId?: string;
      phase?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    this.log({
      level: 'FATAL',
      message,
      category: options?.category || 'SYSTEM_ERROR',
      error: options?.error,
      orderId: options?.orderId,
      userId: options?.userId,
      phase: options?.phase,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a workflow-specific error - always triggers alert
   */
  workflowError(
    message: string,
    options: {
      orderId: string;
      phase?: string;
      error?: Error | unknown;
      metadata?: Record<string, unknown>;
    }
  ): void {
    this.log({
      level: 'ERROR',
      category: 'WORKFLOW_ERROR',
      message,
      orderId: options.orderId,
      phase: options.phase,
      error: options.error,
      metadata: options.metadata,
    });
  }

  /**
   * Log an API error
   */
  apiError(
    message: string,
    options: {
      provider?: string;
      statusCode?: number;
      error?: Error | unknown;
      orderId?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    this.log({
      level: 'ERROR',
      category: 'API_ERROR',
      message,
      orderId: options.orderId,
      error: options.error,
      metadata: {
        ...options.metadata,
        provider: options.provider,
        statusCode: options.statusCode,
      },
    });
  }

  /**
   * Log a payment error
   */
  paymentError(
    message: string,
    options: {
      orderId?: string;
      stripeError?: string;
      error?: Error | unknown;
      metadata?: Record<string, unknown>;
    }
  ): void {
    this.log({
      level: 'ERROR',
      category: 'PAYMENT_ERROR',
      message,
      orderId: options.orderId,
      error: options.error,
      metadata: {
        ...options.metadata,
        stripeError: options.stripeError,
      },
    });
  }

  /**
   * Log a citation error
   */
  citationError(
    message: string,
    options: {
      orderId?: string;
      citation?: string;
      verificationStatus?: string;
      error?: Error | unknown;
      metadata?: Record<string, unknown>;
    }
  ): void {
    this.log({
      level: 'ERROR',
      category: 'CITATION_ERROR',
      message,
      orderId: options.orderId,
      error: options.error,
      metadata: {
        ...options.metadata,
        citation: options.citation,
        verificationStatus: options.verificationStatus,
      },
    });
  }

  /**
   * Core logging function
   */
  private log(entry: LogEntry): void {
    // Check if we should log based on level
    if (LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[this.minLogLevel]) {
      return;
    }

    // Extract stack trace if error provided
    let stack: string | undefined;
    if (entry.error instanceof Error) {
      stack = entry.error.stack;
    }

    // Format for console
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${entry.level}]`;
    const categoryStr = entry.category ? ` [${entry.category}]` : '';
    const orderStr = entry.orderId ? ` [Order: ${entry.orderId.slice(0, 8)}]` : '';
    const phaseStr = entry.phase ? ` [Phase: ${entry.phase}]` : '';

    const consoleMessage = `${prefix}${categoryStr}${orderStr}${phaseStr} ${entry.message}`;

    // Log to console
    switch (entry.level) {
      case 'DEBUG':
        log.debug(consoleMessage, entry.metadata || '');
        break;
      case 'INFO':
        log.info(consoleMessage, entry.metadata || '');
        break;
      case 'WARN':
        log.warn(consoleMessage, entry.metadata || '');
        break;
      case 'ERROR':
      case 'FATAL':
        log.error(consoleMessage, { metadata: entry.metadata || '', stack: stack || '' });
        break;
    }

    // Store in database for ERROR and FATAL
    if (entry.level === 'ERROR' || entry.level === 'FATAL') {
      this.storeLog(entry, stack).catch((err) => {
        log.error('[ErrorLogger] Failed to store log:', err);
      });

      // Track for threshold alerting
      if (entry.category) {
        this.trackError(entry.category);
      }

      // Check alerting conditions
      this.checkAlertConditions(entry, stack);
    }
  }

  /**
   * Store log entry in database
   */
  private async storeLog(entry: LogEntry, stack?: string): Promise<void> {
    try {
      const supabase = await createClient();

      await supabase.from('error_log').insert({
        level: entry.level,
        category: entry.category || null,
        message: entry.message,
        order_id: entry.orderId || null,
        user_id: entry.userId || null,
        phase: entry.phase || null,
        metadata: entry.metadata || null,
        stack_trace: stack || null,
      });
    } catch (error) {
      // Don't throw - just log to console
      log.error('[ErrorLogger] Database insert failed:', error);
    }
  }

  /**
   * Track error for threshold alerting
   */
  private trackError(category: ErrorCategory): void {
    const now = Date.now();
    recentErrors.push({ timestamp: now, category });

    // Clean up old entries
    const windowStart = now - this.alertConfig.errorWindowMinutes * 60 * 1000;
    while (recentErrors.length > 0 && recentErrors[0].timestamp < windowStart) {
      recentErrors.shift();
    }
  }

  /**
   * Check if alerting conditions are met
   */
  private checkAlertConditions(entry: LogEntry, stack?: string): void {
    if (!this.alertConfig.enabled) {
      return;
    }

    const now = Date.now();

    // FATAL errors: immediate alert
    if (entry.level === 'FATAL') {
      this.sendAlert(entry, stack, 'FATAL ERROR');
      return;
    }

    // WORKFLOW_ERROR: always alert
    if (entry.category === 'WORKFLOW_ERROR') {
      this.sendAlert(entry, stack, 'Workflow Error');
      return;
    }

    // Check threshold: 5+ errors in 5 minutes
    if (
      recentErrors.length >= this.alertConfig.errorThreshold &&
      now - lastAlertSent > ALERT_COOLDOWN_MS
    ) {
      this.sendThresholdAlert();
    }
  }

  /**
   * Send alert email
   */
  private async sendAlert(
    entry: LogEntry,
    stack?: string,
    alertType: string = 'Error'
  ): Promise<void> {
    const now = Date.now();

    // Check cooldown (except for FATAL)
    if (entry.level !== 'FATAL' && now - lastAlertSent < ALERT_COOLDOWN_MS) {
      return;
    }

    lastAlertSent = now;

    try {
      // Import sendEmail dynamically to avoid circular deps
      const { sendAlertEmail } = await import('./alert-sender');

      await sendAlertEmail({
        to: this.alertConfig.adminEmail,
        subject: `[Motion Granted] ${alertType}: ${entry.message.slice(0, 50)}`,
        level: entry.level,
        category: entry.category,
        message: entry.message,
        orderId: entry.orderId,
        phase: entry.phase,
        metadata: entry.metadata,
        stack,
      });
    } catch (error) {
      log.error('[ErrorLogger] Failed to send alert:', error);
    }
  }

  /**
   * Send threshold-based alert
   */
  private async sendThresholdAlert(): Promise<void> {
    lastAlertSent = Date.now();

    // Count by category
    const categoryCounts: Record<string, number> = {};
    for (const error of recentErrors) {
      categoryCounts[error.category] = (categoryCounts[error.category] || 0) + 1;
    }

    try {
      const { sendAlertEmail } = await import('./alert-sender');

      await sendAlertEmail({
        to: this.alertConfig.adminEmail,
        subject: `[Motion Granted] Error Threshold Alert: ${recentErrors.length} errors in ${this.alertConfig.errorWindowMinutes} minutes`,
        level: 'ERROR',
        message: `Error threshold exceeded: ${recentErrors.length} errors in the last ${this.alertConfig.errorWindowMinutes} minutes`,
        metadata: {
          errorCount: recentErrors.length,
          categoryCounts,
          windowMinutes: this.alertConfig.errorWindowMinutes,
        },
      });
    } catch (error) {
      log.error('[ErrorLogger] Failed to send threshold alert:', error);
    }
  }

  /**
   * Get recent errors from database
   */
  async getRecentErrors(options?: {
    limit?: number;
    level?: LogLevel;
    category?: ErrorCategory;
    orderId?: string;
    since?: Date;
  }): Promise<StoredLogEntry[]> {
    try {
      const supabase = await createClient();

      let query = supabase
        .from('error_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(options?.limit || 100);

      if (options?.level) {
        query = query.eq('level', options.level);
      }

      if (options?.category) {
        query = query.eq('category', options.category);
      }

      if (options?.orderId) {
        query = query.eq('order_id', options.orderId);
      }

      if (options?.since) {
        query = query.gte('created_at', options.since.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        log.error('[ErrorLogger] Failed to fetch errors:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      log.error('[ErrorLogger] Failed to fetch errors:', error);
      return [];
    }
  }

  /**
   * Get error statistics
   */
  async getErrorStats(since: Date): Promise<{
    total: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<string, number>;
    byHour: Array<{ hour: string; count: number }>;
  }> {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('error_log')
        .select('level, category, created_at')
        .gte('created_at', since.toISOString());

      if (error || !data) {
        return {
          total: 0,
          byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 },
          byCategory: {},
          byHour: [],
        };
      }

      const byLevel: Record<LogLevel, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
      const byCategory: Record<string, number> = {};
      const byHour: Record<string, number> = {};

      for (const entry of data) {
        // Count by level
        byLevel[entry.level as LogLevel] = (byLevel[entry.level as LogLevel] || 0) + 1;

        // Count by category
        if (entry.category) {
          byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
        }

        // Count by hour
        const hour = new Date(entry.created_at).toISOString().slice(0, 13);
        byHour[hour] = (byHour[hour] || 0) + 1;
      }

      return {
        total: data.length,
        byLevel,
        byCategory,
        byHour: Object.entries(byHour)
          .map(([hour, count]) => ({ hour, count }))
          .sort((a, b) => a.hour.localeCompare(b.hour)),
      };
    } catch (error) {
      log.error('[ErrorLogger] Failed to get stats:', error);
      return {
        total: 0,
        byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 },
        byCategory: {},
        byHour: [],
      };
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const logger = new ErrorLogger();

// Convenience exports for direct use
export const { debug, info, warn, error, fatal, workflowError, apiError, paymentError, citationError } =
  logger;

export default logger;
