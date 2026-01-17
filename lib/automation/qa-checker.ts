/**
 * QA Checker Automation Module
 *
 * This module handles automatic quality assurance checks on uploaded deliverables
 * including placeholder detection, metadata validation, and content analysis.
 */

import { createClient } from '@/lib/supabase/server';
import {
  analyzeDocumentQA,
  isClaudeConfigured,
  type QAAnalysisInput,
  type QAAnalysisOutput,
} from './claude';
import type {
  QACheckResult,
  QAIssue,
  OperationResult,
} from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

interface QACheckOptions {
  useAI?: boolean;
  autoDeliverThreshold?: number;
  skipNotification?: boolean;
}

interface QASettings {
  enabled: boolean;
  autoDeliverThreshold: number;
  placeholderPatterns: string[];
}

// ============================================================================
// SETTINGS
// ============================================================================

async function getQASettings(): Promise<QASettings> {
  try {
    const supabase = await createClient();

    const { data: settings } = await supabase
      .from('automation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['qa_checks_enabled', 'qa_auto_deliver_threshold', 'qa_check_placeholders']);

    interface SettingRow { setting_key: string; setting_value: unknown }
    const settingsMap = new Map(
      settings?.map((s: SettingRow) => [s.setting_key, s.setting_value]) || []
    );

    const placeholdersValue = settingsMap.get('qa_check_placeholders') as {
      patterns?: string[];
      enabled?: boolean;
    } | undefined;

    return {
      enabled: (settingsMap.get('qa_checks_enabled') as { enabled?: boolean })?.enabled ?? true,
      autoDeliverThreshold:
        (settingsMap.get('qa_auto_deliver_threshold') as { value?: number })?.value ?? 0.95,
      placeholderPatterns:
        placeholdersValue?.enabled !== false
          ? placeholdersValue?.patterns || ['INSERT', 'TBD', 'TODO', 'FIXME', '[PLACEHOLDER]']
          : [],
    };
  } catch (error) {
    console.error('[QA Checker] Failed to load settings:', error);
    return {
      enabled: true,
      autoDeliverThreshold: 0.95,
      placeholderPatterns: ['INSERT', 'TBD', 'TODO', 'FIXME', '[PLACEHOLDER]'],
    };
  }
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Run QA check on a deliverable document
 */
export async function runQACheck(
  orderId: string,
  documentId: string,
  options: QACheckOptions = {}
): Promise<OperationResult<QACheckResult>> {
  const startTime = Date.now();
  const supabase = await createClient();

  try {
    // Load settings
    const settings = await getQASettings();

    if (!settings.enabled) {
      return {
        success: false,
        error: 'QA checks are disabled',
        code: 'QA_DISABLED',
      };
    }

    const useAI = options.useAI ?? isClaudeConfigured;
    const autoDeliverThreshold = options.autoDeliverThreshold ?? settings.autoDeliverThreshold;

    // Log start of QA check
    await logAutomationAction(supabase, orderId, 'qa_check_started', {
      documentId,
      useAI,
    });

    // Fetch document and order details
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('order_id', orderId)
      .eq('is_deliverable', true)
      .single();

    if (docError || !document) {
      throw new Error(`Deliverable document not found: ${documentId}`);
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('case_caption, jurisdiction, motion_type')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Perform QA checks
    const issues: QAIssue[] = [];
    let score = 100;

    // 1. File validation
    const fileIssues = validateFile(document);
    issues.push(...fileIssues);
    score -= fileIssues.filter((i) => i.severity === 'error').length * 20;
    score -= fileIssues.filter((i) => i.severity === 'warning').length * 5;

    // 2. Download and check file content (if accessible)
    let documentContent = '';
    let contentIssues: QAIssue[] = [];

    try {
      // Try to fetch document content for text-based files
      if (isTextBasedFile(document.file_type)) {
        const { data: fileData } = await supabase.storage
          .from('documents')
          .download(document.file_url.replace(/^.*\/documents\//, ''));

        if (fileData) {
          documentContent = await fileData.text();

          // Check for placeholder patterns
          contentIssues = checkForPlaceholders(documentContent, settings.placeholderPatterns);
          issues.push(...contentIssues);
          score -= contentIssues.filter((i) => i.severity === 'error').length * 15;
          score -= contentIssues.filter((i) => i.severity === 'warning').length * 5;
        }
      }
    } catch (contentError) {
      // Content fetch failed - continue with basic checks
      console.warn('[QA Checker] Could not fetch document content:', contentError);
    }

    // 3. AI-powered analysis (if enabled and content available)
    let aiAnalysis: QAAnalysisOutput | null = null;

    if (useAI && isClaudeConfigured && documentContent.length > 100) {
      const aiInput: QAAnalysisInput = {
        documentContent,
        expectedCaseCaption: order.case_caption,
        expectedJurisdiction: order.jurisdiction,
        motionType: order.motion_type,
        placeholderPatterns: settings.placeholderPatterns,
      };

      const aiResult = await analyzeDocumentQA(aiInput);

      if (aiResult.success && aiResult.result) {
        aiAnalysis = aiResult.result;

        // Add AI-detected issues
        for (const aiIssue of aiResult.result.issues) {
          // Avoid duplicates
          const isDuplicate = issues.some(
            (i) => i.type === aiIssue.type && i.description === aiIssue.description
          );
          if (!isDuplicate) {
            issues.push(aiIssue);
          }
        }

        // Use AI score if available
        score = Math.min(score, aiResult.result.score);
      }
    }

    // Normalize score
    score = Math.max(0, Math.min(100, score));

    // Determine recommendation
    let recommendation: 'deliver' | 'review' | 'reject' = 'deliver';
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;

    if (errorCount > 0) {
      recommendation = 'reject';
    } else if (warningCount > 2 || score < 70) {
      recommendation = 'review';
    }

    const confidence = aiAnalysis?.confidence ?? (errorCount === 0 ? 0.8 : 0.5);
    const passed = recommendation === 'deliver' && score >= autoDeliverThreshold * 100;

    // Log result
    if (passed) {
      await logAutomationAction(supabase, orderId, 'qa_check_passed', {
        documentId,
        score,
        issueCount: issues.length,
        recommendation,
        autoDeliver: true,
      });
    } else {
      await logAutomationAction(supabase, orderId, 'qa_check_failed', {
        documentId,
        score,
        issues: issues.map((i) => ({ type: i.type, severity: i.severity })),
        recommendation,
      });

      // Create approval for manual review if not auto-passing
      if (recommendation !== 'deliver') {
        await createQAApproval(supabase, orderId, documentId, issues, recommendation, confidence);
      }
    }

    const result: QACheckResult = {
      orderId,
      documentId,
      passed,
      score,
      issues,
      recommendation,
      confidence,
      processingTimeMs: Date.now() - startTime,
    };

    return { success: true, data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logAutomationAction(supabase, orderId, 'qa_check_failed', {
      documentId,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      code: 'QA_CHECK_ERROR',
    };
  }
}

/**
 * Override QA check and approve delivery
 */
export async function overrideQACheck(
  orderId: string,
  documentId: string,
  approvedBy: string,
  reason: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    // Update approval queue
    await supabase
      .from('approval_queue')
      .update({
        status: 'approved',
        reviewed_by: approvedBy,
        review_notes: reason,
        resolved_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('approval_type', 'qa_override')
      .eq('status', 'pending');

    await logAutomationAction(supabase, orderId, 'qa_check_passed', {
      documentId,
      override: true,
      approvedBy,
      reason,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate file metadata
 */
function validateFile(document: {
  file_name: string;
  file_type: string;
  file_size: number;
}): QAIssue[] {
  const issues: QAIssue[] = [];

  // Check file type
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (!allowedTypes.includes(document.file_type)) {
    issues.push({
      type: 'metadata',
      severity: 'warning',
      description: `Unexpected file type: ${document.file_type}. Expected PDF or Word document.`,
    });
  }

  // Check file size (warn if very small or very large)
  if (document.file_size < 1000) {
    issues.push({
      type: 'metadata',
      severity: 'error',
      description: 'File appears to be too small (< 1KB). May be corrupted or empty.',
    });
  } else if (document.file_size > 50 * 1024 * 1024) {
    issues.push({
      type: 'metadata',
      severity: 'warning',
      description: 'File is very large (> 50MB). Consider compressing.',
    });
  }

  // Check file name
  if (!document.file_name || document.file_name.length < 5) {
    issues.push({
      type: 'metadata',
      severity: 'warning',
      description: 'File name is missing or too short.',
    });
  }

  return issues;
}

/**
 * Check if file type is text-based (can be analyzed)
 */
function isTextBasedFile(fileType: string): boolean {
  const textTypes = [
    'text/plain',
    'application/rtf',
    // Note: PDF and DOCX require special parsing
  ];
  return textTypes.includes(fileType);
}

/**
 * Check content for placeholder patterns
 */
function checkForPlaceholders(content: string, patterns: string[]): QAIssue[] {
  const issues: QAIssue[] = [];
  const contentUpper = content.toUpperCase();

  for (const pattern of patterns) {
    const patternUpper = pattern.toUpperCase();
    let startIndex = 0;
    let foundIndex: number;

    while ((foundIndex = contentUpper.indexOf(patternUpper, startIndex)) !== -1) {
      // Find the line containing this placeholder
      const lineStart = content.lastIndexOf('\n', foundIndex) + 1;
      const lineEnd = content.indexOf('\n', foundIndex);
      const line = content.substring(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();

      // Get some context
      const contextStart = Math.max(0, foundIndex - 20);
      const contextEnd = Math.min(content.length, foundIndex + pattern.length + 20);
      const context = content.substring(contextStart, contextEnd);

      issues.push({
        type: 'placeholder',
        severity: 'error',
        description: `Found placeholder text "${pattern}" that needs to be replaced.`,
        location: `Near: "...${context.trim()}..."`,
      });

      startIndex = foundIndex + pattern.length;

      // Limit to first 5 occurrences of each pattern
      if (issues.filter((i) => i.description.includes(pattern)).length >= 5) {
        break;
      }
    }
  }

  // Check for common draft markers
  const draftMarkers = ['DRAFT', '<<', '>>', '[[', ']]', '___'];
  for (const marker of draftMarkers) {
    if (contentUpper.includes(marker) && !patterns.includes(marker)) {
      const count = (contentUpper.match(new RegExp(marker, 'g')) || []).length;
      if (count > 3) {
        issues.push({
          type: 'placeholder',
          severity: 'warning',
          description: `Found multiple instances (${count}) of "${marker}" which may indicate incomplete sections.`,
        });
      }
    }
  }

  return issues;
}

/**
 * Create approval queue item for QA review
 */
async function createQAApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  documentId: string,
  issues: QAIssue[],
  recommendation: 'deliver' | 'review' | 'reject',
  confidence: number
): Promise<void> {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const urgency = errorCount > 0 ? 'high' : 'normal';

  await supabase.from('approval_queue').insert({
    approval_type: 'qa_override',
    order_id: orderId,
    request_details: {
      documentId,
      issues: issues.map((i) => ({
        type: i.type,
        severity: i.severity,
        description: i.description,
        location: i.location,
      })),
      errorCount,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
    },
    ai_recommendation:
      recommendation === 'deliver'
        ? 'Approve delivery'
        : recommendation === 'review'
        ? 'Manual review recommended'
        : 'Do not deliver - issues found',
    ai_reasoning: generateQAReasoning(issues),
    ai_confidence: confidence,
    urgency,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  await logAutomationAction(supabase, orderId, 'approval_requested', {
    type: 'qa_override',
    documentId,
    issueCount: issues.length,
  });
}

/**
 * Generate reasoning summary for QA issues
 */
function generateQAReasoning(issues: QAIssue[]): string {
  if (issues.length === 0) {
    return 'No issues found. Document passed all QA checks.';
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  const parts: string[] = [];

  if (errorCount > 0) {
    parts.push(`${errorCount} error(s) requiring attention`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning(s) to review`);
  }

  // Summarize issue types
  const issueTypes = new Set(issues.map((i) => i.type));
  if (issueTypes.has('placeholder')) {
    parts.push('placeholder text detected');
  }
  if (issueTypes.has('metadata')) {
    parts.push('file metadata issues');
  }
  if (issueTypes.has('content')) {
    parts.push('content concerns');
  }

  return `QA check found: ${parts.join(', ')}.`;
}

/**
 * Log automation action
 */
async function logAutomationAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string | null,
  actionType: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: actionType,
      action_details: details,
      confidence_score: (details.confidence as number) || null,
      was_auto_approved: (details.autoDeliver as boolean) || false,
    });
  } catch (error) {
    console.error('[Automation Log] Failed to log action:', error);
  }
}

/**
 * Get QA check history for a document
 */
export async function getQAHistory(
  orderId: string,
  documentId?: string
): Promise<OperationResult<Array<{ timestamp: string; passed: boolean; score: number; issues: number }>>> {
  const supabase = await createClient();

  try {
    let query = supabase
      .from('automation_logs')
      .select('created_at, action_type, action_details')
      .eq('order_id', orderId)
      .in('action_type', ['qa_check_passed', 'qa_check_failed'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (documentId) {
      query = query.contains('action_details', { documentId });
    }

    const { data, error } = await query;

    if (error) throw error;

    interface QALogEntry {
      created_at: string;
      action_type: string;
      action_details: Record<string, unknown>;
    }
    const history = (data as QALogEntry[] || []).map((log: QALogEntry) => {
      const details = log.action_details as Record<string, unknown>;
      return {
        timestamp: log.created_at,
        passed: log.action_type === 'qa_check_passed',
        score: (details.score as number) || 0,
        issues: (details.issueCount as number) || (details.issues as unknown[])?.length || 0,
      };
    });

    return { success: true, data: history };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
