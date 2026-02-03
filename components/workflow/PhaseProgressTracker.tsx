'use client';

import { cn } from '@/lib/utils';
import {
  type WorkflowPhaseCode,
  type PhaseStatus,
  WORKFLOW_PHASES,
  TOTAL_WORKFLOW_PHASES,
} from '@/types/workflow';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  PauseCircle,
  Flag,
  Brain,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * PhaseProgressTracker Component
 *
 * Displays the 14-phase v7.2 workflow progress with:
 * - Visual indicators for each phase
 * - Checkpoint markers (*, †, ?)
 * - Current phase highlighting
 * - Status colors
 */

interface PhaseProgressTrackerProps {
  currentPhase: WorkflowPhaseCode;
  phaseStatuses: Partial<Record<WorkflowPhaseCode, PhaseStatus>>;
  revisionLoop?: number;
  className?: string;
  compact?: boolean;
}

// Ordered list of phases for display
const PHASE_ORDER: WorkflowPhaseCode[] = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII',
  'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X'
];

const STATUS_STYLES: Record<PhaseStatus, {
  icon: typeof CheckCircle2;
  color: string;
  bgColor: string;
}> = {
  completed: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  completed_with_warning: {
    icon: AlertCircle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  in_progress: {
    icon: Loader2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  pending: {
    icon: Circle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
  },
  blocked: {
    icon: PauseCircle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  requires_review: {
    icon: AlertCircle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  failed: {
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
};

function PhaseIcon({
  phase,
  status,
  isCurrent,
}: {
  phase: WorkflowPhaseCode;
  status: PhaseStatus;
  isCurrent: boolean;
}) {
  const phaseInfo = WORKFLOW_PHASES[phase];
  const statusStyle = STATUS_STYLES[status];
  const Icon = statusStyle.icon;

  return (
    <div
      className={cn(
        'relative flex items-center justify-center w-8 h-8 rounded-full transition-all',
        statusStyle.bgColor,
        isCurrent && 'ring-2 ring-offset-2 ring-blue-500'
      )}
    >
      <Icon
        className={cn(
          'w-4 h-4',
          statusStyle.color,
          status === 'in_progress' && 'animate-spin'
        )}
      />

      {/* Checkpoint indicator */}
      {phaseInfo.isCheckpoint && (
        <Flag
          className={cn(
            'absolute -top-1 -right-1 w-3 h-3',
            phaseInfo.checkpointType === 'blocking' ? 'text-red-500' : 'text-amber-500'
          )}
        />
      )}

      {/* Extended thinking indicator */}
      {phaseInfo.hasExtendedThinking && (
        <Brain
          className="absolute -bottom-1 -right-1 w-3 h-3 text-purple-500"
        />
      )}
    </div>
  );
}

export function PhaseProgressTracker({
  currentPhase,
  phaseStatuses,
  revisionLoop = 0,
  className,
  compact = false,
}: PhaseProgressTrackerProps) {
  const completedCount = Object.values(phaseStatuses).filter(
    s => s === 'completed'
  ).length;
  const progressPercent = Math.round((completedCount / TOTAL_WORKFLOW_PHASES) * 100);

  return (
    <TooltipProvider>
      <div className={cn('space-y-4', className)}>
        {/* Progress bar */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">
            Workflow Progress
          </span>
          <span className="text-gray-500">
            {completedCount} / {TOTAL_WORKFLOW_PHASES} phases ({progressPercent}%)
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Revision loop indicator */}
        {revisionLoop > 0 && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            <span>Revision Loop {revisionLoop} of 3</span>
          </div>
        )}

        {/* Phase grid */}
        {!compact && (
          <div className="grid grid-cols-7 gap-2 mt-4">
            {PHASE_ORDER.map((phase) => {
              const phaseInfo = WORKFLOW_PHASES[phase];
              const status = phaseStatuses[phase] || 'pending';
              const isCurrent = phase === currentPhase;

              return (
                <Tooltip key={phase} delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg cursor-default transition-all',
                        isCurrent && 'bg-blue-50 border border-blue-200',
                        phaseInfo.isConditional && 'opacity-70'
                      )}
                    >
                      <PhaseIcon
                        phase={phase}
                        status={status}
                        isCurrent={isCurrent}
                      />
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isCurrent ? 'text-blue-700' : 'text-gray-500'
                        )}
                      >
                        {phase}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-semibold">
                        Phase {phase}: {phaseInfo.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {phaseInfo.description}
                      </p>
                      {phaseInfo.isCheckpoint && (
                        <p className="text-xs text-amber-600">
                          Checkpoint: {phaseInfo.checkpointType === 'blocking' ? 'Blocking' : 'Notification'}
                        </p>
                      )}
                      {phaseInfo.hasExtendedThinking && (
                        <p className="text-xs text-purple-600">
                          Extended Thinking: {phaseInfo.extendedThinkingBudget?.toLocaleString()} tokens
                        </p>
                      )}
                      {phaseInfo.isConditional && (
                        <p className="text-xs text-gray-500 italic">
                          Conditional phase
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Compact view - just shows current phase */}
        {compact && (
          <div className="flex items-center gap-3">
            <PhaseIcon
              phase={currentPhase}
              status={phaseStatuses[currentPhase] || 'in_progress'}
              isCurrent={true}
            />
            <div>
              <p className="font-medium text-gray-900">
                Phase {currentPhase}: {WORKFLOW_PHASES[currentPhase].name}
              </p>
              <p className="text-sm text-gray-500">
                {WORKFLOW_PHASES[currentPhase].description}
              </p>
            </div>
          </div>
        )}

        {/* Legend */}
        {!compact && (
          <div className="flex flex-wrap gap-4 pt-4 border-t text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Flag className="w-3 h-3 text-amber-500" />
              <span>Notification Checkpoint</span>
            </div>
            <div className="flex items-center gap-1">
              <Flag className="w-3 h-3 text-red-500" />
              <span>Blocking Checkpoint</span>
            </div>
            <div className="flex items-center gap-1">
              <Brain className="w-3 h-3 text-purple-500" />
              <span>Extended Thinking</span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default PhaseProgressTracker;
