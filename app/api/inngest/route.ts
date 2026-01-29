import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

// v7.4.1: Explicit imports for reliable function registration
// Primary workflow handler
import { generateOrderWorkflow, handleWorkflowFailure } from "@/lib/inngest/workflow-orchestration";

// Supporting functions
import {
  handleGenerationFailure,
  deadlineCheck,
  updateQueuePositions,
  handleCheckpointApproval,
} from "@/lib/inngest/functions";

/**
 * Inngest API Route Handler
 *
 * This endpoint serves the Inngest SDK and handles:
 * - Function registration with the Inngest cloud/dev server
 * - Incoming event webhooks
 * - Function execution requests
 *
 * In production, set these environment variables:
 * - INNGEST_EVENT_KEY: For sending events
 * - INNGEST_SIGNING_KEY: For verifying webhook signatures
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // PRIMARY: 14-phase workflow (handles order/submitted)
    generateOrderWorkflow,
    handleWorkflowFailure,
    // SUPPORTING: Error handling, deadlines, queue management
    handleGenerationFailure,
    deadlineCheck,
    updateQueuePositions,
    handleCheckpointApproval,
  ],
});
