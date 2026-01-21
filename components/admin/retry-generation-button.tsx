'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface RetryGenerationButtonProps {
  orderId: string;
  orderNumber: string;
  errorMessage?: string | null;
}

export function RetryGenerationButton({ orderId, orderNumber, errorMessage }: RetryGenerationButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleRetry = async () => {
    setIsRetrying(true);

    try {
      const response = await fetch('/api/automation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to retry generation');
      }

      toast({
        title: 'Generation Restarted',
        description: `Order ${orderNumber} has been re-queued for processing.`,
      });

      // Refresh the page to show updated status
      router.refresh();
    } catch (error) {
      toast({
        title: 'Retry Failed',
        description: error instanceof Error ? error.message : 'Failed to retry generation',
        variant: 'destructive',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Card className="bg-red-50 border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-red-800">
          <AlertTriangle className="h-5 w-5" />
          Generation Failed
        </CardTitle>
        <CardDescription className="text-red-700">
          Order {orderNumber} failed to generate. You can retry the process.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {errorMessage && (
          <div className="p-2 bg-red-100 rounded text-sm text-red-800 font-mono">
            {errorMessage}
          </div>
        )}
        <p className="text-sm text-red-700">
          Click below to re-queue this order for generation:
        </p>
        <Button
          onClick={handleRetry}
          disabled={isRetrying}
          className="w-full bg-red-600 hover:bg-red-700 text-white"
        >
          {isRetrying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Re-queuing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Generation
            </>
          )}
        </Button>
        <p className="text-xs text-red-600 text-center">
          This will reset the order status and re-attempt motion generation.
        </p>
      </CardContent>
    </Card>
  );
}
