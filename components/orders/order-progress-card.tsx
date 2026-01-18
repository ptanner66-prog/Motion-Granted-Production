/**
 * Order Progress Card
 *
 * Displays real-time progress for an order in a clean, lawyer-friendly format.
 * Shows current phase, estimated time remaining, and download button when ready.
 */

'use client';

import { useOrderProgress } from '@/hooks/use-order-progress';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
} from 'lucide-react';

interface OrderProgressCardProps {
  orderId: string;
  orderNumber?: string;
  showDownload?: boolean;
  compact?: boolean;
}

// Phase icons for visual progress
const PHASE_ICONS: Record<number, string> = {
  1: '📄', // Document parsing
  2: '⚖️', // Legal analysis
  3: '📚', // Research
  4: '✓', // Citation verification
  5: '📋', // Argument structuring
  6: '✍️', // Drafting
  7: '🔍', // Quality review
  8: '🔧', // Revisions
  9: '📦', // Final assembly
};

export function OrderProgressCard({
  orderId,
  orderNumber,
  showDownload = true,
  compact = false,
}: OrderProgressCardProps) {
  const {
    progress,
    isLoading,
    error,
    refetch,
    isComplete,
    statusMessage,
    statusColor,
  } = useOrderProgress(orderId);

  if (isLoading && !progress) {
    return (
      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading progress...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-lg p-4 bg-card border-destructive/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Unable to load progress</span>
          </div>
          <Button variant="ghost" size="sm" onClick={refetch}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (!progress) {
    return null;
  }

  const displayOrderNumber = orderNumber || progress.orderNumber;

  // Status badge colors
  const badgeColors: Record<string, string> = {
    gray: 'bg-muted text-muted-foreground',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <Progress value={progress.percentComplete} className="h-2" />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {progress.percentComplete}%
        </span>
        {isComplete && showDownload && progress.hasDeliverable && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/orders/${orderId}`}>
              <Download className="h-3 w-3 mr-1" />
              Download
            </a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-6 bg-card space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">{displayOrderNumber}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {statusMessage}
          </p>
        </div>

        <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeColors[statusColor]}`}>
          {isComplete ? 'Ready' : `Phase ${progress.currentPhase || 1}/${progress.totalPhases}`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <Progress value={progress.percentComplete} className="h-3" />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {progress.percentComplete}% complete
          </span>
          {progress.estimatedMinutesRemaining !== null && !isComplete && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{progress.estimatedMinutesRemaining} min remaining
            </span>
          )}
        </div>
      </div>

      {/* Phase indicators */}
      {!isComplete && progress.currentPhase && (
        <div className="flex justify-between text-xs">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((phase) => (
            <div
              key={phase}
              className={`flex items-center justify-center w-8 h-8 rounded-full ${
                phase < (progress.currentPhase || 0)
                  ? 'bg-green-100 dark:bg-green-900'
                  : phase === progress.currentPhase
                  ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500'
                  : 'bg-muted'
              }`}
              title={`Phase ${phase}`}
            >
              {phase < (progress.currentPhase || 0) ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <span className={phase === progress.currentPhase ? 'font-bold' : ''}>
                  {PHASE_ICONS[phase] || phase}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Completion state */}
      {isComplete && (
        <div className="flex items-center gap-4 pt-2">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Draft Complete</span>
          </div>

          {showDownload && progress.hasDeliverable && (
            <Button asChild>
              <a href={`/orders/${orderId}`}>
                <Download className="h-4 w-4 mr-2" />
                View & Download ({progress.deliverableCount} file{progress.deliverableCount !== 1 ? 's' : ''})
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Deliverable count for non-complete */}
      {!isComplete && progress.hasDeliverable && progress.deliverableCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {progress.deliverableCount} deliverable{progress.deliverableCount !== 1 ? 's' : ''} available
        </p>
      )}
    </div>
  );
}

/**
 * Simple inline progress indicator
 */
export function OrderProgressInline({ orderId }: { orderId: string }) {
  const { progress, isComplete } = useOrderProgress(orderId);

  if (!progress) return null;

  return (
    <div className="flex items-center gap-2">
      {isComplete ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      )}
      <span className="text-sm">
        {isComplete ? 'Ready' : `${progress.percentComplete}%`}
      </span>
    </div>
  );
}
