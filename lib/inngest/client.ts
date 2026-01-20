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

export type Events = {
  "order/submitted": OrderSubmittedEvent;
  "order/generate-draft": OrderGenerationEvent;
  "deadline/check": DeadlineCheckEvent;
};

/**
 * Calculate priority score for queue ordering
 * Higher priority = closer deadline = processed first
 *
 * @param filingDeadline - The filing deadline date
 * @returns Priority score (higher = more urgent)
 */
export function calculatePriority(filingDeadline: Date | string): number {
  const deadline = typeof filingDeadline === 'string'
    ? new Date(filingDeadline)
    : filingDeadline;
  const hoursUntilDeadline = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
  // Max priority of 10000 for orders due now, decreasing by 1 per hour
  return Math.max(0, Math.floor(10000 - hoursUntilDeadline));
}
