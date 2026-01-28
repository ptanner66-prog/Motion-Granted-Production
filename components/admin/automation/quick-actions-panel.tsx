'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  Zap,
  RefreshCw,
  AlertTriangle,
  Clock,
  FileText,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface QuickActionsPanelProps {
  pendingReviewCount: number;
  inProgressCount: number;
  submittedCount: number;
  failedCount: number;
  recentOrders: Array<{
    id: string;
    order_number: string;
    status: string;
    motion_type: string;
  }>;
}

export function QuickActionsPanel({
  pendingReviewCount,
  inProgressCount,
  submittedCount,
  failedCount,
  recentOrders,
}: QuickActionsPanelProps) {
  const [isResetting, setIsResetting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleResetQueue = async () => {
    if (!confirm('This will RESTART all stuck orders from the beginning. Their workflows will be cleared and they will be regenerated from Phase I. Continue?')) return;

    setIsResetting(true);
    try {
      const response = await fetch('/api/admin/reset-queue', { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        toast({ title: 'Queue Reset', description: data.message });
        router.refresh();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reset',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const totalActionable = pendingReviewCount + failedCount + submittedCount;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Status Overview */}
      <Card className={totalActionable > 0 ? 'border-amber-200 bg-amber-50' : 'border-teal-200 bg-teal-50'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            {totalActionable > 0 ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span className="text-amber-800">Action Required</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-teal-600" />
                <span className="text-teal-800">All Clear</span>
              </>
            )}
          </CardTitle>
          <CardDescription className={totalActionable > 0 ? 'text-amber-700' : 'text-teal-700'}>
            {pendingReviewCount > 0 && (
              <span className="block">
                <strong>{pendingReviewCount}</strong> motion(s) ready for review
              </span>
            )}
            {submittedCount > 0 && (
              <span className="block">
                <strong>{submittedCount}</strong> order(s) waiting to generate
              </span>
            )}
            {inProgressCount > 0 && (
              <span className="block">
                <strong>{inProgressCount}</strong> currently generating
              </span>
            )}
            {failedCount > 0 && (
              <span className="block text-red-600">
                <strong>{failedCount}</strong> failed - needs attention
              </span>
            )}
            {totalActionable === 0 && (
              <span>No pending actions. System is running smoothly.</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="flex flex-wrap gap-2">
            {pendingReviewCount > 0 && (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700" asChild>
                <Link href="/admin/queue">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Review & Approve ({pendingReviewCount})
                </Link>
              </Button>
            )}
            {(failedCount > 0 || submittedCount > 0) && (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={handleResetQueue}
                disabled={isResetting}
              >
                {isResetting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Reset Queue
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-400" />
            Recent Orders
          </CardTitle>
          <CardDescription>Latest orders requiring action</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {recentOrders.length > 0 ? (
            <div className="space-y-2">
              {recentOrders.slice(0, 5).map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="font-mono text-sm">{order.order_number}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No recent orders</p>
          )}
          <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
            <Link href="/admin/orders">View All Orders</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    pending_review: { color: 'bg-teal-100 text-teal-700', label: 'Ready' },
    in_progress: { color: 'bg-blue-100 text-blue-700', label: 'Generating' },
    submitted: { color: 'bg-gray-100 text-gray-700', label: 'Queued' },
    generation_failed: { color: 'bg-red-100 text-red-700', label: 'Failed' },
    draft_delivered: { color: 'bg-teal-100 text-teal-700', label: 'Delivered' },
  };

  const cfg = config[status] || { color: 'bg-gray-100 text-gray-700', label: status };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
