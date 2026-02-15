import { Inngest } from "inngest";

/**
 * Motion Granted Inngest Client
 *
 * Used for background job processing with:
 * - Automatic retries with exponential backoff
 * - Step-based checkpointing for fault tolerance
 * - Priority-based queue processing (closest deadline first)
 * - Concurrency controls for API rate limits
 */
export const inngest = new Inngest({
  id: "motion-granted",
  // Event data schemas
});

// Event types for type safety
export type OrderSubmittedEvent = {
  name: "order/submitted";
  data: {
    orderId: string;
    priority: number;
    filingDeadline: string;
  };
};

export type OrderGenerationEvent = {
  name: "order/generate-draft";
  data: {
    orderId: string;
    priority: number;
    attempt?: number;
  };
};

export type DeadlineCheckEvent = {
  name: "deadline/check";
  data: {
    runAt: string;
  };
};

// v7.2 Workflow Events
export type WorkflowExecutePhaseEvent = {
  name: "workflow/execute-phase";
  data: {
    orderId: string;
    workflowId: string;
    phase: string;
  };
};

export type WorkflowCheckpointReachedEvent = {
  name: "workflow/checkpoint-reached";
  data: {
    orderId: string;
    workflowId: string;
    checkpoint: {
      type: string;
      phase: string;
      actions?: string[];
      data?: Record<string, unknown>;
    };
  };
};

export type WorkflowCheckpointApprovedEvent = {
  name: "workflow/checkpoint-approved";
  data: {
    orderId: string;
    workflowId?: string;
    action: "APPROVE" | "REQUEST_CHANGES" | "CANCEL";
    nextPhase?: string;
    notes?: string;
    feedback?: string;
    approvedBy?: string;
    approvedAt?: string;
  };
};

// CC-R3-04: Conflict review event
export type ConflictReviewStartedEvent = {
  name: "conflict/review-started";
  data: {
    orderId: string;
  };
};

export type Events = {
  "order/submitted": OrderSubmittedEvent;
  "order/generate-draft": OrderGenerationEvent;
  "deadline/check": DeadlineCheckEvent;
  "workflow/execute-phase": WorkflowExecutePhaseEvent;
  "workflow/checkpoint-reached": WorkflowCheckpointReachedEvent;
  "workflow/checkpoint-approved": WorkflowCheckpointApprovedEvent;
  "conflict/review-started": ConflictReviewStartedEvent;
};

/**
 * Calculate priority score for queue ordering
 * Higher priority = closer deadline = processed first
 *
 * @param filingDeadline - The filing deadline date
 * @returns Priority score (higher = more urgent)
 */
export function calculatePriority(
  filingDeadline: Date | string | null | undefined
): number {
  if (!filingDeadline) return 5000; // Default: middle of queue

  const deadline = typeof filingDeadline === 'string'
    ? new Date(filingDeadline)
    : filingDeadline;

  if (isNaN(deadline.getTime())) return 5000; // Invalid date guard

  const hoursUntilDeadline =
    (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
  return Math.max(0, Math.min(10000,
    Math.floor(10000 - hoursUntilDeadline)));
}
