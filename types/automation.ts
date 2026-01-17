/**
 * Motion Granted Automation System Types
 *
 * This file contains all TypeScript interfaces and types for the
 * AI-powered workflow automation system.
 */

// ============================================================================
// ACTION TYPES
// ============================================================================

export type AutomationActionType =
  | 'payment_processed'
  | 'payment_failed'
  | 'conflict_check_started'
  | 'conflict_check_completed'
  | 'conflict_detected'
  | 'conflict_cleared'
  | 'clerk_assignment_started'
  | 'clerk_assigned'
  | 'notification_queued'
  | 'notification_sent'
  | 'notification_failed'
  | 'qa_check_started'
  | 'qa_check_passed'
  | 'qa_check_failed'
  | 'status_changed'
  | 'deadline_alert'
  | 'report_generated'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_denied'
  | 'task_scheduled'
  | 'task_completed'
  | 'task_failed'
  | 'refund_processed'
  | 'revision_requested'
  | 'revision_completed';

export type TaskType =
  | 'conflict_check'
  | 'clerk_assignment'
  | 'send_notification'
  | 'qa_check'
  | 'deadline_check'
  | 'follow_up_reminder'
  | 'generate_report'
  | 'process_payment_webhook'
  | 'retry_failed_notification'
  | 'cleanup_old_logs';

export type ApprovalType =
  | 'conflict_review'
  | 'clerk_assignment'
  | 'refund_request'
  | 'change_order'
  | 'deadline_extension'
  | 'qa_override'
  | 'manual_status_change';

export type NotificationType =
  | 'order_confirmation'
  | 'payment_received'
  | 'payment_failed'
  | 'conflict_cleared'
  | 'order_assigned'
  | 'work_started'
  | 'draft_ready'
  | 'revision_ready'
  | 'deadline_reminder'
  | 'deadline_warning'
  | 'deadline_critical'
  | 'revision_requested'
  | 'order_completed'
  | 'feedback_request'
  | 'approval_needed'
  | 'report_delivery'
  | 'welcome_email'
  | 'status_update';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';
export type NotificationStatus = 'pending' | 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type UrgencyLevel = 'low' | 'normal' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high';
export type MatchType = 'exact' | 'fuzzy' | 'related_entity';
export type AutomationLevel = 'training_wheels' | 'supervised' | 'autonomous' | 'full_auto';

// ============================================================================
// DATABASE MODELS
// ============================================================================

