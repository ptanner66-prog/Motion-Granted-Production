'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  FileText,
  Loader2,
  CheckCircle2,
  UserCheck,
  Download,
  Clock,
  type LucideIcon,
} from 'lucide-react';

/**
 * Order Progress Tracker
 *
 * A production-ready stepper component that displays order progress
 * through the drafting workflow. Responsive design adapts from
 * horizontal (desktop) to vertical (mobile) layout.
 */

// Stage configuration with icons and labels
interface Stage {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const STAGES: Stage[] = [
  {
    id: 'submitted',
    label: 'Submitted',
    description: 'Order received and queued',
    icon: FileText,
  },
  {
    id: 'processing',
    label: 'Processing',
    description: 'AI drafting in progress',
    icon: Loader2,
  },
  {
    id: 'quality_check',
    label: 'Quality Check',
    description: 'Automated review & validation',
    icon: CheckCircle2,
  },
  {
    id: 'review',
    label: 'Ready for Review',
    description: 'Awaiting final approval',
    icon: UserCheck,
  },
  {
    id: 'delivered',
    label: 'Delivered',
    description: 'Available for download',
    icon: Download,
  },
];

// Map order statuses to tracker stages
const STATUS_TO_STAGE: Record<string, number> = {
  submitted: 0,
  under_review: 1,
  assigned: 1,
  in_progress: 1,
  pending_review: 3,
  draft_delivered: 4,
  revision_requested: 3,
  revision_delivered: 4,
  completed: 4,
  generation_failed: 1,
  blocked: 1,
  on_hold: 0,
  cancelled: -1,
};

// Determine stage state
type StageState = 'completed' | 'current' | 'pending';

function getStageState(stageIndex: number, currentStageIndex: number): StageState {
  if (stageIndex < currentStageIndex) return 'completed';
  if (stageIndex === currentStageIndex) return 'current';
  return 'pending';
}

// Stage styles based on state
const STAGE_STYLES: Record<StageState, {
  iconContainer: string;
  icon: string;
  label: string;
  description: string;
  connector: string;
}> = {
  completed: {
    iconContainer: 'bg-emerald-100 border-emerald-500 text-emerald-600',
    icon: 'text-emerald-600',
    label: 'text-emerald-700 font-medium',
    description: 'text-emerald-600/80',
    connector: 'bg-emerald-500',
  },
  current: {
    iconContainer: 'bg-blue-100 border-blue-500 text-blue-600 ring-4 ring-blue-100 animate-pulse-subtle',
    icon: 'text-blue-600',
    label: 'text-blue-700 font-semibold',
    description: 'text-blue-600',
    connector: 'bg-gradient-to-r from-emerald-500 to-blue-300',
  },
  pending: {
    iconContainer: 'bg-gray-50 border-gray-200 text-gray-400',
    icon: 'text-gray-400',
    label: 'text-gray-500',
    description: 'text-gray-400',
    connector: 'bg-gray-200',
  },
};

export interface OrderProgressTrackerProps {
  /** The current order status */
  status: string;
  /** Optional progress percentage (0-100) within current stage */
  progress?: number;
  /** Whether to show detailed descriptions for each stage */
  showDetails?: boolean;
  /** Estimated time remaining in minutes */
  estimatedTimeRemaining?: number;
  /** Additional CSS classes */
  className?: string;
}

interface StageIconProps {
  stage: Stage;
  state: StageState;
  progress?: number;
}

function StageIcon({ stage, state, progress }: StageIconProps) {
  const Icon = stage.icon;
  const styles = STAGE_STYLES[state];
  const isProcessing = stage.id === 'processing' && state === 'current';

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        'w-12 h-12 md:w-14 md:h-14',
        'rounded-full border-2 transition-all duration-500',
        styles.iconContainer
      )}
    >
      {/* Completed checkmark animation */}
      {state === 'completed' && (
        <CheckCircle2
          className={cn(
            'w-6 h-6 md:w-7 md:h-7',
            styles.icon,
            'animate-scale-check'
          )}
        />
      )}

      {/* Current or pending icon */}
      {state !== 'completed' && (
        <Icon
          className={cn(
            'w-6 h-6 md:w-7 md:h-7',
            styles.icon,
            isProcessing && 'animate-spin'
          )}
        />
      )}

      {/* Progress ring for current stage */}
      {state === 'current' && progress !== undefined && progress > 0 && (
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            className="text-blue-200"
            strokeWidth="6"
            stroke="currentColor"
            fill="transparent"
            r="44"
            cx="50"
            cy="50"
          />
          <circle
            className="text-blue-500 transition-all duration-500"
            strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r="44"
            cx="50"
            cy="50"
          />
        </svg>
      )}
    </div>
  );
}

interface ConnectorProps {
  fromState: StageState;
  toState: StageState;
  isVertical: boolean;
}

function Connector({ fromState, toState, isVertical }: ConnectorProps) {
  const isComplete = fromState === 'completed';
  const isCurrent = toState === 'current';

  return (
    <div
      className={cn(
        'transition-all duration-500',
        isVertical
          ? 'w-0.5 h-8 ml-6 md:ml-7'
          : 'h-0.5 flex-1 min-w-[2rem] my-auto',
        isComplete && !isCurrent && 'bg-emerald-500',
        isComplete && isCurrent && 'bg-gradient-to-r from-emerald-500 to-blue-400',
        !isComplete && 'bg-gray-200'
      )}
    />
  );
}

