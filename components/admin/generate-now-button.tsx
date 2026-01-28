'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Play, AlertCircle, Workflow } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface GenerateNowButtonProps {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  filingType?: 'initiating' | 'opposition';
}

export function GenerateNowButton({ orderId, orderNumber, orderStatus, filingType }: GenerateNowButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // Don't show if already has a motion ready or completed
  const alreadyGenerated = ['pending_review', 'draft_delivered', 'completed', 'revision_delivered'].includes(orderStatus);
  const isInProgress = ['in_progress'].includes(orderStatus);
  const canResume = ['generation_failed'].includes(orderStatus);

  // Handle starting the 14-phase workflow via v7.2 phase executors
  const handleGenerateNow = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // Use the v7.2 generate endpoint (NOT the old orchestrate endpoint)
      const response = await fetch(`/api/orders/${orderId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start workflow');
      }

      toast({
        title: '14-Phase Workflow Started',
        description: `Order ${orderNumber} is now processing through all 14 phases. Check the progress in the workflow tracker.`,
      });

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start workflow';
      setError(message);
      toast({
        title: 'Workflow Start Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle resuming a paused or failed workflow
  const handleResumeWorkflow = async () => {
    setIsResuming(true);
    setError(null);

    try {
      const response = await fetch('/api/automation/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resume workflow');
      }

      toast({
        title: 'Workflow Resumed',
        description: `Order ${orderNumber} workflow has been resumed.`,
      });

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume workflow';
      setError(message);
      toast({
        title: 'Resume Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsResuming(false);
    }
  };

  if (alreadyGenerated) {
    return null;
  }

  return (
    <Card className="bg-amber-50 border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
          <Workflow className="h-5 w-5" />
          14-Phase Workflow
        </CardTitle>
        <CardDescription className="text-amber-700">
          Order {orderNumber} - v7.2 Workflow Orchestration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isInProgress && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-100 p-2 rounded">
            <Loader2 className="h-4 w-4 animate-spin" />
            Workflow is currently in progress...
          </div>
        )}

        {orderStatus === 'generation_failed' && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-100 p-2 rounded">
            <AlertCircle className="h-4 w-4" />
            Previous workflow failed. You can retry below.
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-100 p-2 rounded">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="grid gap-2">
          <Button
            onClick={handleGenerateNow}
            disabled={isGenerating || isInProgress || isResuming}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting Workflow...
              </>
            ) : isInProgress ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Workflow In Progress...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run 14-Phase Workflow
              </>
            )}
          </Button>

          {canResume && (
            <Button
              onClick={handleResumeWorkflow}
              disabled={isResuming || isGenerating}
              variant="outline"
              className="w-full border-amber-600 text-amber-700 hover:bg-amber-50"
            >
              {isResuming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resuming...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Resume Workflow
                </>
              )}
            </Button>
          )}
        </div>

        <div className="text-xs text-amber-600 space-y-1">
          <p className="font-medium">Workflow phases:</p>
          <p>I → II → III → IV (CP1) → V → V.1 → VI → VII (CP2) → VIII.5 → IX → X (CP3)</p>
          <p className="mt-1">
            Estimated time: Tier A ~5 min, Tier B ~15 min, Tier C ~30 min
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
