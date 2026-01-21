'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Zap, AlertCircle } from 'lucide-react';
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

  // Don't show if already has a motion ready
  const alreadyGenerated = ['pending_review', 'draft_delivered', 'completed', 'revision_delivered'].includes(orderStatus);

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

      // Refresh the page to show updated status
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

  if (alreadyGenerated) {
    return null;
  }

  return (
    <Card className="bg-amber-50 border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
          <Zap className="h-5 w-5" />
          Generate Motion Now
        </CardTitle>
        <CardDescription className="text-amber-700">
          Order {orderNumber} - Direct generation (bypasses queue)
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

        <p className="text-sm text-amber-700">
          Click to generate the motion immediately. This bypasses the queue and generates directly.
        </p>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Motion... (this takes 1-3 minutes)
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Generate Motion Now
            </>
          )}
        </Button>

        <p className="text-xs text-amber-600 text-center">
          Note: This may take 1-3 minutes. Do not close this page.
        </p>
      </CardContent>
    </Card>
  );
}