export interface AutomationLog {
  id: string;
  order_id: string | null;
  action_type: AutomationActionType;
  action_details: Record<string, unknown>;
  confidence_score: number | null;
  was_auto_approved: boolean;
  owner_override: boolean;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface AutomationTask {
  id: string;
  task_type: TaskType;
  order_id: string | null;
  payload: Record<string, unknown>;
  priority: number;
  scheduled_for: string;
  status: TaskStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ApprovalQueueItem {
  id: string;
  approval_type: ApprovalType;
  order_id: string | null;
  request_details: Record<string, unknown>;
  ai_recommendation: string | null;
  ai_reasoning: string | null;
  ai_confidence: number | null;
  alternatives: ApprovalAlternative[];
  status: ApprovalStatus;
  urgency: UrgencyLevel;
  expires_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  // Joined relations
  order?: {
    order_number: string;
    case_caption: string;
    motion_type: string;
    status: string;
  };
}

export interface ApprovalAlternative {
  option: string;
  description: string;
  confidence: number;
}

export interface AutomationSetting {
  id: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  description: string | null;
  category: SettingCategory;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SettingCategory =
  | 'conflict_checking'
  | 'clerk_assignment'
  | 'notifications'
  | 'qa_checks'
  | 'deadlines'
  | 'approvals'
  | 'reports'
  | 'general';

export interface NotificationQueueItem {
  id: string;
  notification_type: NotificationType;
  recipient_id: string | null;
  recipient_email: string;
  order_id: string | null;
  subject: string;
  template_data: Record<string, unknown>;
  status: NotificationStatus;
  priority: number;
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  external_id: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ClerkExpertise {
  id: string;
  clerk_id: string;
  motion_type: string;
  expertise_level: number;
  orders_completed: number;
  average_completion_days: number | null;
  last_assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConflictMatch {
  id: string;
  order_id: string;
  matched_order_id: string | null;
  party_name: string;
  matched_party_name: string;
  match_type: MatchType;
  similarity_score: number;
  risk_level: RiskLevel;
  ai_analysis: string | null;
  is_cleared: boolean;
  cleared_by: string | null;
  cleared_at: string | null;
  clear_reason: string | null;
  created_at: string;
  // Joined relations
  matched_order?: {
    order_number: string;
    case_caption: string;
    client_id: string;
  };
}

export interface WebhookEvent {
  id: string;
  event_id: string;
  event_type: string;
  source: 'stripe' | 'resend' | 'other';
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// ============================================================================
// CONFLICT CHECKING TYPES
// ============================================================================

export interface ConflictCheckRequest {
  orderId: string;
  parties: PartyInfo[];
  relatedEntities?: string;
}

export interface PartyInfo {
  name: string;
  normalizedName: string;
  role: string;
}

export interface ConflictCheckResult {
  orderId: string;
  hasConflicts: boolean;
  matches: ConflictMatchResult[];
  recommendation: 'clear' | 'review' | 'reject';
  confidence: number;
  reasoning: string;
  processingTimeMs: number;
}

export interface ConflictMatchResult {
  partyName: string;
  matchedPartyName: string;
  matchedOrderId: string;
  matchedOrderNumber: string;
  matchedCaseCaption: string;
  matchType: MatchType;
  similarityScore: number;
  riskLevel: RiskLevel;
  aiAnalysis: string;
}

// ============================================================================
// CLERK ASSIGNMENT TYPES
// ============================================================================

export interface ClerkAssignmentRequest {
  orderId: string;
  motionType: string;
  motionTier: number;
  jurisdiction: string;
  turnaround: string;
  filingDeadline: string;
  documentCount: number;
}

export interface ClerkCandidate {
  clerkId: string;
  clerkName: string;
  currentWorkload: number;
  maxWorkload: number;
  availabilityStatus: string;
  expertiseLevel: number;
  ordersCompleted: number;
  avgCompletionDays: number | null;
  score: number;
  scoreBreakdown: {
    capacityScore: number;
    expertiseScore: number;
    deadlineScore: number;
    balanceScore: number;
  };
}

export interface ClerkAssignmentResult {
  orderId: string;
  recommendedClerkId: string;
  recommendedClerkName: string;
  confidence: number;
  reasoning: string;
  alternatives: ClerkCandidate[];
  autoAssigned: boolean;
  processingTimeMs: number;
}

// ============================================================================
// QA CHECK TYPES
// ============================================================================

export interface QACheckRequest {
  orderId: string;
  documentId: string;
  fileName: string;
  fileUrl: string;
  expectedCaseCaption: string;
  expectedJurisdiction: string;
}

export interface QACheckResult {
  orderId: string;
  documentId: string;
  passed: boolean;
  score: number;
  issues: QAIssue[];
  recommendation: 'deliver' | 'review' | 'reject';
  confidence: number;
  processingTimeMs: number;
}

export interface QAIssue {
  type: 'placeholder' | 'formatting' | 'content' | 'metadata';
  severity: 'warning' | 'error';
  description: string;
  location?: string;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface QueueNotificationRequest {
  type: NotificationType;
  recipientId: string;
  recipientEmail: string;
  orderId?: string;
  subject: string;
  templateData: Record<string, unknown>;
  priority?: number;
  scheduledFor?: Date;
}

export interface SendNotificationResult {
  success: boolean;
  notificationId: string;
  externalId?: string;
  error?: string;
}

// ============================================================================
// REPORT TYPES
// ============================================================================

export interface DailyReportData {
  date: string;
  newOrders: number;
  completedOrders: number;
  revenueCollected: number;
  ordersAtRisk: OrderAtRisk[];
  clerkUtilization: ClerkUtilizationStat[];
  pendingApprovals: number;
  automationStats: {
    totalActions: number;
    autoApproved: number;
    manualReview: number;
    failed: number;
  };
}

export interface WeeklyReportData {
  weekStartDate: string;
  weekEndDate: string;
  totalOrders: number;
  totalRevenue: number;
  motionTypeBreakdown: { type: string; count: number; revenue: number }[];
  jurisdictionBreakdown: { jurisdiction: string; count: number }[];
  avgTurnaround: number;
  rushOrderPercentage: number;
  clientSatisfaction: number | null;
  topClients: { name: string; orders: number; revenue: number }[];
}

export interface OrderAtRisk {
  orderId: string;
  orderNumber: string;
  caseCaption: string;
  filingDeadline: string;
  daysUntilDeadline: number;
  currentStatus: string;
  riskLevel: RiskLevel;
  reason: string;
}

export interface ClerkUtilizationStat {
  clerkId: string;
  clerkName: string;
  currentWorkload: number;
  maxWorkload: number;
  utilizationPercent: number;
  ordersCompletedToday: number;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface AutomationDashboardStats {
  pendingApprovals: number;
  autoProcessedToday: number;
  activeAlerts: number;
  pendingTasks: number;
  failedTasks24h: number;
  notificationsSentToday: number;
}

export interface AutomationActivityItem {
  id: string;
  type: AutomationActionType;
  description: string;
  orderId?: string;
  orderNumber?: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
  details?: Record<string, unknown>;
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

export interface AutomationSettingsState {
  conflictChecking: {
    enabled: boolean;
    autoClearThreshold: number;
    fuzzyMatchThreshold: number;
  };
  clerkAssignment: {
    enabled: boolean;
    autoAssignThreshold: number;
    maxConcurrentRush: number;
    weights: {
      capacity: number;
      expertise: number;
      deadline: number;
      balance: number;
    };
  };
  notifications: {
    enabled: boolean;
    quietHours: {
      enabled: boolean;
      start: string;
      end: string;
      timezone: string;
    };
    retryAttempts: number;
    batchSize: number;
  };
  qaChecks: {
    enabled: boolean;
    autoDeliverThreshold: number;
    placeholderPatterns: string[];
  };
  deadlines: {
    enabled: boolean;
    warningDays: number;
    criticalDays: number;
    checkIntervalHours: number;
  };
  approvals: {
    expiryHours: number;
    autoEscalate: boolean;
    escalateAfterHours: number;
  };
  reports: {
    dailyEnabled: boolean;
    dailyTime: string;
    weeklyEnabled: boolean;
    weeklyDay: string;
    weeklyTime: string;
    timezone: string;
    recipients: string[];
  };
  general: {
    automationLevel: AutomationLevel;
    aiModel: string;
    maxTokens: number;
    maintenanceMode: boolean;
  };
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface ProcessApprovalRequest {
  approvalId: string;
  action: 'approve' | 'reject';
  notes?: string;
  selectedAlternative?: string;
}

export interface ProcessApprovalResponse {
  success: boolean;
  message: string;
  nextAction?: string;
}

export interface RunConflictCheckResponse {
  success: boolean;
  result?: ConflictCheckResult;
  approvalRequired: boolean;
  approvalId?: string;
  error?: string;
}

export interface RunClerkAssignmentResponse {
  success: boolean;
  result?: ClerkAssignmentResult;
  approvalRequired: boolean;
  approvalId?: string;
  error?: string;
}

export interface AutomationLogsQuery {
  orderId?: string;
  actionType?: AutomationActionType;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface TasksQuery {
  taskType?: TaskType;
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

// ============================================================================
// CLAUDE AI TYPES
// ============================================================================

export interface ClaudeAnalysisRequest {
  task: 'conflict_check' | 'clerk_assignment' | 'qa_analysis' | 'report_summary';
  context: Record<string, unknown>;
  systemPrompt?: string;
}

export interface ClaudeAnalysisResponse {
  success: boolean;
  result: Record<string, unknown>;
  tokensUsed: number;
  processingTimeMs: number;
  error?: string;
}

// ============================================================================
// WORKFLOW STATE MACHINE
// ============================================================================

export interface OrderWorkflowState {
  orderId: string;
  currentStatus: string;
  previousStatus: string | null;
  canTransitionTo: string[];
  automationState: {
    paymentConfirmed: boolean;
    conflictChecked: boolean;
    conflictCleared: boolean;
    clerkAssigned: boolean;
    draftUploaded: boolean;
    qaChecked: boolean;
    clientNotified: boolean;
  };
  pendingActions: string[];
  blockedReasons: string[];
}

export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  submitted: ['under_review', 'cancelled'],
  under_review: ['assigned', 'on_hold', 'cancelled'],
  assigned: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['draft_delivered', 'on_hold', 'cancelled'],
  draft_delivered: ['revision_requested', 'completed'],
  revision_requested: ['in_progress'],
  revision_delivered: ['revision_requested', 'completed'],
  completed: [],
  on_hold: ['under_review', 'assigned', 'in_progress', 'cancelled'],
  cancelled: [],
};

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
