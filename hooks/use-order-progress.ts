/**
 * Order Progress Hook
 *
 * Real-time progress tracking for lawyers to monitor their orders.
 * Uses Supabase Realtime for instant updates + polling fallback.
 * Provides user-friendly status information.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface OrderProgress {
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

interface UseOrderProgressOptions {
  pollInterval?: number; // ms, default 5000 (5 seconds)
  enablePolling?: boolean;
}

interface UseOrderProgressReturn {
  progress: OrderProgress | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isComplete: boolean;
  statusMessage: string;
  statusColor: 'gray' | 'blue' | 'yellow' | 'green' | 'red';
}

// Status to user-friendly message mapping
const STATUS_MESSAGES: Record<string, string> = {
  submitted: 'Order received - processing will begin shortly',
  under_review: 'Your order is being prepared',
  assigned: 'A clerk has been assigned to your order',
  in_progress: 'Your motion is being drafted',
  pending_review: 'Draft complete - undergoing final review',
  draft_delivered: 'Your draft is ready for download',
  revision_requested: 'Revision in progress',
  revision_delivered: 'Revised draft is ready',
  completed: 'Order complete',
  generation_failed: 'An issue occurred - our team is notified',
};

// Activity to user-friendly message mapping
const ACTIVITY_MESSAGES: Record<string, string> = {
  'Parsing uploaded documents': 'Analyzing your documents...',
  'Analyzing legal issues': 'Identifying legal issues and standards...',
  'Researching case law and citations': 'Researching relevant case law...',
  'Verifying citations': 'Verifying legal citations...',
  'Structuring arguments': 'Organizing your arguments...',
  'Drafting the motion': 'Writing your motion...',
  'Reviewing for quality': 'Reviewing for quality and accuracy...',
  'Applying revisions': 'Making final revisions...',
  'Finalizing document': 'Preparing your final document...',
};

// Status to color mapping
function getStatusColor(status: string, workflowStatus: string | null): UseOrderProgressReturn['statusColor'] {
  if (status === 'draft_delivered' || status === 'completed') return 'green';
  if (status === 'revision_requested') return 'yellow';
  if (workflowStatus === 'blocked') return 'red';
  if (workflowStatus === 'in_progress' || status === 'in_progress') return 'blue';
  return 'gray';
}

export function useOrderProgress(
  orderId: string | null,
  options: UseOrderProgressOptions = {}
): UseOrderProgressReturn {
  const { pollInterval = 5000, enablePolling = true } = options;

  const [progress, setProgress] = useState<OrderProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!orderId) {
      setProgress(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/automation/process?orderId=${orderId}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch progress');
      }

      const data = await response.json();
      setProgress(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch progress');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  // Initial fetch
  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // Supabase Realtime subscription for instant updates
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null>(null);

  useEffect(() => {
    if (!orderId) return;

    // Create Supabase client
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Subscribe to order updates
    const channel = supabase
      .channel(`order-progress-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          console.log('[Realtime] Order updated:', payload.new);
          // Refetch progress when order changes
          fetchProgress();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'automation_logs',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          console.log('[Realtime] Automation log:', payload.new);
          // Refetch on automation activity
          fetchProgress();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [orderId, fetchProgress]);

  // Polling fallback for updates (less frequent when realtime is active)
  useEffect(() => {
    if (!enablePolling || !orderId) return;

    // Don't poll if order is complete
    if (progress?.status === 'draft_delivered' || progress?.status === 'completed') {
      return;
    }

    // Poll less frequently since we have realtime
    const interval = setInterval(fetchProgress, pollInterval * 2);

    return () => clearInterval(interval);
  }, [enablePolling, orderId, pollInterval, fetchProgress, progress?.status]);

  // Derived state
  const isComplete = progress?.status === 'draft_delivered' ||
    progress?.status === 'completed' ||
    progress?.status === 'revision_delivered';

  const statusMessage = progress
    ? ACTIVITY_MESSAGES[progress.currentActivity] ||
      STATUS_MESSAGES[progress.status] ||
      progress.currentActivity
    : 'Loading...';

  const statusColor = progress
    ? getStatusColor(progress.status, progress.workflowStatus)
    : 'gray';

  return {
    progress,
    isLoading,
    error,
    refetch: fetchProgress,
    isComplete,
    statusMessage,
    statusColor,
  };
}

/**
 * Hook for tracking multiple orders (dashboard view)
 */
export function useOrdersProgress(
  orderIds: string[],
  options: UseOrderProgressOptions = {}
): {
  progressMap: Record<string, OrderProgress>;
  isLoading: boolean;
  error: string | null;
  refetchAll: () => Promise<void>;
} {
  const [progressMap, setProgressMap] = useState<Record<string, OrderProgress>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (orderIds.length === 0) {
      setProgressMap({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const results = await Promise.all(
        orderIds.map(async (id) => {
          try {
            const response = await fetch(`/api/automation/process?orderId=${id}`);
            if (response.ok) {
              const data = await response.json();
              return { id, data };
            }
            return { id, data: null };
          } catch {
            return { id, data: null };
          }
        })
      );

      const newMap: Record<string, OrderProgress> = {};
      for (const { id, data } of results) {
        if (data) {
          newMap[id] = data;
        }
      }

      setProgressMap(newMap);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch progress');
    } finally {
      setIsLoading(false);
    }
  }, [orderIds]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Polling
  useEffect(() => {
    if (!options.enablePolling) return;

    const interval = setInterval(fetchAll, options.pollInterval || 10000);
    return () => clearInterval(interval);
  }, [options.enablePolling, options.pollInterval, fetchAll]);

  return {
    progressMap,
    isLoading,
    error,
    refetchAll: fetchAll,
  };
}
