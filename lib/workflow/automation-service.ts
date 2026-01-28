/**
 * Motion Drafting Automation Service
 *
 * Provides hands-off, end-to-end automation for lawyers:
 * 1. Order submitted → Auto-start workflow
 * 2. Documents parsed → Legal analysis → Draft generated
 * 3. Quality review → Revisions → Final assembly
 * 4. PDF generated → Saved as deliverable → Client notified
 *
 * Designed for production SaaS with:
 * - Automatic error recovery
 * - Progress tracking
 * - Status synchronization
 * - Email notifications at key milestones
 */

import { createClient } from '@/lib/supabase/server';
import { orchestrateWorkflow, gatherOrderContext } from './orchestrator';
import { getWorkflowProgress } from './workflow-engine';
import { generatePDFFromWorkflow, savePDFAsDeliverable } from './pdf-generator';
import { queueOrderNotification } from '@/lib/automation/notification-sender';
import type { OperationResult } from '@/types/automation';
import type { WorkflowPath } from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export interface AutomationConfig {
  autoRun: boolean;
  workflowPath: WorkflowPath;
  generatePDF: boolean;
  sendNotifications: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface AutomationResult {
  orderId: string;
  orderNumber: string;
  workflowId: string;
  status: 'completed' | 'in_progress' | 'requires_review' | 'failed';
  currentPhase?: number;
  totalPhases: number;
  pdfGenerated: boolean;
  deliverableId?: string;
  notificationSent: boolean;
  error?: string;
  duration?: number;
}

export interface OrderProgress {
  orderId: string;
  orderNumber: string;
  status: string;
  workflowStatus: string | null;
  currentPhase: number | null;
  totalPhases: number;
  percentComplete: number;
  currentActivity: string;
  estimatedMinutesRemaining: number | null;
  hasDeliverable: boolean;
  deliverableCount: number;
}

// Default configuration for production use
const DEFAULT_CONFIG: AutomationConfig = {
  autoRun: true,
  workflowPath: 'path_a',
  generatePDF: true,
  sendNotifications: true,
  maxRetries: 3,
  retryDelayMs: 5000,
};

// ============================================================================
// STATUS MAPPINGS
// ============================================================================

const ORDER_STATUS_MAP: Record<string, string> = {
  pending: 'Awaiting workflow start',
  in_progress: 'Drafting in progress',
  blocked: 'Requires attention',
  requires_review: 'Under review',
  completed: 'Draft ready',
};

// v7.2: 14-phase workflow
const PHASE_ACTIVITY_MAP: Record<number, string> = {
  1: 'Parsing uploaded documents (Phase I)',
  2: 'Building legal framework (Phase II)',
  3: 'Researching case law (Phase III)',
  4: 'Verifying citations (Phase IV)',
  5: 'Structuring arguments (Phase V)',
  6: 'Refining structure (Phase V.1)',
  7: 'Drafting the motion (Phase VI)',
  8: 'Judge simulation review (Phase VII)',
  9: 'Applying revisions (Phase VII.1)',
  10: 'Final legal polish (Phase VIII)',
  11: 'Disclosure & transparency (Phase VIII.5)',
  12: 'Formatting & assembly (Phase IX)',
  13: 'Final formatting adjustments (Phase IX.1)',
  14: 'Quality assurance & approval (Phase X)',
};

// ============================================================================
// MAIN AUTOMATION FUNCTIONS
// ============================================================================

/**
 * Start complete automation for an order
 * This is the main entry point for hands-off processing
 */
export async function startOrderAutomation(
  orderId: string,
  config: Partial<AutomationConfig> = {}
): Promise<OperationResult<AutomationResult>> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const supabase = await createClient();

  try {
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_number, status, motion_type')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return { success: false, error: 'Order not found' };
    }

    // Update order status to processing
    await supabase
      .from('orders')
      .update({
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Log automation start
    await logAutomationEvent(orderId, 'automation_started', {
      config: mergedConfig,
      motionType: order.motion_type,
    });

    // Start workflow orchestration
    // NOTE: skipDocumentParsing has been removed - phases cannot be skipped
    const workflowResult = await orchestrateWorkflow(orderId, {
      autoRun: mergedConfig.autoRun,
      workflowPath: mergedConfig.workflowPath,
    });

    if (!workflowResult.success || !workflowResult.data) {
      await updateOrderStatus(orderId, 'blocked');
      await logAutomationEvent(orderId, 'automation_failed', {
        error: workflowResult.error,
        phase: 'orchestration',
      });

      return {
        success: false,
        error: workflowResult.error || 'Workflow orchestration failed',
      };
    }

    const { workflowId, status } = workflowResult.data;
    const resolvedWorkflowId = workflowId || orderId; // Use orderId as fallback

    // If workflow requires review, return current state
    if (status === 'requires_review') {
      await logAutomationEvent(orderId, 'review_required', {
        workflowId: resolvedWorkflowId,
        phase: workflowResult.data.currentPhase,
      });

      return {
        success: true,
        data: {
          orderId,
          orderNumber: order.order_number,
          workflowId: resolvedWorkflowId,
          status: 'requires_review',
          currentPhase: workflowResult.data.currentPhase,
          totalPhases: 14,
          pdfGenerated: false,
          notificationSent: false,
        },
      };
    }

    // If workflow completed, generate PDF and notify
    if (status === 'completed') {
      return await finalizeOrder(orderId, order.order_number, resolvedWorkflowId, mergedConfig, startTime);
    }

    // Workflow is still in progress
    return {
      success: true,
      data: {
        orderId,
        orderNumber: order.order_number,
        workflowId: resolvedWorkflowId,
        status: 'in_progress',
        currentPhase: workflowResult.data.currentPhase || 1,
        totalPhases: 14,
        pdfGenerated: false,
        notificationSent: false,
      },
    };
  } catch (error) {
    await logAutomationEvent(orderId, 'automation_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Automation failed',
    };
  }
}

/**
 * Finalize order after workflow completion
 * Generates PDF, saves deliverable, sends notification
 */
async function finalizeOrder(
  orderId: string,
  orderNumber: string,
  workflowId: string,
  config: AutomationConfig,
  startTime: number
): Promise<OperationResult<AutomationResult>> {
  const supabase = await createClient();
  let pdfGenerated = false;
  let deliverableId: string | undefined;
  let notificationSent = false;

  try {
    // Generate PDF
    if (config.generatePDF) {
      const pdfResult = await generatePDFFromWorkflow(orderId, workflowId);

      if (pdfResult.success && pdfResult.data) {
        // Get order details for filename
        const { data: order } = await supabase
          .from('orders')
          .select('motion_type, case_number')
          .eq('id', orderId)
          .single();

        const motionType = (order?.motion_type || 'Motion').replace(/\s+/g, '_');
        const caseNum = (order?.case_number || 'CASE').replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${motionType}_${caseNum}_${new Date().toISOString().split('T')[0]}.pdf`;

        // Save as deliverable
        const saveResult = await savePDFAsDeliverable(orderId, pdfResult.data.pdfBytes, fileName);

        if (saveResult.success && saveResult.data) {
          pdfGenerated = true;
          deliverableId = saveResult.data.documentId;

          await logAutomationEvent(orderId, 'pdf_generated', {
            fileName,
            pageCount: pdfResult.data.pageCount,
            wordCount: pdfResult.data.wordCount,
          });
        }
      }
    }

    // Update order status to draft_delivered
    await supabase
      .from('orders')
      .update({
        status: 'draft_delivered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Send notification
    if (config.sendNotifications) {
      try {
        await queueOrderNotification(orderId, 'draft_ready', {
          deliverableReady: pdfGenerated,
        });
        notificationSent = true;

        await logAutomationEvent(orderId, 'notification_queued', {
          type: 'draft_ready',
        });
      } catch {
        // Non-fatal - log but continue
        console.error('Failed to queue notification for order:', orderId);
      }
    }

    const duration = Date.now() - startTime;

    await logAutomationEvent(orderId, 'automation_completed', {
      duration,
      pdfGenerated,
      notificationSent,
    });

    return {
      success: true,
      data: {
        orderId,
        orderNumber,
        workflowId,
        status: 'completed',
        totalPhases: 14,
        pdfGenerated,
        deliverableId,
        notificationSent,
        duration,
      },
    };
  } catch (error) {
    await logAutomationEvent(orderId, 'finalization_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Order finalization failed',
    };
  }
}

/**
 * Resume automation for an order that requires review or was paused
 */
export async function resumeOrderAutomation(
  orderId: string,
  config: Partial<AutomationConfig> = {}
): Promise<OperationResult<AutomationResult>> {
  const supabase = await createClient();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Get existing workflow
  const { data: workflow, error: wfError } = await supabase
    .from('order_workflows')
    .select('id, status, current_phase')
    .eq('order_id', orderId)
    .single();

  if (wfError || !workflow) {
    // No existing workflow - start fresh
    return startOrderAutomation(orderId, config);
  }

  // If already completed, just finalize
  if (workflow.status === 'completed') {
    const { data: order } = await supabase
      .from('orders')
      .select('order_number')
      .eq('id', orderId)
      .single();

    return finalizeOrder(
      orderId,
      order?.order_number || 'UNKNOWN',
      workflow.id,
      mergedConfig,
      Date.now()
    );
  }

  // Resume workflow from current phase
  return startOrderAutomation(orderId, config);
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Get detailed progress for an order
 * Used by the lawyer dashboard to show real-time status
 */
export async function getOrderProgress(orderId: string): Promise<OperationResult<OrderProgress>> {
  const supabase = await createClient();

  try {
    // Get order with workflow
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_number, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return { success: false, error: 'Order not found' };
    }

    // Get workflow
    const { data: workflow } = await supabase
      .from('order_workflows')
      .select('id, status, current_phase')
      .eq('order_id', orderId)
      .single();

    // Get deliverable count
    const { count: deliverableCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('is_deliverable', true);

    // Calculate progress
    const currentPhase = workflow?.current_phase || 0;
    const totalPhases = 14;
    const percentComplete = workflow
      ? Math.round((currentPhase / totalPhases) * 100)
      : order.status === 'submitted'
      ? 5
      : order.status === 'draft_delivered'
      ? 100
      : 0;

    // Get current activity description
    const currentActivity = workflow
      ? PHASE_ACTIVITY_MAP[currentPhase] || 'Processing'
      : ORDER_STATUS_MAP[order.status] || 'Waiting';

    // Estimate remaining time (rough: 2 min per phase)
    const phasesRemaining = totalPhases - currentPhase;
    const estimatedMinutesRemaining = workflow && workflow.status !== 'completed'
      ? phasesRemaining * 2
      : null;

    return {
      success: true,
      data: {
        orderId,
        orderNumber: order.order_number,
        status: order.status,
        workflowStatus: workflow?.status || null,
        currentPhase,
        totalPhases,
        percentComplete,
        currentActivity,
        estimatedMinutesRemaining,
        hasDeliverable: (deliverableCount || 0) > 0,
        deliverableCount: deliverableCount || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get progress',
    };
  }
}

/**
 * Get progress for multiple orders (for dashboard)
 */
export async function getOrdersProgress(
  orderIds: string[]
): Promise<OperationResult<OrderProgress[]>> {
  const results: OrderProgress[] = [];

  for (const orderId of orderIds) {
    const result = await getOrderProgress(orderId);
    if (result.success && result.data) {
      results.push(result.data);
    }
  }

  return { success: true, data: results };
}

// ============================================================================
// STATUS SYNCHRONIZATION
// ============================================================================

/**
 * Update order status based on workflow state
 */
async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('orders')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
}

/**
 * Sync order status with workflow status
 * Called periodically or after workflow updates
 */
export async function syncOrderWithWorkflow(orderId: string): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    // Get workflow
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('status, current_phase')
      .eq('order_id', orderId)
      .single();

    if (wfError || !workflow) {
      return { success: true }; // No workflow yet, nothing to sync
    }

    // Map workflow status to order status
    let orderStatus: string;

    switch (workflow.status) {
      case 'pending':
        orderStatus = 'under_review';
        break;
      case 'in_progress':
        orderStatus = 'in_progress';
        break;
      case 'blocked':
        orderStatus = 'in_progress'; // Don't show 'blocked' to client
        break;
      case 'completed':
        orderStatus = 'draft_delivered';
        break;
      default:
        orderStatus = 'in_progress';
    }

    await updateOrderStatus(orderId, orderStatus);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Status sync failed',
    };
  }
}

// ============================================================================
// AUTOMATION LOGGING
// ============================================================================

/**
 * Log automation events for audit trail
 */
async function logAutomationEvent(
  orderId: string,
  eventType: string,
  details: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();

  try {
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: eventType,
      action_details: details,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal - just log to console
    console.error('Failed to log automation event:', eventType, details);
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process multiple pending orders automatically
 * Used by cron job for background processing
 */
export async function processPendingOrders(
  limit: number = 10
): Promise<OperationResult<{ processed: number; failed: number }>> {
  const supabase = await createClient();

  try {
    // Get pending orders that need processing
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .in('status', ['submitted', 'under_review'])
      .order('created_at', { ascending: true })
      .limit(limit);

    if (ordersError) {
      return { success: false, error: ordersError.message };
    }

    let processed = 0;
    let failed = 0;

    for (const order of orders || []) {
      // Check if workflow already exists
      const { data: existingWorkflow } = await supabase
        .from('order_workflows')
        .select('id')
        .eq('order_id', order.id)
        .single();

      if (existingWorkflow) {
        // Already has workflow, skip
        continue;
      }

      const result = await startOrderAutomation(order.id);

      if (result.success) {
        processed++;
      } else {
        failed++;
      }
    }

    return { success: true, data: { processed, failed } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Batch processing failed',
    };
  }
}

/**
 * Retry failed workflows
 */
export async function retryFailedWorkflows(
  limit: number = 5
): Promise<OperationResult<{ retried: number; failed: number }>> {
  const supabase = await createClient();

  try {
    // Get blocked/failed workflows
    const { data: workflows, error: wfError } = await supabase
      .from('order_workflows')
      .select('id, order_id, error_count')
      .eq('status', 'blocked')
      .lt('error_count', 3) // Max 3 retries
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (wfError) {
      return { success: false, error: wfError.message };
    }

    let retried = 0;
    let failed = 0;

    for (const workflow of workflows || []) {
      const result = await resumeOrderAutomation(workflow.order_id);

      if (result.success) {
        retried++;
      } else {
        failed++;

        // Increment error count
        await supabase
          .from('order_workflows')
          .update({ error_count: (workflow.error_count || 0) + 1 })
          .eq('id', workflow.id);
      }
    }

    return { success: true, data: { retried, failed } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Retry processing failed',
    };
  }
}
