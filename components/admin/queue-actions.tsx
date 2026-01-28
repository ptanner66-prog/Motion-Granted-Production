'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RefreshCw, RotateCcw, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface QueueActionsProps {
  pendingReviewCount: number;
  failedCount: number;
  stuckCount: number;
}

export function QueueActions({ pendingReviewCount, failedCount, stuckCount }: QueueActionsProps) {
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleResetQueue = async () => {
    if (!confirm('This will RESTART all stuck orders from the beginning. Their workflows will be cleared and they will be regenerated. Continue?')) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch('/api/admin/reset-queue', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset queue');
      }

      toast({
        title: 'Queue Reset Complete',
        description: data.message,
      });

      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reset queue',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const hasIssues = failedCount > 0 || stuckCount > 0;

  return (
    <Card className={`bg-white border shadow-sm ${hasIssues ? 'border-l-4 border-l-amber-500 border-gray-200' : 'border-gray-200'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasIssues ? (
              <AlertCircle className="h-5 w-5 text-gray-600" />
            ) : (
              <CheckCircle className="h-5 w-5 text-gray-600" />
            )}
            <CardTitle className="text-lg text-navy">
              {hasIssues ? 'Queue Actions Needed' : 'Queue Status Good'}
            </CardTitle>
          </div>
        </div>
        <CardDescription className="text-gray-600">
          {pendingReviewCount > 0 && (
            <span className="font-medium">{pendingReviewCount} motion(s) ready for review. </span>
          )}
          {failedCount > 0 && (
            <span className="font-medium">{failedCount} failed. </span>
          )}
          {stuckCount > 0 && (
            <span>{stuckCount} may be stuck. </span>
          )}
          {!hasIssues && pendingReviewCount === 0 && (
            <span>All orders are processing normally.</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex flex-wrap gap-2">
          {(failedCount > 0 || stuckCount > 0) && (
            <Button
              onClick={handleResetQueue}
              disabled={isResetting}
              variant="outline"
              size="sm"
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Stuck Orders
                </>
              )}
            </Button>
          )}
          <Button
            onClick={() => router.refresh()}
            variant="ghost"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
