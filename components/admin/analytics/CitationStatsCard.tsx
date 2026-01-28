'use client';

/**
 * Citation Statistics Card (Task 54)
 *
 * Shows citation verification metrics
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface CitationStats {
  totalCitations: number;
  verifiedCount: number;
  failedCount: number;
  flaggedCount: number;
  verificationRate: number;
  avgCitationsPerOrder: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
}

export function CitationStatsCard() {
  const [stats, setStats] = useState<CitationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/admin/analytics/citations');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch citation stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Citation Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Citation Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">No citation data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Citation Statistics
        </CardTitle>
        <CardDescription>Citation verification performance</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold">{stats.totalCitations.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Total Citations</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{stats.verificationRate}%</p>
            <p className="text-sm text-gray-500">Verification Rate</p>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">Verified</span>
            </div>
            <span className="font-medium">{stats.verifiedCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm">Failed</span>
            </div>
            <span className="font-medium">{stats.failedCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">Flagged</span>
            </div>
            <span className="font-medium">{stats.flaggedCount.toLocaleString()}</span>
          </div>
        </div>

        {/* Average */}
        <div className="p-3 bg-blue-50 rounded-lg text-center">
          <p className="text-lg font-semibold text-blue-900">
            {stats.avgCitationsPerOrder.toFixed(1)}
          </p>
          <p className="text-sm text-blue-600">Avg Citations per Order</p>
        </div>

        {/* Top Failure Reasons */}
        {stats.topFailureReasons.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2">Top Failure Reasons</p>
            <div className="space-y-1">
              {stats.topFailureReasons.slice(0, 3).map((reason, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate">{reason.reason}</span>
                  <span className="text-gray-900 font-medium">{reason.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CitationStatsCard;
