'use client';

/**
 * CheckpointBanner Component
 *
 * v6.3: Displays an action-required banner when a workflow is at a checkpoint.
 * Includes checkpoint-specific messaging and action buttons.
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, Download, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type CheckpointType = 'CP1' | 'CP2' | 'CP3';

interface RevisionInfo {
  freeRemaining: number;
  pricePerRevision: number;
  maxAllowed: number;
  totalUsed: number;
}

interface JudgeSimulation {
  grade: string | null;
  gradeNumeric: number | null;
  passed: boolean;
}

interface CheckpointBannerProps {
  checkpoint: CheckpointType;
  onAction: (action: string, notes?: string) => Promise<void>;
  revisionInfo?: RevisionInfo;
  judgeSimulation?: JudgeSimulation;
  orderNumber?: string;
  loading?: boolean;
}

const CHECKPOINT_CONFIG = {
  CP1: {
    title: 'Research Review Required',
    description: 'Please review the research strategy before we proceed with drafting.',
    icon: FileText,
    primaryAction: { label: 'Continue to Drafting', action: 'continue' },
    secondaryAction: { label: 'Request Changes', action: 'request_changes' },
    color: 'yellow',
  },
  CP2: {
    title: 'Draft Review Required',
    description: 'Your motion draft is ready for review. Please approve or request revisions.',
    icon: FileText,
    primaryAction: { label: 'Approve Draft', action: 'approve' },
    secondaryAction: { label: 'Request Revisions', action: 'request_revisions' },
    color: 'blue',
  },
  CP3: {
    title: 'Final Package Ready',
    description: 'Your complete filing package is ready for download.',
    icon: Download,
    primaryAction: { label: 'Confirm Receipt', action: 'confirm_receipt' },
    secondaryAction: null,
    color: 'green',
  },
};

export function CheckpointBanner({
  checkpoint,
  onAction,
  revisionInfo,
  judgeSimulation,
  orderNumber,
  loading = false,
}: CheckpointBannerProps) {
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = CHECKPOINT_CONFIG[checkpoint];
  const Icon = config.icon;

  const handleAction = async (action: string) => {
    if (action === 'request_revisions' || action === 'request_changes') {
      setShowRevisionDialog(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await onAction(action);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevisionSubmit = async () => {
    setIsSubmitting(true);
    try {
      const action = checkpoint === 'CP1' ? 'request_changes' : 'request_revisions';
      await onAction(action, revisionNotes);
      setShowRevisionDialog(false);
      setRevisionNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const bgColor = {
    yellow: 'bg-yellow-50 border-yellow-200',
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
  }[config.color];

  const iconColor = {
    yellow: 'text-yellow-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
  }[config.color];

  return (
    <>
      <div className={cn('border rounded-lg p-4', bgColor)}>
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={cn('flex-shrink-0 p-2 rounded-full bg-white', iconColor)}>
            <Icon className="h-6 w-6" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{config.title}</h3>
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                config.color === 'yellow' && 'bg-yellow-200 text-yellow-800',
                config.color === 'blue' && 'bg-blue-200 text-blue-800',
                config.color === 'green' && 'bg-green-200 text-green-800'
              )}>
                Checkpoint {checkpoint.replace('CP', '')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {config.description}
            </p>

            {/* CP2-specific: Grade and revision info */}
            {checkpoint === 'CP2' && judgeSimulation && (
              <div className="mt-3 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Grade:</span>
                  <span className={cn(
                    'font-bold',
                    judgeSimulation.passed ? 'text-green-600' : 'text-yellow-600'
                  )}>
                    {judgeSimulation.grade || 'N/A'}
                  </span>
                  {judgeSimulation.passed ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
                {revisionInfo && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Revisions:</span>
                    <span>
                      {revisionInfo.freeRemaining > 0 ? (
                        <span className="text-green-600">{revisionInfo.freeRemaining} free remaining</span>
                      ) : (
                        <span className="text-orange-600">${revisionInfo.pricePerRevision}/revision</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-4">
              <Button
                onClick={() => handleAction(config.primaryAction.action)}
                disabled={loading || isSubmitting}
              >
                {isSubmitting ? 'Processing...' : config.primaryAction.label}
              </Button>
              {config.secondaryAction && (
                <Button
                  variant="outline"
                  onClick={() => handleAction(config.secondaryAction!.action)}
                  disabled={loading || isSubmitting}
                >
                  {config.secondaryAction.label}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {checkpoint === 'CP1' ? 'Request Research Changes' : 'Request Revisions'}
            </DialogTitle>
            <DialogDescription>
              Please describe what changes you would like made to the{' '}
              {checkpoint === 'CP1' ? 'research direction' : 'draft'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              placeholder="Describe the changes you need..."
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              rows={4}
            />

            {/* Revision pricing info for CP2 */}
            {checkpoint === 'CP2' && revisionInfo && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                {revisionInfo.freeRemaining > 0 ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>This revision is free ({revisionInfo.freeRemaining} free revision remaining)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-orange-600">
                    <CreditCard className="h-4 w-4" />
                    <span>
                      This revision will cost ${revisionInfo.pricePerRevision}.
                      Payment will be required to proceed.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevisionDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRevisionSubmit}
              disabled={isSubmitting || !revisionNotes.trim()}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CheckpointBanner;
