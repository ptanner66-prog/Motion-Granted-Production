'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Zap, AlertCircle, ListOrdered } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // Don't show if already has a motion ready
  const alreadyGenerated = ['pending_review', 'draft_delivered', 'completed', 'revision_delivered'].includes(orderStatus);

  // Direct generation (bypasses queue)
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate motion');
      }

      toast({
        title: 'Motion Generated!',
        description: 'The motion is ready for review. Switch to the Review Motion tab.',
      });

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate motion';
      setError(message);
      toast({
        title: 'Generation Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
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

  const isLoading = isGenerating || isQueuing;

  return (
    <Card className="bg-amber-50 border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
          <Zap className="h-5 w-5" />
          Generate Motion
        </CardTitle>
        <CardDescription className="text-amber-700">
          Order {orderNumber} - Choose generation method
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {orderStatus === 'in_progress' && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-100 p-2 rounded">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generation may already be in progress via queue...
          </div>
        )}

        {orderStatus === 'generation_failed' && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-100 p-2 rounded">
            <AlertCircle className="h-4 w-4" />
            Previous generation failed. Try again below.
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
            onClick={handleGenerate}
            disabled={isLoading}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating... (1-3 minutes)
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Generate Now (Direct)
              </>
            )}
          </Button>

          <Button
            onClick={handleQueue}
            disabled={isLoading}
            variant="outline"
            className="w-full border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            {isQueuing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Queuing...
              </>
            ) : (
              <>
                <ListOrdered className="h-4 w-4 mr-2" />
                Add to Queue (Background)
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-amber-600 text-center">
          Direct: waits on page. Queue: processes in background via Inngest.
        </p>
      </CardContent>
    </Card>
  );
}
