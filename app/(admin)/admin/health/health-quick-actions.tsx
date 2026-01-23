'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Clock,
  Mail,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  AlertTriangle,
} from 'lucide-react';

interface QuickActionsProps {
  pendingNotifications: number;
  stuckOrders: number;
}

interface ActionResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export function HealthQuickActions({ pendingNotifications, stuckOrders }: QuickActionsProps) {
  const [isRunningCron, setIsRunningCron] = useState(false);
  const [isProcessingNotifications, setIsProcessingNotifications] = useState(false);
  const [isRecoveringOrders, setIsRecoveringOrders] = useState(false);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);

  const runCronJob = async () => {
    setIsRunningCron(true);
    setLastResult(null);

    try {
      const response = await fetch('/api/automation/cron', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.NEXT_PUBLIC_CRON_SECRET || '',
        },
        body: JSON.stringify({
          scheduleRecurring: true,
          processNotifications: true,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setLastResult({
          success: true,
          message: 'Cron job completed successfully',
          details: data.results,
        });
      } else {
        setLastResult({
          success: false,
          message: data.error || 'Cron job failed',
        });
      }
    } catch (error) {
      setLastResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to run cron job',
      });
    } finally {
      setIsRunningCron(false);
    }
  };

  const processNotificationQueue = async () => {
    setIsProcessingNotifications(true);
    setLastResult(null);

    try {
      const response = await fetch('/api/automation/cron', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.NEXT_PUBLIC_CRON_SECRET || '',
        },
        body: JSON.stringify({
          scheduleRecurring: false,
          processNotifications: true,
          taskTypes: [],
          maxTasks: 0,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setLastResult({
          success: true,
          message: `Processed ${data.results?.notifications?.data?.processed || 0} notifications`,
          details: data.results?.notifications,
        });
      } else {
        setLastResult({
          success: false,
          message: data.error || 'Failed to process notifications',
        });
      }
    } catch (error) {
      setLastResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process notifications',
      });
    } finally {
      setIsProcessingNotifications(false);
    }
  };

  const recoverStuckOrders = async () => {
    setIsRecoveringOrders(true);
    setLastResult(null);

    try {
      // First, try to use the cron endpoint which has recovery logic
      const response = await fetch('/api/automation/cron', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.NEXT_PUBLIC_CRON_SECRET || '',
        },
        body: JSON.stringify({
          scheduleRecurring: false,
          processNotifications: false,
          taskTypes: [],
          maxTasks: 0,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const recovery = data.results?.stuckOrderRecovery;
        setLastResult({
          success: true,
          message: `Recovered ${recovery?.recovered || 0} orders, ${recovery?.timedOut || 0} timed out`,
          details: recovery,
        });
      } else {
        setLastResult({
          success: false,
          message: data.error || 'Failed to recover orders',
        });
      }
    } catch (error) {
      setLastResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to recover orders',
      });
    } finally {
      setIsRecoveringOrders(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="space-y-3">
        {/* Trigger Cron Job */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3"
              disabled={isRunningCron}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 rounded-lg bg-blue-100">
                  {isRunningCron ? (
                    <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                  ) : (
                    <Clock className="h-4 w-4 text-blue-600" />
                  )}
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-navy">Trigger Cron Job</div>
                  <div className="text-xs text-gray-500">
                    Process tasks, schedule recurring jobs, recover stuck orders
                  </div>
                </div>
              </div>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Trigger Cron Job?</AlertDialogTitle>
              <AlertDialogDescription>
                This will manually trigger the automation cron job which:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Processes pending automation tasks</li>
                  <li>Schedules recurring tasks</li>
                  <li>Processes notification queue</li>
                  <li>Recovers stuck orders</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={runCronJob}>
                Run Cron Job
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Process Notification Queue */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3"
              disabled={isProcessingNotifications}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 rounded-lg bg-teal/10">
                  {isProcessingNotifications ? (
                    <Loader2 className="h-4 w-4 text-teal animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 text-teal" />
                  )}
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-navy">Process Notifications</div>
                  <div className="text-xs text-gray-500">
                    Send pending email notifications
                  </div>
                </div>
                {pendingNotifications > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {pendingNotifications} pending
                  </Badge>
                )}
              </div>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Process Notification Queue?</AlertDialogTitle>
              <AlertDialogDescription>
                This will process all pending notifications in the queue.
                {pendingNotifications > 0 && (
                  <span className="block mt-2 font-medium text-navy">
                    Currently {pendingNotifications} notifications waiting to be sent.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={processNotificationQueue}>
                Process Queue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Recover Stuck Orders */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3"
              disabled={isRecoveringOrders}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 rounded-lg bg-amber-100">
                  {isRecoveringOrders ? (
                    <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-navy">Recover Stuck Orders</div>
                  <div className="text-xs text-gray-500">
                    Re-queue orders that failed or got stuck
                  </div>
                </div>
                {stuckOrders > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {stuckOrders} stuck
                  </Badge>
                )}
              </div>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Recover Stuck Orders?</AlertDialogTitle>
              <AlertDialogDescription>
                <div className="space-y-2">
                  <p>This will attempt to recover orders that are stuck in processing:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Orders stuck in submitted/under_review for too long</li>
                    <li>Orders with timed-out generation</li>
                    <li>Orders approaching their filing deadline</li>
                  </ul>
                  {stuckOrders > 0 && (
                    <div className="mt-3 p-2 bg-amber-50 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm text-amber-800">
                        {stuckOrders} orders may need recovery
                      </span>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={recoverStuckOrders}>
                Start Recovery
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Result Display */}
      {lastResult && (
        <div
          className={`p-4 rounded-xl border ${
            lastResult.success
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {lastResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={`font-medium ${
                  lastResult.success ? 'text-emerald-800' : 'text-red-800'
                }`}
              >
                {lastResult.message}
              </p>
              {lastResult.details && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                    View details
                  </summary>
                  <pre className="mt-2 text-xs bg-white/50 p-2 rounded overflow-x-auto">
                    {JSON.stringify(lastResult.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-start gap-2">
          <Zap className="h-4 w-4 text-gray-400 mt-0.5" />
          <p>
            These actions are typically run automatically by the cron job.
            Use manual triggers only when needed for debugging or recovery.
          </p>
        </div>
      </div>
    </div>
  );
}
