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
}

export function GenerateNowButton({ orderId, orderNumber, orderStatus }: GenerateNowButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isQueuing, setIsQueuing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // Don't show if already has a motion ready or in progress
  const alreadyGenerated = ['pending_review', 'draft_delivered', 'completed', 'revision_delivered'].includes(orderStatus);
  const isInProgress = ['generating', 'in_progress'].includes(orderStatus);

  // Show resume button for interrupted workflows
  const canResume = ['in_progress', 'generation_failed'].includes(orderStatus);

  // Direct generation via Orchestrator (proper 14-phase workflow)
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/workflow/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          autoRun: true,
          workflowPath: 'path_a',
          skipDocumentParsing: false,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start workflow');
      }

      toast({
        title: 'Workflow Started!',
        description: 'The 14-phase workflow is now processing. This may take 5-10 minutes.',
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

  // Resume interrupted workflow
  const handleResume = async () => {
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
        title: 'Workflow Resumed!',
        description: 'Continuing from the last checkpoint.',
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

  // Queue for generation via Inngest
  const handleQueue = async () => {
    setIsQueuing(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/queue-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to queue order');
      }

      toast({
        title: 'Order Queued!',
        description: `${orderNumber} added to generation queue. It will process in the background.`,
      });

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to queue order';
      setError(message);
      toast({
        title: 'Queue Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsQueuing(false);
    }
  };

  if (alreadyGenerated) {
    return null;
  }

  const isLoading = isGenerating || isQueuing || isResuming;

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
          {canResume ? (
            <Button
              onClick={handleResume}
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {isResuming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resuming Workflow...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Resume Workflow
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting Workflow... (5-10 minutes)
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Generate Now (14-Phase Workflow)
                </>
              )}
            </Button>
          )}

          <Button
            onClick={handleQueue}
            disabled={isLoading}
            variant="outline"
            className="w-full border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            {isQueuing ? (
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
        </div>

        <p className="text-xs text-amber-600 text-center">
          Uses 14-phase workflow with checkpoints. Queue processes in background via Inngest.
        </p>
      </CardContent>
    </Card>
  );
}
