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
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Shield,
  Users,
  FileCheck,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ApprovalItem {
  id: string;
  approval_type: string;
  order_id: string | null;
  request_details: Record<string, unknown>;
  ai_recommendation: string | null;
  ai_reasoning: string | null;
  ai_confidence: number | null;
  urgency: string;
  created_at: string;
  orders?: {
    order_number: string;
    case_caption: string;
    motion_type: string;
  } | null;
}

const approvalTypeConfig: Record<string, { icon: typeof Shield; label: string; color: string }> = {
  conflict_review: { icon: Shield, label: 'Conflict Review', color: 'text-orange-600 bg-orange-50' },
  clerk_assignment: { icon: Users, label: 'Clerk Assignment', color: 'text-blue-600 bg-blue-50' },
  qa_override: { icon: FileCheck, label: 'QA Override', color: 'text-purple-600 bg-purple-50' },
  refund_request: { icon: DollarSign, label: 'Refund Request', color: 'text-red-600 bg-red-50' },
  change_order: { icon: DollarSign, label: 'Change Order', color: 'text-green-600 bg-green-50' },
  deadline_extension: { icon: Clock, label: 'Deadline Extension', color: 'text-yellow-600 bg-yellow-50' },
};

const urgencyConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-700' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700' },
};

export function ApprovalQueueList({ approvals }: { approvals: ApprovalItem[] }) {
  const router = useRouter();
  const [processing, setProcessing] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [notes, setNotes] = useState('');

  if (approvals.length === 0) {
    return (
      <div className="py-12 text-center">
        <CheckCircle className="h-12 w-12 mx-auto mb-3 text-emerald-400" />
        <h3 className="text-lg font-semibold text-navy mb-1">All caught up!</h3>
        <p className="text-gray-500">No pending approvals at this time.</p>
      </div>
    );
  }

  const handleAction = (approval: ApprovalItem, action: 'approve' | 'reject') => {
    setSelectedApproval(approval);
    setActionType(action);
    setNotes('');
    setDialogOpen(true);
  };

  const processApproval = async () => {
    if (!selectedApproval) return;

    setProcessing(selectedApproval.id);
    setDialogOpen(false);

    try {
      const response = await fetch('/api/automation/approval-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId: selectedApproval.id,
          action: actionType,
          notes: notes || undefined,
        }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        console.error('Failed to process approval');
      }
    } catch (error) {
      console.error('Error processing approval:', error);
    } finally {
      setProcessing(null);
      setSelectedApproval(null);
    }
  };

  return (
    <>
      <div className="divide-y divide-gray-100">
        {approvals.map((approval) => {
          const config = approvalTypeConfig[approval.approval_type] || {
            icon: AlertTriangle,
            label: approval.approval_type,
            color: 'text-gray-600 bg-gray-50',
          };
          const urgency = urgencyConfig[approval.urgency] || urgencyConfig.normal;
          const Icon = config.icon;
          const order = approval.orders;

          return (
            <div
              key={approval.id}
              className="py-4 first:pt-0 last:pb-0"
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${config.color.split(' ')[1]}`}>
                  <Icon className={`h-5 w-5 ${config.color.split(' ')[0]}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                      {config.label}
                    </span>
                    <Badge variant="outline" className={urgency.color}>
                      {urgency.label}
                    </Badge>
                    {order && (
                      <Link
                        href={`/admin/orders/${approval.order_id}`}
                        className="text-xs font-mono text-gray-400 hover:text-teal"
                      >
                        {order.order_number}
                      </Link>
                    )}
                  </div>

                  {order && (
                    <p className="text-sm font-medium text-navy truncate mb-1">
                      {order.case_caption}
                    </p>
                  )}

                  {approval.ai_recommendation && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-medium">AI:</span>
                      <span>{approval.ai_recommendation}</span>
                      {approval.ai_confidence !== null && (
                        <span className="text-xs text-gray-400">
                          ({Math.round(approval.ai_confidence * 100)}% confidence)
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(approval.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleAction(approval, 'reject')}
                    disabled={processing === approval.id}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleAction(approval, 'approve')}
                    disabled={processing === approval.id}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Link href={`/admin/automation/approvals/${approval.id}`}>
                    <Button variant="ghost" size="sm">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'approve' ? 'Approve' : 'Reject'} this item?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'approve'
                ? 'This will approve the automation action and proceed with the workflow.'
                : 'This will reject the automation action. You may need to take manual action.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium text-gray-700">
              Notes (optional)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this decision..."
              className="mt-2"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={processApproval}
              className={
                actionType === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }
            >
              {actionType === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
