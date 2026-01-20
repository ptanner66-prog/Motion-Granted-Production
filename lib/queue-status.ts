/**
 * Queue Status Helper Functions
 *
 * Utilities for calculating and displaying queue position and
 * estimated completion times for client-facing dashboards.
 */

/**
 * Get the queue position for an order
 *
 * @param orderId - The order ID to check
 * @param supabase - Supabase client instance
 * @returns Queue position (1-based) or null if not in queue
 */
export async function getQueuePosition(
  orderId: string,
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{ data: { queue_position: number | null } | null; error: Error | null }>;
        };
      };
    };
    rpc: (fn: string, params: { order_id: string }) => Promise<{ data: number | null; error: Error | null }>;
  }
): Promise<number | null> {
  // First try to get from the cached queue_position column
  const { data: order } = await supabase
    .from("orders")
    .select("queue_position")
    .eq("id", orderId)
    .single();

  if (order?.queue_position) {
    return order.queue_position;
  }

  // Fall back to the stored function
  try {
    const { data: position } = await supabase.rpc("get_queue_position", {
      order_id: orderId,
    });
    return position;
  } catch {
    return null;
  }
}

/**
 * Estimate completion time based on queue position
 *
 * @param queuePosition - Position in queue (1-based)
 * @param avgMinutesPerOrder - Average minutes per order (default: 2)
 * @returns Human-readable estimate string
 */
export function estimateCompletion(
  queuePosition: number,
  avgMinutesPerOrder: number = 2
): string {
  if (queuePosition <= 0) {
    return "Processing now";
  }

  const minutes = queuePosition * avgMinutesPerOrder;

  if (minutes < 1) {
    return "Less than a minute";
  }
  if (minutes < 60) {
    return `~${Math.round(minutes)} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `~${hours.toFixed(1)} hour${hours !== 1 ? "s" : ""}`;
  }

  const days = hours / 24;
  return `~${days.toFixed(1)} day${days !== 1 ? "s" : ""}`;
}

/**
 * Get status-specific message for client display
 *
 * @param status - Order status
 * @param queuePosition - Position in queue (if applicable)
 * @returns Message object with title and description
 */
export function getQueueStatusMessage(
  status: string,
  queuePosition: number | null
): { title: string; description: string; showProgress: boolean } {
  switch (status) {
    case "submitted":
    case "under_review":
      return {
        title: queuePosition
          ? `Position #${queuePosition} in queue`
          : "In queue",
        description: queuePosition
          ? `Your motion is #${queuePosition} in line. Estimated completion: ${estimateCompletion(queuePosition)}`
          : "Your motion is in the queue and will be processed soon.",
        showProgress: true,
      };

    case "in_progress":
      return {
        title: "Generating your motion",
        description:
          "Our AI is currently drafting your motion. This typically takes 1-3 minutes.",
        showProgress: true,
      };

    case "pending_review":
      return {
        title: "Ready for review",
        description:
          "Your motion draft is complete and being reviewed by our team.",
        showProgress: false,
      };

    case "draft_delivered":
      return {
        title: "Draft delivered",
        description: "Your motion draft is ready for download.",
        showProgress: false,
      };

    case "generation_failed":
      return {
        title: "Generation issue",
        description:
          "We encountered an issue generating your motion. Our team has been notified and is working on it.",
        showProgress: false,
      };

    default:
      return {
        title: "Processing",
        description: "Your order is being processed.",
        showProgress: false,
      };
  }
}
