'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface RestartWorkflowButtonProps {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
}

export function RestartWorkflowButton({ orderId, orderNumber, orderStatus }: RestartWorkflowButtonProps) {
  const router = useRouter();
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestart = async () => {
    setIsRestarting(true);
    setError(null);

    try {
      const response = await fetch('/api/workflow/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to restart workflow');
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch (err) {
      console.error('Restart workflow error:', err);
      setError(err instanceof Error ? err.message : 'Failed to restart workflow');
    } finally {
      setIsRestarting(false);
    }
  };

  // Only show for failed, blocked, or stuck orders - NOT for completed/delivered orders
  const showButton = ['generation_failed', 'on_hold'].includes(orderStatus);

  if (!showButton) {
    return null;
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="lg"
            className="w-full border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-400"
            disabled={isRestarting}
          >
            <RefreshCw className={`mr-2 h-5 w-5 ${isRestarting ? 'animate-spin' : ''}`} />
            {isRestarting ? 'Restarting...' : 'Restart Workflow'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Restart Workflow?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will restart the workflow for <strong>{orderNumber}</strong> from the beginning.
              </p>
              <p className="text-sm">
                <strong>What will happen:</strong>
              </p>
              <ul className="text-sm list-disc list-inside space-y-1 ml-2">
                <li>All workflow phases will be reset</li>
                <li>Previous phase executions will be cleared</li>
                <li>Judge simulation results will be removed</li>
                <li>Order status will be reset to "submitted"</li>
                <li>Original order details will be preserved</li>
              </ul>
              <p className="text-sm font-medium text-orange-600 mt-3">
                This action cannot be undone. The workflow will start fresh.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestart}
              className="bg-orange-600 hover:bg-orange-700"
              disabled={isRestarting}
            >
              {isRestarting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Restarting...
                </>
              ) : (
                'Restart Workflow'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <strong>Error:</strong> {error}
        </div>
      )}
    </>
  );
}
