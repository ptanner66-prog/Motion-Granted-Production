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

// SP-4 R4-06: Attorney revision request event
export type OrderRevisionRequestedEvent = {
  name: "order/revision-requested";
  data: {
    orderId: string;
    workflowId: string;
    action: "REQUEST_CHANGES";
    notes: string;
    attorneyId: string;
  };
};

// SP-4 D3 Task 6: Protocol 10 exit event
export type OrderProtocol10ExitEvent = {
  name: "order/protocol-10-exit";
  data: {
    orderId: string;
    tier: string;
    totalCost: number;
    cap: number;
  };
};

// SP-4 D5 W3-1: CP3 reached event (SP-20 D5: updated to match CP3ApprovalEvent)
export type CheckpointCP3ReachedEvent = {
  name: "checkpoint/cp3.reached";
  data: {
    orderId: string;
    packageId: string;
    workflowId: string;
    grade: number;
    tier: string;
    protocol10Triggered: boolean;
  };
};

// SP-11 AE-1: Upgrade completed event
export type OrderUpgradeCompletedEvent = {
  name: "order/upgrade-completed";
  data: {
    orderId: string;
    previousTier: string;
    newTier: string;
    differentialCents: number;
  };
};

// SP-11 AE-3: Dispute evidence compilation event
export type DisputeEvidenceCompileEvent = {
  name: "dispute/evidence-compile";
  data: {
    orderId: string;
    disputeId: string;
  };
};

// SP-22: HOLD checkpoint events
export type CheckpointHoldCreatedEvent = {
  name: "checkpoint/hold.created";
  data: {
    orderId: string;
    holdReason: string;
    customerEmail: string;
    createdAt: string;
    details: Record<string, unknown>;
  };
};

export type CheckpointHoldResolvedEvent = {
  name: "checkpoint/hold.resolved";
  data: {
    orderId: string;
    checkpointId?: string;
    action: "RESUMED" | "CANCELLED";
    holdReason: string;
    resolvedBy?: string;
  };
};

export type Events = {
  "order/submitted": OrderSubmittedEvent;
  "order/generate-draft": OrderGenerationEvent;
  "order/revision-requested": OrderRevisionRequestedEvent;
  "order/protocol-10-exit": OrderProtocol10ExitEvent;
  "order/upgrade-completed": OrderUpgradeCompletedEvent;
  "deadline/check": DeadlineCheckEvent;
  "workflow/execute-phase": WorkflowExecutePhaseEvent;
  "workflow/checkpoint-reached": WorkflowCheckpointReachedEvent;
  "workflow/checkpoint-approved": WorkflowCheckpointApprovedEvent;
  "checkpoint/cp3.reached": CheckpointCP3ReachedEvent;
  "conflict/review-started": ConflictReviewStartedEvent;
  "dispute/evidence-compile": DisputeEvidenceCompileEvent;
  // SP-22: HOLD checkpoint events
  "checkpoint/hold.created": CheckpointHoldCreatedEvent;
  "checkpoint/hold.resolved": CheckpointHoldResolvedEvent;
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