export function OrderProgressTracker({
  status,
  progress,
  showDetails = true,
  estimatedTimeRemaining,
  className,
}: OrderProgressTrackerProps) {
  const currentStageIndex = STATUS_TO_STAGE[status] ?? 0;
  const isCancelled = status === 'cancelled';
  const isFailed = status === 'generation_failed';

  // Calculate overall progress percentage
  const overallProgress = React.useMemo(() => {
    if (isCancelled) return 0;
    const baseProgress = (currentStageIndex / (STAGES.length - 1)) * 100;
    const stageContribution = progress ? (progress / (STAGES.length - 1)) : 0;
    return Math.min(100, Math.round(baseProgress + stageContribution));
  }, [currentStageIndex, progress, isCancelled]);

  // Format estimated time
  const formattedTime = React.useMemo(() => {
    if (!estimatedTimeRemaining) return null;
    if (estimatedTimeRemaining < 60) {
      return `${estimatedTimeRemaining} min`;
    }
    const hours = Math.floor(estimatedTimeRemaining / 60);
    const mins = estimatedTimeRemaining % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }, [estimatedTimeRemaining]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Order Progress</CardTitle>
            {showDetails && (
              <CardDescription className="mt-1">
                {isCancelled
                  ? 'This order has been cancelled'
                  : isFailed
                  ? 'Generation failed - our team has been notified'
                  : `${overallProgress}% complete`}
              </CardDescription>
            )}
          </div>

          {/* Estimated time badge */}
          {formattedTime && !isCancelled && currentStageIndex < STAGES.length - 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700">
              <Clock className="w-4 h-4" />
              <span className="font-medium">~{formattedTime}</span>
            </div>
          )}
        </div>

        {/* Overall progress bar */}
        <div className="mt-4 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700 ease-out',
              isCancelled
                ? 'bg-gray-400'
                : isFailed
                ? 'bg-red-500'
                : 'bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500 bg-[length:200%_100%] animate-gradient'
            )}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Horizontal layout for desktop */}
        <div className="hidden md:flex items-start justify-between gap-2">
          {STAGES.map((stage, index) => {
            const state = isCancelled ? 'pending' : getStageState(index, currentStageIndex);
            const isLast = index === STAGES.length - 1;

            return (
              <React.Fragment key={stage.id}>
                <div className="flex flex-col items-center text-center flex-shrink-0 w-24">
                  <StageIcon
                    stage={stage}
                    state={state}
                    progress={state === 'current' ? progress : undefined}
                  />
                  <span
                    className={cn(
                      'mt-3 text-sm leading-tight transition-colors duration-300',
                      STAGE_STYLES[state].label
                    )}
                  >
                    {stage.label}
                  </span>
                  {showDetails && (
                    <span
                      className={cn(
                        'mt-1 text-xs leading-tight transition-colors duration-300',
                        STAGE_STYLES[state].description
                      )}
                    >
                      {stage.description}
                    </span>
                  )}
                </div>

                {!isLast && (
                  <Connector
                    fromState={getStageState(index, currentStageIndex)}
                    toState={getStageState(index + 1, currentStageIndex)}
                    isVertical={false}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Vertical layout for mobile */}
        <div className="md:hidden space-y-0">
          {STAGES.map((stage, index) => {
            const state = isCancelled ? 'pending' : getStageState(index, currentStageIndex);
            const isLast = index === STAGES.length - 1;

            return (
              <React.Fragment key={stage.id}>
                <div className="flex items-start gap-4">
                  <StageIcon
                    stage={stage}
                    state={state}
                    progress={state === 'current' ? progress : undefined}
                  />
                  <div className="flex-1 pt-2 pb-4">
                    <span
                      className={cn(
                        'block text-sm leading-tight transition-colors duration-300',
                        STAGE_STYLES[state].label
                      )}
                    >
                      {stage.label}
                    </span>
                    {showDetails && (
                      <span
                        className={cn(
                          'block mt-0.5 text-xs leading-tight transition-colors duration-300',
                          STAGE_STYLES[state].description
                        )}
                      >
                        {stage.description}
                      </span>
                    )}
                  </div>
                </div>

                {!isLast && (
                  <Connector
                    fromState={getStageState(index, currentStageIndex)}
                    toState={getStageState(index + 1, currentStageIndex)}
                    isVertical={true}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Status message for special states */}
        {(isFailed || isCancelled) && (
          <div
            className={cn(
              'mt-4 px-4 py-3 rounded-lg text-sm',
              isFailed && 'bg-red-50 border border-red-200 text-red-700',
              isCancelled && 'bg-gray-50 border border-gray-200 text-gray-600'
            )}
          >
            {isFailed && (
              <>
                <strong>Generation Failed:</strong> Our team has been automatically notified.
                We will resolve this issue and restart your order within 24 hours.
              </>
            )}
            {isCancelled && (
              <>
                This order has been cancelled. If you have questions, please contact support.
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OrderProgressTracker;
