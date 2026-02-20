'use client';

/**
 * Checkpoint Panel — CHK-019 to CHK-032
 *
 * Unified admin checkpoint management component.
 * Displays active checkpoints (HOLD @ Phase III, NOTIFICATION @ Phase IV,
 * BLOCKING @ Phase X) with actions: Approve, Request Changes, Cancel.
 *
 * Used on admin order detail page and admin queue page.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Shield,
  FileText,
  RotateCcw,
  Bell,
  Pause,
  AlertOctagon,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface CheckpointPanelProps {
  orderId: string;
  orderNumber: string;
}

interface CheckpointData {
  id: string;
  orderId: string;
  checkpointType: 'HOLD' | 'NOTIFICATION' | 'BLOCKING';
  phase: string;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'CANCELLED' | 'TIMED_OUT';
  reason: string;
  details?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  // HOLD-specific
  holdType?: string;
  missingItems?: string[];
  clientResponseAt?: string;
  // Quality metrics
  qualityScore?: number;
  citationCount?: number;
  criticalIssues?: number;
}

type CheckpointAction = 'approve' | 'request_changes' | 'cancel';

// ============================================================================
// CHECKPOINT TYPE CONFIG
// ============================================================================

const CHECKPOINT_CONFIG: Record<string, {
  icon: typeof Shield;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  HOLD: {
    icon: Pause,
    label: 'Evidence Gap HOLD',
    description: 'Workflow paused pending client response to evidence gaps.',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  NOTIFICATION: {
    icon: Bell,
    label: 'Research Complete',
    description: 'Legal research phase complete. Non-blocking notification.',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  BLOCKING: {
    icon: AlertOctagon,
    label: 'Final Review Required',
    description: 'Filing package complete. Admin review required before delivery.',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
};

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Pending', variant: 'destructive' },
  APPROVED: { label: 'Approved', variant: 'default' },
  CHANGES_REQUESTED: { label: 'Changes Requested', variant: 'secondary' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
  TIMED_OUT: { label: 'Timed Out', variant: 'outline' },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function CheckpointPanel({ orderId, orderNumber }: CheckpointPanelProps) {
  const router = useRouter();
  const [checkpoints, setCheckpoints] = useState<CheckpointData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCheckpoints = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflow/${orderId}/checkpoints`);
      if (res.ok) {
        const data = await res.json();
        setCheckpoints(data.checkpoints || []);
      }
    } catch (err) {
      console.error('Failed to fetch checkpoints:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchCheckpoints();
    // Poll every 30s for updates
    const interval = setInterval(fetchCheckpoints, 30000);
    return () => clearInterval(interval);
  }, [fetchCheckpoints]);

  const handleAction = async (checkpointId: string, action: CheckpointAction) => {
    if ((action === 'request_changes' || action === 'cancel') && !feedback.trim()) {
      setError('Please provide feedback for this action.');
      return;
    }

    setActionLoading(checkpointId);
    setError(null);

    try {
      const res = await fetch(`/api/workflow/${orderId}/checkpoints/${checkpointId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          feedback: feedback.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to process checkpoint action');
      }

      setFeedback('');
      setSelectedCheckpoint(null);
      router.refresh();
      await fetchCheckpoints();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
          <p className="text-sm text-gray-500 mt-2">Loading checkpoints...</p>
        </CardContent>
      </Card>
    );
  }

  const activeCheckpoints = checkpoints.filter(cp => cp.status === 'PENDING');
  const resolvedCheckpoints = checkpoints.filter(cp => cp.status !== 'PENDING');

  if (checkpoints.length === 0) {
    return null; // Don't render if no checkpoints
  }

  return (
    <div className="space-y-4">
      {/* Active Checkpoints */}
      {activeCheckpoints.map(checkpoint => {
        const config = CHECKPOINT_CONFIG[checkpoint.checkpointType] || CHECKPOINT_CONFIG.BLOCKING;
        const Icon = config.icon;
        const isSelected = selectedCheckpoint === checkpoint.id;
        const isLoading = actionLoading === checkpoint.id;
        const age = getAge(checkpoint.createdAt);

        return (
          <Card key={checkpoint.id} className={`${config.bgColor} ${config.borderColor} border-2`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.bgColor}`}>
                    <Icon className={`h-5 w-5 ${config.color}`} />
                  </div>
                  <div>
                    <CardTitle className={`text-base ${config.color}`}>
                      {config.label}
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Phase {checkpoint.phase} &middot; {age}
                    </p>
                  </div>
                </div>
                <Badge variant={STATUS_BADGE[checkpoint.status]?.variant || 'outline'}>
                  {STATUS_BADGE[checkpoint.status]?.label || checkpoint.status}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Reason */}
              <div className="text-sm text-gray-700">
                <p>{checkpoint.reason || config.description}</p>
              </div>

              {/* HOLD-specific: Missing items */}
              {checkpoint.holdType === 'evidence_gap' && checkpoint.missingItems && (
                <div className="bg-white/60 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Missing Items:</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {checkpoint.missingItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quality metrics for BLOCKING checkpoints */}
              {checkpoint.checkpointType === 'BLOCKING' && (
                <div className="flex gap-4 text-sm">
                  {checkpoint.qualityScore !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">Quality:</span>
                      <span className={`font-medium ${
                        checkpoint.qualityScore >= 0.8 ? 'text-green-600' :
                        checkpoint.qualityScore >= 0.6 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {Math.round(checkpoint.qualityScore * 100)}%
                      </span>
                    </div>
                  )}
                  {checkpoint.citationCount !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">Citations:</span>
                      <span className="font-medium">{checkpoint.citationCount}</span>
                    </div>
                  )}
                  {(checkpoint.criticalIssues ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-red-600 font-medium">
                        {checkpoint.criticalIssues} critical issue{checkpoint.criticalIssues !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback textarea */}
              {isSelected && (
                <div className="space-y-2">
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Add feedback or revision notes..."
                    className="bg-white"
                    rows={3}
                  />
                  {error && (
                    <p className="text-xs text-red-600">{error}</p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                {/* Approve */}
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => handleAction(checkpoint.id, 'approve')}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Approve
                </Button>

                {/* Request Changes */}
                {checkpoint.checkpointType !== 'NOTIFICATION' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={() => {
                      if (isSelected) {
                        handleAction(checkpoint.id, 'request_changes');
                      } else {
                        setSelectedCheckpoint(checkpoint.id);
                        setError(null);
                      }
                    }}
                    disabled={isLoading}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Request Changes
                  </Button>
                )}

                {/* Cancel */}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    if (isSelected) {
                      handleAction(checkpoint.id, 'cancel');
                    } else {
                      setSelectedCheckpoint(checkpoint.id);
                      setError(null);
                    }
                  }}
                  disabled={isLoading}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Resolved Checkpoints (collapsed) */}
      {resolvedCheckpoints.length > 0 && (
        <Card className="border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">
              Resolved Checkpoints ({resolvedCheckpoints.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resolvedCheckpoints.map(checkpoint => {
                const config = CHECKPOINT_CONFIG[checkpoint.checkpointType] || CHECKPOINT_CONFIG.BLOCKING;
                const statusBadge = STATUS_BADGE[checkpoint.status] || STATUS_BADGE.PENDING;

                return (
                  <div key={checkpoint.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-300" />
                      <span className="text-sm text-gray-600">{config.label}</span>
                      <span className="text-xs text-gray-400">Phase {checkpoint.phase}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusBadge.variant} className="text-xs">
                        {statusBadge.label}
                      </Badge>
                      {checkpoint.resolvedAt && (
                        <span className="text-xs text-gray-400">
                          {new Date(checkpoint.resolvedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getAge(dateStr: string): string {
  const now = Date.now();
  const created = new Date(dateStr).getTime();
  const diffMinutes = Math.round((now - created) / (60 * 1000));

  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
