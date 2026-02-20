/**
 * CP3 Delivery Confirmation — Extracted from checkpoint-service.ts (DEC-8)
 *
 * Handles the 'confirm_receipt' action at CP3.
 * When the attorney confirms receipt, the order and workflow are marked completed.
 */

import { createClient } from '@/lib/supabase/server';
import type { CheckpointData, CheckpointResponse } from '@/lib/workflow/checkpoint-service';
import type { OperationResult } from '@/types/automation';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-confirm-receipt');

/**
 * Process CP3 response — confirm_receipt → order completed
 */
export async function processCP3Response(
  workflow: Record<string, unknown>,
  response: CheckpointResponse
): Promise<OperationResult<{ nextPhase: number }>> {
  const supabase = await createClient();

  if (response.action !== 'confirm_receipt') {
    return { success: false, error: 'Invalid CP3 action. Must confirm receipt.' };
  }

  // SP-15/TASK-23: Idempotency guard — prevent duplicate completion events
  // If order is already completed, skip to avoid duplicate delivery notifications
  const { data: currentOrder } = await supabase
    .from('orders')
    .select('status')
    .eq('id', workflow.order_id)
    .single();

  if (currentOrder?.status === 'COMPLETED') {
    log.warn('CP3 duplicate completion prevented — order already completed', {
      workflowId: workflow.id,
      orderId: workflow.order_id,
    });
    return { success: true, data: { nextPhase: -1 } };
  }

  const checkpointData = workflow.checkpoint_data as CheckpointData;
  checkpointData.status = 'confirmed';
  checkpointData.respondedAt = new Date().toISOString();
  checkpointData.customerResponse = {
    action: response.action,
    notes: response.notes,
    respondedAt: new Date().toISOString(),
  };

  // Append to checkpoint responses
  const existingResponses = (workflow.checkpoint_responses as unknown[]) || [];
  existingResponses.push({
    checkpoint: 'CP3',
    response: checkpointData.customerResponse,
    timestamp: new Date().toISOString(),
  });

  const { error } = await supabase
    .from('order_workflows')
    .update({
      status: 'completed',
      checkpoint_pending: null,
      checkpoint_data: checkpointData,
      checkpoint_responses: existingResponses,
      completed_at: new Date().toISOString(),
    })
    .eq('id', workflow.id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Mark the order as completed
  await supabase
    .from('orders')
    .update({
      status: 'COMPLETED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', workflow.order_id);

  log.info('CP3 order completed', { workflowId: workflow.id, orderId: workflow.order_id });
  return { success: true, data: { nextPhase: -1 } }; // -1 indicates complete
}
