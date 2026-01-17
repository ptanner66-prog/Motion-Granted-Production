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
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface LogEntry {
  id: string;
  order_id: string | null;
  action_type: string;
  action_details: Record<string, unknown>;
  confidence_score: number | null;
  was_auto_approved: boolean;
  owner_override: boolean;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
  orders?: {
    order_number: string;
    case_caption: string;
  } | null;
}

const actionConfig: Record<string, {
  icon: typeof CheckCircle;
  color: string;
  label: string;
}> = {
  payment_processed: { icon: DollarSign, color: 'text-emerald-600', label: 'Payment Processed' },
  payment_failed: { icon: DollarSign, color: 'text-red-600', label: 'Payment Failed' },
  conflict_check_started: { icon: Shield, color: 'text-blue-600', label: 'Conflict Check Started' },
  conflict_check_completed: { icon: Shield, color: 'text-blue-600', label: 'Conflict Check Completed' },
  conflict_detected: { icon: AlertTriangle, color: 'text-orange-600', label: 'Conflict Detected' },
  conflict_cleared: { icon: CheckCircle, color: 'text-emerald-600', label: 'Conflict Cleared' },
  clerk_assignment_started: { icon: Users, color: 'text-blue-600', label: 'Assignment Started' },
  clerk_assigned: { icon: Users, color: 'text-emerald-600', label: 'Clerk Assigned' },
  notification_queued: { icon: Bell, color: 'text-purple-600', label: 'Notification Queued' },
  notification_sent: { icon: Bell, color: 'text-emerald-600', label: 'Notification Sent' },
  notification_failed: { icon: Bell, color: 'text-red-600', label: 'Notification Failed' },
  qa_check_started: { icon: FileCheck, color: 'text-blue-600', label: 'QA Check Started' },
  qa_check_passed: { icon: FileCheck, color: 'text-emerald-600', label: 'QA Check Passed' },
  qa_check_failed: { icon: FileCheck, color: 'text-red-600', label: 'QA Check Failed' },
  status_changed: { icon: RefreshCw, color: 'text-blue-600', label: 'Status Changed' },
  deadline_alert: { icon: Clock, color: 'text-orange-600', label: 'Deadline Alert' },
  report_generated: { icon: FileCheck, color: 'text-purple-600', label: 'Report Generated' },
  approval_requested: { icon: Shield, color: 'text-orange-600', label: 'Approval Requested' },
  approval_granted: { icon: CheckCircle, color: 'text-emerald-600', label: 'Approval Granted' },
  approval_denied: { icon: XCircle, color: 'text-red-600', label: 'Approval Denied' },
  task_scheduled: { icon: Clock, color: 'text-blue-600', label: 'Task Scheduled' },
  task_completed: { icon: CheckCircle, color: 'text-emerald-600', label: 'Task Completed' },
  task_failed: { icon: XCircle, color: 'text-red-600', label: 'Task Failed' },
  refund_processed: { icon: DollarSign, color: 'text-blue-600', label: 'Refund Processed' },
};

export function AutomationLogsTable({ logs }: { logs: LogEntry[] }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  if (logs.length === 0) {
    return (
      <div className="py-12 text-center">
        <Zap className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <h3 className="text-lg font-semibold text-navy mb-1">No logs found</h3>
        <p className="text-gray-500">Automation events will appear here.</p>
      </div>
    );
  }

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Action
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Order
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Confidence
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Details
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log) => {
            const config = actionConfig[log.action_type] || {
              icon: Zap,
              color: 'text-gray-600',
              label: log.action_type.replace(/_/g, ' '),
            };
            const Icon = config.icon;
            const isExpanded = expandedRows.has(log.id);

            return (
              <>
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <span className="text-sm font-medium text-navy">
                        {config.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {log.orders ? (
                      <Link
                        href={`/admin/orders/${log.order_id}`}
                        className="text-sm font-mono text-gray-500 hover:text-teal"
                      >
                        {log.orders.order_number}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.was_auto_approved && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        Auto
                      </Badge>
                    )}
                    {log.owner_override && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Override
                      </Badge>
                    )}
                    {log.error_message && (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        Error
                      </Badge>
                    )}
                    {!log.was_auto_approved && !log.owner_override && !log.error_message && (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.confidence_score !== null ? (
                      <span className="text-sm text-gray-600">
                        {Math.round(log.confidence_score * 100)}%
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                    {log.duration_ms !== null && (
                      <div className="text-xs text-gray-400">
                        {log.duration_ms}ms
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRow(log.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${log.id}-details`} className="bg-gray-50">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="text-sm">
                        <h4 className="font-medium text-navy mb-2">Action Details</h4>
                        <pre className="bg-white p-3 rounded-lg border border-gray-200 overflow-x-auto text-xs text-gray-600">
                          {JSON.stringify(log.action_details, null, 2)}
                        </pre>
                        {log.error_message && (
                          <div className="mt-3">
                            <h4 className="font-medium text-red-600 mb-1">Error Message</h4>
                            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                              {log.error_message}
                            </p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
