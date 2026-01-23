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
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // Don't show if already has a motion ready or in progress
  const alreadyGenerated = ['pending_review', 'draft_delivered', 'completed', 'revision_delivered'].includes(orderStatus);
  const isInProgress = ['generating', 'in_progress'].includes(orderStatus);

  // Handle starting the 14-phase workflow
  const handleGenerateNow = async () => {
    setIsGenerating(true);
    setError(null);

    try {
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
            disabled={isGenerating || isInProgress}
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
