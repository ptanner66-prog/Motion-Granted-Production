'use client';

import { cn } from '@/lib/utils';
import {
  type WorkflowPhaseCode,
  WORKFLOW_PHASES,
} from '@/types/workflow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Bell,
  Lock,
  ArrowRight,
} from 'lucide-react';

/**
 * CheckpointNotificationBanner Component
 *
 * Shows banners for workflow checkpoints:
 * - HOLD (after Phase III): Blocking checkpoint for jurisdiction issues
 * - CP1 (after Phase IV): Citation verification notification
 * - CP2 (after Phase VII): Judge simulation results notification
 * - CP3 (Phase X): Final approval blocking checkpoint
 */

interface CheckpointNotificationBannerProps {
  phaseCode: WorkflowPhaseCode;
  checkpointType: 'blocking' | 'notification';
  status: 'pending' | 'approved' | 'changes_requested' | 'dismissed';
  message?: string;
  onApprove?: () => void;
  onRequestChanges?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const CHECKPOINT_STYLES = {
  blocking: {
    bg: 'bg-red-50 border-red-200',
    icon: Lock,
    iconColor: 'text-red-600',
    titleColor: 'text-red-800',
    descColor: 'text-red-700',
  },
  notification: {
    bg: 'bg-amber-50 border-amber-200',
    icon: Bell,
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800',
    descColor: 'text-amber-700',
  },
};

const STATUS_BADGES = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Review' },
  approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
  changes_requested: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Changes Requested' },
  dismissed: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Dismissed' },
};

export function CheckpointNotificationBanner({
  phaseCode,
  checkpointType,
  status,
  message,
  onApprove,
  onRequestChanges,
  onDismiss,
  className,
}: CheckpointNotificationBannerProps) {
  const phaseInfo = WORKFLOW_PHASES[phaseCode];
  const styles = CHECKPOINT_STYLES[checkpointType];
  const statusBadge = STATUS_BADGES[status];
  const Icon = styles.icon;

  // Don't show if already handled and not pending
  if (status === 'approved' || status === 'dismissed') {
    return null;
  }

  const getCheckpointTitle = (): string => {
    if (phaseCode === 'III') return 'HOLD Checkpoint - Jurisdiction Review';
    if (phaseCode === 'IV') return 'CP1 - Citation Verification Complete';
    if (phaseCode === 'VII') return 'CP2 - Judge Simulation Complete';
    if (phaseCode === 'X') return 'CP3 - Final Quality Approval Required';
    return `Checkpoint after Phase ${phaseCode}`;
  };

  const getDefaultMessage = (): string => {
    if (phaseCode === 'III') {
      return 'No motion templates available for this jurisdiction. Admin review required to proceed or cancel.';
    }
    if (phaseCode === 'IV') {
      return 'Citation verification complete. Review the verification results before proceeding.';
    }
    if (phaseCode === 'VII') {
      return 'Judge simulation complete. Review the grade and feedback before proceeding to final assembly.';
    }
    if (phaseCode === 'X') {
      return 'Motion is ready for final quality assurance. Approve to deliver to client or request changes.';
    }
    return 'Checkpoint reached. Review required to proceed.';
  };

  return (
    <Alert className={cn(styles.bg, 'border-2', className)}>
      <Icon className={cn('h-5 w-5', styles.iconColor)} />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <AlertTitle className={cn('text-lg font-semibold', styles.titleColor)}>
            {getCheckpointTitle()}
          </AlertTitle>
          <span className={cn('px-2 py-1 rounded-full text-xs font-medium', statusBadge.bg, statusBadge.text)}>
            {statusBadge.label}
          </span>
        </div>
        <AlertDescription className={cn('mt-2', styles.descColor)}>
          {message || getDefaultMessage()}
        </AlertDescription>

        {/* Actions */}
        {status === 'pending' && (
          <div className="flex items-center gap-3 mt-4">
            {checkpointType === 'blocking' && onApprove && (
              <Button
                onClick={onApprove}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve & Continue
              </Button>
            )}

            {onRequestChanges && (
              <Button
                onClick={onRequestChanges}
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Request Changes
              </Button>
            )}

            {checkpointType === 'notification' && onDismiss && (
              <Button
                onClick={onDismiss}
                variant="ghost"
                className="text-gray-600 hover:text-gray-800"
              >
                Acknowledge & Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}

            {checkpointType === 'blocking' && phaseCode === 'III' && (
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel Order
              </Button>
            )}
          </div>
        )}

        {status === 'changes_requested' && (
          <div className="flex items-center gap-2 mt-4 text-sm text-orange-600">
            <AlertTriangle className="h-4 w-4" />
            Changes have been requested. Revision in progress...
          </div>
        )}
      </div>
    </Alert>
  );
}

export default CheckpointNotificationBanner;
