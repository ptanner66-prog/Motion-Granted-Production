'use client';

/**
 * PhaseProgress Component
 *
 * v6.3: Displays the 12-phase workflow progress with checkpoint indicators.
 * Shows current phase, completed phases, and checkpoint status.
 */

import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Clock, AlertCircle, Loader2 } from 'lucide-react';

interface PhaseInfo {
  number: number;
  name: string;
  status: 'completed' | 'in_progress' | 'pending' | 'blocked' | 'checkpoint';
  isCheckpoint?: boolean;
  checkpointType?: 'CP1' | 'CP2' | 'CP3';
}

interface PhaseProgressProps {
  currentPhase: number;
  totalPhases?: number;
  completedPhases?: number;
  checkpointPending?: 'CP1' | 'CP2' | 'CP3' | null;
  workflowPath?: 'path_a' | 'path_b';
  phases?: PhaseInfo[];
  compact?: boolean;
}

// v6.3: 12-phase definitions for Path A
const PATH_A_PHASES: PhaseInfo[] = [
  { number: 1, name: 'Intake', status: 'pending' },
  { number: 2, name: 'Legal Standards', status: 'pending' },
  { number: 3, name: 'Evidence Mapping', status: 'pending' },
  { number: 4, name: 'Authority Research', status: 'pending', isCheckpoint: true, checkpointType: 'CP1' },
  { number: 5, name: 'Draft Motion', status: 'pending' },
  { number: 6, name: 'Citation Check', status: 'pending' },
  { number: 7, name: 'Opposition Anticipation', status: 'pending' },
  { number: 8, name: 'Judge Simulation', status: 'pending', isCheckpoint: true, checkpointType: 'CP2' },
  { number: 9, name: 'Revisions', status: 'pending' },
  { number: 10, name: 'Caption Validation', status: 'pending' },
  { number: 11, name: 'Supporting Docs', status: 'pending' },
  { number: 12, name: 'Final Assembly', status: 'pending', isCheckpoint: true, checkpointType: 'CP3' },
];

// v6.3: 12-phase definitions for Path B (Opposition)
const PATH_B_PHASES: PhaseInfo[] = [
  { number: 1, name: 'Intake', status: 'pending' },
  { number: 2, name: 'Motion Deconstruction', status: 'pending' },
  { number: 3, name: 'Issue Identification', status: 'pending' },
  { number: 4, name: 'Counter Research', status: 'pending', isCheckpoint: true, checkpointType: 'CP1' },
  { number: 5, name: 'Draft Opposition', status: 'pending' },
  { number: 6, name: 'Citation Check', status: 'pending' },
  { number: 7, name: 'Reply Anticipation', status: 'pending' },
  { number: 8, name: 'Judge Simulation', status: 'pending', isCheckpoint: true, checkpointType: 'CP2' },
  { number: 9, name: 'Revisions', status: 'pending' },
  { number: 10, name: 'Caption Validation', status: 'pending' },
  { number: 11, name: 'Supporting Docs', status: 'pending' },
  { number: 12, name: 'Final Assembly', status: 'pending', isCheckpoint: true, checkpointType: 'CP3' },
];

export function PhaseProgress({
  currentPhase,
  totalPhases = 12,
  completedPhases,
  checkpointPending,
  workflowPath = 'path_a',
  phases,
  compact = false,
}: PhaseProgressProps) {
  // Use provided phases or default based on path
  const phaseDefinitions = phases || (workflowPath === 'path_b' ? PATH_B_PHASES : PATH_A_PHASES);

  // Calculate phases with status
  const phasesWithStatus = phaseDefinitions.map((phase) => {
    let status: PhaseInfo['status'] = 'pending';

    if (phase.number < currentPhase) {
      status = 'completed';
    } else if (phase.number === currentPhase) {
      if (checkpointPending && phase.isCheckpoint && phase.checkpointType === checkpointPending) {
        status = 'checkpoint';
      } else {
        status = 'in_progress';
      }
    }

    return { ...phase, status };
  });

  // Progress percentage
  const progress = ((completedPhases || currentPhase - 1) / totalPhases) * 100;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Phase {currentPhase} of {totalPhases}</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              checkpointPending ? 'bg-yellow-500' : 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        {checkpointPending && (
          <div className="flex items-center gap-2 text-sm text-yellow-600">
            <AlertCircle className="h-4 w-4" />
            <span>Checkpoint {checkpointPending.replace('CP', '')} - Action Required</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Workflow Progress</span>
          <span className="font-medium">{Math.round(progress)}% Complete</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              checkpointPending ? 'bg-yellow-500' : 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Phase list */}
      <div className="space-y-1">
        {phasesWithStatus.map((phase, index) => (
          <div
            key={phase.number}
            className={cn(
              'flex items-center gap-3 py-2 px-3 rounded-lg transition-colors',
              phase.status === 'in_progress' && 'bg-primary/10',
              phase.status === 'checkpoint' && 'bg-yellow-100',
              phase.status === 'completed' && 'text-muted-foreground'
            )}
          >
            {/* Status icon */}
            <div className="flex-shrink-0">
              {phase.status === 'completed' && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              {phase.status === 'in_progress' && (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
              {phase.status === 'checkpoint' && (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              {phase.status === 'pending' && (
                <Circle className="h-5 w-5 text-muted-foreground/50" />
              )}
              {phase.status === 'blocked' && (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </div>

            {/* Phase info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {phase.number}. {phase.name}
                </span>
                {phase.isCheckpoint && (
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded',
                    phase.status === 'checkpoint'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {phase.checkpointType}
                  </span>
                )}
              </div>
            </div>

            {/* Checkpoint indicator line */}
            {phase.isCheckpoint && index < phasesWithStatus.length - 1 && (
              <div className="absolute left-7 w-0.5 h-4 bg-yellow-300 -bottom-2" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PhaseProgress;
