'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  XCircle,
  Bell,
  Shield,
  FileCheck,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

interface AutomationLogWithOrder {
  id: string;
  order_id: string | null;
  action_type: string;
  action_details: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    case_caption: string;
  } | null;
}

// Action type configurations
const actionConfig: Record<string, {
  icon: typeof XCircle;
  color: string;
  bgColor: string;
  label: string;
}> = {
  payment_failed: { icon: DollarSign, color: 'text-red-600', bgColor: 'bg-red-100', label: 'Payment Failed' },
  notification_failed: { icon: Bell, color: 'text-red-600', bgColor: 'bg-red-100', label: 'Notification Failed' },
  qa_check_failed: { icon: FileCheck, color: 'text-red-600', bgColor: 'bg-red-100', label: 'QA Check Failed' },
  task_failed: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100', label: 'Task Failed' },
  approval_denied: { icon: Shield, color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'Approval Denied' },
  conflict_detected: { icon: AlertTriangle, color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'Conflict Detected' },
  generation_failed: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100', label: 'Generation Failed' },
  order_recovered: { icon: RefreshCw, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Order Recovered' },
};

function getConfig(actionType: string) {
  // Check for exact match first
  if (actionConfig[actionType]) {
    return actionConfig[actionType];
  }

  // Check for partial matches
  if (actionType.includes('failed') || actionType.includes('error')) {
    return { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100', label: formatActionType(actionType) };
  }

  // Default
  return { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-100', label: formatActionType(actionType) };
}

function formatActionType(actionType: string): string {
  return actionType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface ErrorDetailsDialogProps {
  error: AutomationLogWithOrder;
}

export function ErrorDetailsDialog({ error }: ErrorDetailsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = getConfig(error.action_type);
  const Icon = config.icon;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all group">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              <Icon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-navy truncate">
                  {config.label}
                </span>
                {error.orders && (
                  <Badge variant="outline" className="text-xs">
                    {error.orders.order_number}
                  </Badge>
                )}
              </div>
              {error.error_message && (
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {error.error_message}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(error.created_at)}
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${config.bgColor}`}>
              <Icon className={`h-5 w-5 ${config.color}`} />
            </div>
            <div>
              <DialogTitle>{config.label}</DialogTitle>
              <DialogDescription>
                {new Date(error.created_at).toLocaleString()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Order Info */}
          {error.orders && (
            <div className="p-3 rounded-lg bg-gray-50">
              <div className="text-xs text-gray-500 mb-1">Related Order</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-navy">{error.orders.order_number}</div>
                  <div className="text-sm text-gray-600 truncate max-w-[200px]">
                    {error.orders.case_caption}
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/orders/${error.order_id}`}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error.error_message && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100">
              <div className="text-xs text-red-600 font-medium mb-1">Error Message</div>
              <p className="text-sm text-red-800">{error.error_message}</p>
            </div>
          )}

          {/* Action Details */}
          <div>
            <div className="text-xs text-gray-500 mb-2">Action Details</div>
            <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto border border-gray-100 max-h-48">
              {JSON.stringify(error.action_details, null, 2)}
            </pre>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 rounded-lg bg-gray-50">
              <div className="text-xs text-gray-400">Action Type</div>
              <div className="font-mono text-xs text-gray-700">{error.action_type}</div>
            </div>
            <div className="p-2 rounded-lg bg-gray-50">
              <div className="text-xs text-gray-400">Log ID</div>
              <div className="font-mono text-xs text-gray-700 truncate">{error.id}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
