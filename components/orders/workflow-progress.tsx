'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  XCircle,
  PlayCircle,
  Loader2,
  FileSearch,
  Scale,
  BookOpen,
  CheckSquare,
  ListOrdered,
  FileText,
  Search,
  Edit3,
  Package,
} from 'lucide-react';

interface WorkflowProgress {
  workflowId: string;
  orderId: string;
  totalPhases: number;
  completedPhases: number;
  currentPhase: number;
  currentPhaseName: string;
  currentPhaseStatus: string;
  overallProgress: number;
  estimatedRemainingMinutes: number;
  citationCount: number;
  qualityScore?: number;
}

interface WorkflowPhase {
  id: string;
  phase_number: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  quality_score: number | null;
  requires_review: boolean;
  error_message: string | null;
  phase_definition?: {
    phase_name: string;
    phase_code: string;
    estimated_duration_minutes: number;
  };
}

interface WorkflowProgressProps {
  orderId: string;
  className?: string;
  onApprove?: (phaseNumber: number) => void;
  onExecute?: () => void;
}

const PHASE_ICONS: Record<string, typeof FileSearch> = {
  PA_INTAKE: FileSearch,
  PA_ANALYSIS: Scale,
  PA_RESEARCH: BookOpen,
  PA_CITE_VERIFY: CheckSquare,
  PA_OUTLINE: ListOrdered,
  PA_DRAFT: FileText,
  PA_REVIEW: Search,
  PA_REVISE: Edit3,
  PA_FINAL: Package,
  PB_INTAKE: FileSearch,
  PB_ANALYSIS: Scale,
  PB_RESEARCH: BookOpen,
  PB_CITE_VERIFY: CheckSquare,
  PB_OUTLINE: ListOrdered,
  PB_DRAFT: FileText,
  PB_REVIEW: Search,
  PB_REVISE: Edit3,
  PB_FINAL: Package,
};

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle,
    color: 'text-green-600',
    bg: 'bg-green-100',
    label: 'Completed',
  },
  in_progress: {
    icon: Loader2,
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    label: 'In Progress',
  },
  pending: {
    icon: Circle,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    label: 'Pending',
  },
  requires_review: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bg: 'bg-yellow-100',
    label: 'Needs Review',
  },
  blocked: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-100',
    label: 'Blocked',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-100',
    label: 'Failed',
  },
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export function WorkflowProgress({
  orderId,
  className,
  onApprove,
  onExecute,
}: WorkflowProgressProps) {
  const [progress, setProgress] = useState<WorkflowProgress | null>(null);
  const [phases, setPhases] = useState<WorkflowPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchWorkflowData() {
    try {
      const response = await fetch(`/api/workflow?orderId=${orderId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setProgress(null);
          setPhases([]);
          return;
        }
        throw new Error('Failed to fetch workflow');
      }

      const workflow = await response.json();

      // Build progress from workflow data
      const completedPhases = (workflow.workflow_phase_executions || []).filter(
        (p: WorkflowPhase) => p.status === 'completed'
      ).length;

      const currentPhaseExec = (workflow.workflow_phase_executions || []).find(
        (p: WorkflowPhase) => p.phase_number === workflow.current_phase
      );

      setProgress({
        workflowId: workflow.id,
        orderId: workflow.order_id,
        totalPhases: 9, // Standard 9 phases
        completedPhases,
        currentPhase: workflow.current_phase,
        currentPhaseName: currentPhaseExec?.phase_definition?.phase_name || 'Unknown',
        currentPhaseStatus: currentPhaseExec?.status || 'pending',
        overallProgress: (completedPhases / 9) * 100,
        estimatedRemainingMinutes: (9 - completedPhases) * 30,
        citationCount: workflow.citation_count || 0,
        qualityScore: workflow.quality_score,
      });

      setPhases(workflow.workflow_phase_executions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWorkflowData();
    // Poll for updates
    const interval = setInterval(fetchWorkflowData, 10000);
    return () => clearInterval(interval);
  }, [orderId]);

  async function handleExecute() {
    if (!progress) return;

    setExecuting(true);
    try {
      const response = await fetch(`/api/workflow/${progress.workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAll: false }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Execution failed');
      }

      // Refresh data
      await fetchWorkflowData();
      onExecute?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  }

  async function handleApprove(phaseNumber: number) {
    if (!progress) return;

    try {
      const response = await fetch(`/api/workflow/${progress.workflowId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Approval failed');
      }

      // Refresh data
      await fetchWorkflowData();
      onApprove?.(phaseNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  }

  if (loading) {
    return (
      <Card className={cn('animate-pulse', className)}>
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-1/2 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="h-4 bg-muted rounded mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!progress) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>No Workflow Started</CardTitle>
          <CardDescription>
            A workflow has not been started for this order yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const currentPhase = phases.find(p => p.phase_number === progress.currentPhase);
  const needsApproval = currentPhase?.requires_review;
  const isBlocked = currentPhase?.status === 'blocked' || currentPhase?.status === 'failed';

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Document Production Workflow
              {progress.qualityScore && (
                <Badge variant="outline">
                  Quality: {Math.round(progress.qualityScore * 100)}%
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Phase {progress.currentPhase} of {progress.totalPhases}: {progress.currentPhaseName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {needsApproval && (
              <Button
                size="sm"
                onClick={() => handleApprove(progress.currentPhase)}
              >
                Approve Phase
              </Button>
            )}
            {!needsApproval && !isBlocked && progress.overallProgress < 100 && (
              <Button
                size="sm"
                onClick={handleExecute}
                disabled={executing}
              >
                {executing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Execute Next Phase
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{Math.round(progress.overallProgress)}%</span>
          </div>
          <Progress value={progress.overallProgress} />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{progress.completedPhases} of {progress.totalPhases} phases completed</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{formatDuration(progress.estimatedRemainingMinutes)} remaining
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{progress.citationCount}</div>
            <div className="text-xs text-muted-foreground">Citations</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{progress.completedPhases}</div>
            <div className="text-xs text-muted-foreground">Phases Done</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold">
              {progress.qualityScore ? `${Math.round(progress.qualityScore * 100)}%` : '--'}
            </div>
            <div className="text-xs text-muted-foreground">Quality Score</div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Phase List */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Phase Progress</h4>
          <div className="space-y-1">
            {phases.sort((a, b) => a.phase_number - b.phase_number).map((phase) => {
              const status = STATUS_CONFIG[phase.status as keyof typeof STATUS_CONFIG] ||
                            STATUS_CONFIG.pending;
              const StatusIcon = status.icon;
              const PhaseIcon = PHASE_ICONS[phase.phase_definition?.phase_code || ''] || Circle;
              const isCurrent = phase.phase_number === progress.currentPhase;

              return (
                <TooltipProvider key={phase.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'flex items-center gap-3 p-2 rounded-lg transition-colors',
                          isCurrent && 'bg-muted',
                          phase.status === 'completed' && 'opacity-70'
                        )}
                      >
                        <div className={cn('p-1.5 rounded-full', status.bg)}>
                          {phase.status === 'in_progress' ? (
                            <Loader2 className={cn('h-4 w-4 animate-spin', status.color)} />
                          ) : (
                            <StatusIcon className={cn('h-4 w-4', status.color)} />
                          )}
                        </div>
                        <PhaseIcon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {phase.phase_definition?.phase_name || `Phase ${phase.phase_number}`}
                          </div>
                          {phase.error_message && (
                            <div className="text-xs text-destructive truncate">
                              {phase.error_message}
                            </div>
                          )}
                        </div>
                        {phase.quality_score !== null && (
                          <Badge variant="outline" className="text-xs">
                            {Math.round(phase.quality_score * 100)}%
                          </Badge>
                        )}
                        {phase.requires_review && isCurrent && (
                          <Badge variant="warning" className="text-xs bg-yellow-100 text-yellow-700">
                            Review
                          </Badge>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <div className="text-sm">
                        <div className="font-medium">{phase.phase_definition?.phase_name}</div>
                        <div className="text-muted-foreground">
                          Status: {status.label}
                        </div>
                        {phase.completed_at && (
                          <div className="text-muted-foreground">
                            Completed: {new Date(phase.completed_at).toLocaleString()}
                          </div>
                        )}
                        {phase.phase_definition?.estimated_duration_minutes && (
                          <div className="text-muted-foreground">
                            Est. duration: {phase.phase_definition.estimated_duration_minutes} min
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default WorkflowProgress;
