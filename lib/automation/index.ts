/**
 * Motion Granted Automation System
 *
 * This module provides a comprehensive AI-powered workflow automation system
 * for the Motion Granted legal motion drafting service.
 *
 * Modules:
 * - Claude AI Integration: AI-powered analysis for conflicts, assignments, QA
 * - Conflict Checker: Automated conflict of interest detection
 * - Clerk Assigner: Smart workload-based clerk assignment
 * - Notification Sender: Email notification queue with retry logic
 * - QA Checker: Automated quality assurance for deliverables
 * - Report Generator: Daily/weekly automated reports
 * - Task Processor: Background job processing system
 */

// Claude AI Integration
export {
  anthropic,
  isClaudeConfigured,
  SYSTEM_PROMPTS,
  callClaude,
  analyzeConflicts,
  recommendClerkAssignment,
  analyzeDocumentQA,
  generateReportSummary,
  runAnalysis,
  calculateSimilarity,
  normalizePartyName,
} from './claude';

// Conflict Checking
export {
  runConflictCheck,
  clearConflicts,
  flagConflict,
  getConflictMatches,
} from './conflict-checker';

// Clerk Assignment
export {
  runClerkAssignment,
  assignClerk,
  unassignClerk,
  getAssignmentCandidates,
} from './clerk-assigner';

// Notification System
export {
  queueNotification,
  queueOrderNotification,
  processNotificationQueue,
  cancelNotification,
  getNotificationQueueStatus,
} from './notification-sender';

// QA Checking
export {
  runQACheck,
  overrideQACheck,
  getQAHistory,
} from './qa-checker';

// Report Generation
export {
  generateDailyReport,
  generateWeeklyReport,
  sendDailyReport,
  sendWeeklyReport,
  getDashboardStats,
} from './report-generator';

// Task Processing
export {
  processTasks,
  scheduleTask,
  cancelTask,
  getTaskStatus,
  scheduleRecurringTasks,
} from './task-processor';

// Re-export types
export type {
  // Claude types
  ConflictAnalysisInput,
  ConflictAnalysisOutput,
  ClerkAssignmentInput,
  ClerkAssignmentOutput,
  QAAnalysisInput,
  QAAnalysisOutput,
  ReportSummaryInput,
  ReportSummaryOutput,
} from './claude';
