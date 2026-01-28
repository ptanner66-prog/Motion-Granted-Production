'use client';

/**
 * Workflow Health Card (Task 54)
 *
 * Shows workflow system health metrics
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Activity, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface WorkflowHealth {
  activeOrders: number;
  completedToday: number;
  avgProcessingTime: number; // hours
  failedWorkflows: number;
  pendingCheckpoints: number;
  phaseDistribution: Record<string, number>;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

export function WorkflowHealthCard() {
  const [health, setHealth] = useState<WorkflowHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const response = await fetch('/api/admin/analytics/workflow-health');
        if (response.ok) {
          const data = await response.json();
          setHealth(data);
        }
      } catch (err) {
        console.error('Failed to fetch workflow health:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchHealth();
  }, []);

  const statusColors = {
    healthy: 'text-green-500 bg-green-50',
    degraded: 'text-yellow-500 bg-yellow-50',
    unhealthy: 'text-red-500 bg-red-50',
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Workflow Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Workflow Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Unable to load workflow health</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Workflow Health
        </CardTitle>
        <CardDescription>System processing status</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Status Badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 ${statusColors[health.healthStatus]}`}>
          {health.healthStatus === 'healthy' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span className="font-medium capitalize">{health.healthStatus}</span>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-sm">Active</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{health.activeOrders}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Today</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{health.completedToday}</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Avg Time</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">{health.avgProcessingTime.toFixed(1)}h</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Failed</span>
            </div>
            <p className="text-2xl font-bold text-red-900">{health.failedWorkflows}</p>
          </div>
        </div>

        {/* Pending Checkpoints */}
        {health.pendingCheckpoints > 0 && (
          <div className="p-3 bg-yellow-50 rounded-lg mb-4">
            <div className="flex items-center justify-between">
              <span className="text-yellow-700">Pending Checkpoints</span>
              <span className="font-bold text-yellow-900">{health.pendingCheckpoints}</span>
            </div>
          </div>
        )}

        {/* Phase Distribution */}
        <div>
          <p className="text-sm font-medium mb-2">Active by Phase</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(health.phaseDistribution)
              .filter(([_, count]) => count > 0)
              .map(([phase, count]) => (
                <span
                  key={phase}
                  className="px-2 py-1 bg-gray-100 rounded text-sm"
                >
                  {phase}: <span className="font-medium">{count}</span>
                </span>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default WorkflowHealthCard;
