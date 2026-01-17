'use client';

import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Bell,
  Shield,
  Users,
  FileCheck,
  DollarSign,
  Zap,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface ActivityItem {
  id: string;
  order_id: string | null;
  action_type: string;
  action_details: Record<string, unknown>;
  was_auto_approved: boolean;
  created_at: string;
  orders?: {
    order_number: string;
  } | null;
}

const actionConfig: Record<string, {
  icon: typeof CheckCircle;
  color: string;
  bgColor: string;
  label: string;
}> = {
  payment_processed: {
    icon: DollarSign,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Payment Processed',
  },
  payment_failed: {
    icon: DollarSign,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Payment Failed',
  },
  conflict_check_started: {
    icon: Shield,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Conflict Check Started',
  },
  conflict_check_completed: {
    icon: Shield,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Conflict Check Completed',
  },
  conflict_detected: {
    icon: AlertTriangle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    label: 'Conflict Detected',
  },
  conflict_cleared: {
    icon: CheckCircle,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Conflict Cleared',
  },
  clerk_assignment_started: {
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Assignment Started',
  },
  clerk_assigned: {
    icon: Users,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Clerk Assigned',
  },
  notification_queued: {
    icon: Bell,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Notification Queued',
  },
  notification_sent: {
    icon: Bell,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Notification Sent',
  },
  notification_failed: {
    icon: Bell,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Notification Failed',
  },
  qa_check_started: {
    icon: FileCheck,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'QA Check Started',
  },
  qa_check_passed: {
    icon: FileCheck,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'QA Check Passed',
  },
  qa_check_failed: {
    icon: FileCheck,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'QA Check Failed',
  },
  status_changed: {
    icon: RefreshCw,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Status Changed',
  },
  deadline_alert: {
    icon: Clock,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    label: 'Deadline Alert',
  },
  report_generated: {
    icon: FileCheck,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Report Generated',
  },
  approval_requested: {
    icon: Shield,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    label: 'Approval Requested',
  },
  approval_granted: {
    icon: CheckCircle,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Approval Granted',
  },
  approval_denied: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Approval Denied',
  },
  task_scheduled: {
    icon: Clock,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Task Scheduled',
  },
  task_completed: {
    icon: CheckCircle,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Task Completed',
  },
  task_failed: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Task Failed',
  },
  refund_processed: {
    icon: DollarSign,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Refund Processed',
  },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getActionDescription(actionType: string, details: Record<string, unknown>): string {
  switch (actionType) {
    case 'payment_processed':
      return `$${details.amount || 0} payment confirmed`;
    case 'payment_failed':
      return details.error as string || 'Payment failed';
    case 'conflict_detected':
      return `${details.matchCount || 'Multiple'} potential conflict(s)`;
    case 'conflict_cleared':
      return details.autoCleared ? 'Auto-cleared' : 'Manually cleared';
    case 'clerk_assigned':
      return `Assigned to ${details.clerkName || 'clerk'}`;
    case 'notification_sent':
      return details.notificationType as string || 'Notification sent';
    case 'qa_check_passed':
      return `Score: ${details.score || 'N/A'}`;
    case 'qa_check_failed':
      return `${(details.issues as unknown[])?.length || 0} issue(s) found`;
    case 'deadline_alert':
      return `${details.daysUntilDeadline} day(s) remaining`;
    case 'report_generated':
      return `${details.reportType || ''} report`;
    default:
      return '';
  }
}

export function AutomationActivityFeed({ activities }: { activities: ActivityItem[] }) {
  if (activities.length === 0) {
    return (
      <div className="py-12 text-center">
        <Zap className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <h3 className="text-lg font-semibold text-navy mb-1">No recent activity</h3>
        <p className="text-gray-500">Automation events will appear here.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

      <div className="space-y-4">
        {activities.map((activity, index) => {
          const config = actionConfig[activity.action_type] || {
            icon: Zap,
            color: 'text-gray-600',
            bgColor: 'bg-gray-50',
            label: activity.action_type.replace(/_/g, ' '),
          };
          const Icon = config.icon;
          const description = getActionDescription(activity.action_type, activity.action_details);
          const order = activity.orders;

          return (
            <div key={activity.id} className="relative flex gap-4 pl-1">
              {/* Icon */}
              <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.bgColor}`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-navy">
                    {config.label}
                  </span>
                  {activity.was_auto_approved && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                      Auto
                    </span>
                  )}
                  {order && (
                    <Link
                      href={`/admin/orders/${activity.order_id}`}
                      className="text-xs font-mono text-gray-400 hover:text-teal"
                    >
                      {order.order_number}
                    </Link>
                  )}
                </div>

                {description && (
                  <p className="text-sm text-gray-600 mt-0.5">{description}</p>
                )}

                <p className="text-xs text-gray-400 mt-1">
                  {formatTimeAgo(activity.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
