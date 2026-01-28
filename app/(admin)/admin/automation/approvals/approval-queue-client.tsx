'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

interface ApprovalItem {
  id: string;
  approval_type: string;
  order_id: string | null;
  request_details: Record<string, unknown>;
  ai_recommendation: string | null;
  ai_reasoning: string | null;
  ai_confidence: number | null;
  urgency: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  review_notes: string | null;
  orders?: {
    order_number: string;
    case_caption: string;
    motion_type: string;
    status: string;
  } | null;
}

interface ApprovalQueueClientProps {
  initialApprovals: ApprovalItem[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  currentFilters: {
    status?: string;
    type?: string;
    urgency?: string;
  };
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
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 animate-pulse' },
};

export function ApprovalQueueClient({
  initialApprovals,
  totalCount,
  currentPage,
  totalPages,
  itemsPerPage,
  currentFilters,
}: ApprovalQueueClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [notes, setNotes] = useState('');

  const isPendingStatus = currentFilters.status === 'pending' || !currentFilters.status;

  // Build URL with filters
  const buildUrl = (page: number) => {
    const params = new URLSearchParams();
    if (currentFilters.status) params.set('status', currentFilters.status);
    if (currentFilters.type) params.set('type', currentFilters.type);
    if (currentFilters.urgency) params.set('urgency', currentFilters.urgency);
    if (page > 1) params.set('page', page.toString());
    return `/admin/automation/approvals?${params.toString()}`;
  };

  const handleAction = (approval: ApprovalItem, action: 'approve' | 'reject') => {
    setSelectedApproval(approval);
    setActionType(action);
    setNotes('');
    setDialogOpen(true);
  };

  const handleBulkAction = (action: 'approve' | 'reject') => {
    setActionType(action);
    setNotes('');
    setBulkDialogOpen(true);
  };

  const processApproval = async () => {
    if (!selectedApproval) return;

    setProcessing((prev) => new Set(prev).add(selectedApproval.id));
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
        startTransition(() => {
          router.refresh();
        });
      } else {
        const error = await response.json();
        console.error('Failed to process approval:', error);
      }
    } catch (error) {
      console.error('Error processing approval:', error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(selectedApproval.id);
        return next;
      });
      setSelectedApproval(null);
    }
  };

  const processBulkApproval = async () => {
    setBulkDialogOpen(false);
    const ids = Array.from(selectedItems);

    // Process in parallel batches of 5 to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      setProcessing((prev) => new Set([...prev, ...batch]));

      await Promise.all(
        batch.map(async (id) => {
          try {
            await fetch('/api/automation/approval-queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                approvalId: id,
                action: actionType,
                notes: notes || `Bulk ${actionType}d`,
              }),
            });
          } catch (error) {
            console.error(`Error processing approval ${id}:`, error);
          }
        })
      );
    }

    setProcessing(new Set());
    setSelectedItems(new Set());
    startTransition(() => {
      router.refresh();
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === initialApprovals.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(initialApprovals.map((a) => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (initialApprovals.length === 0) {
    return (
      <div className="py-16 text-center">
        <CheckCircle className="h-16 w-16 mx-auto mb-4 text-emerald-400" />
        <h3 className="text-xl font-semibold text-navy mb-2">
          {isPendingStatus ? 'All caught up!' : 'No items found'}
        </h3>
        <p className="text-gray-500 max-w-md mx-auto">
          {isPendingStatus
            ? 'There are no pending approvals requiring your attention at this time.'
            : 'No items match your current filters.'}
        </p>
      </div>
    );
  }

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalCount);

  return (
    <>
      {/* Bulk Actions Bar */}
      {isPendingStatus && (
        <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedItems.size === initialApprovals.length && initialApprovals.length > 0}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
            />
            <span className="text-sm text-gray-600">
              {selectedItems.size > 0
                ? `${selectedItems.size} selected`
                : 'Select items for bulk actions'}
            </span>
          </div>
          {selectedItems.size > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() => handleBulkAction('reject')}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject Selected
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleBulkAction('approve')}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve Selected
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Approval List */}
      <div className="divide-y divide-gray-100">
        {initialApprovals.map((approval) => {
          const config = approvalTypeConfig[approval.approval_type] || {
            icon: AlertTriangle,
            label: approval.approval_type,
            color: 'text-gray-600 bg-gray-50',
          };
          const urgency = urgencyConfig[approval.urgency] || urgencyConfig.normal;
          const Icon = config.icon;
          const order = approval.orders;
          const isProcessing = processing.has(approval.id);
          const isSelected = selectedItems.has(approval.id);

          return (
            <div
              key={approval.id}
              className={`py-4 first:pt-0 last:pb-0 transition-opacity ${
                isProcessing ? 'opacity-50' : ''
              } ${isSelected ? 'bg-blue-50/50 -mx-4 px-4' : ''}`}
            >
              <div className="flex items-start gap-4">
                {isPendingStatus && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(approval.id)}
                    disabled={isProcessing}
                    aria-label={`Select approval ${approval.id}`}
                    className="mt-1"
                  />
                )}

                <div className={`p-2 rounded-lg ${config.color.split(' ')[1]}`}>
                  <Icon className={`h-5 w-5 ${config.color.split(' ')[0]}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                    {approval.status !== 'pending' && (
                      <Badge
                        variant="outline"
                        className={
                          approval.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }
                      >
                        {approval.status}
                      </Badge>
                    )}
                  </div>

                  {order && (
                    <p className="text-sm font-medium text-navy truncate mb-1">
                      {order.case_caption}
                    </p>
                  )}

                  {approval.ai_recommendation && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <span className="font-medium">AI:</span>
                      <span>{approval.ai_recommendation}</span>
                      {approval.ai_confidence !== null && (
                        <span className="text-xs text-gray-400">
                          ({Math.round(approval.ai_confidence * 100)}% confidence)
                        </span>
                      )}
                    </div>
                  )}

                  {approval.ai_reasoning && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-1">
                      {approval.ai_reasoning}
                    </p>
                  )}

                  {approval.review_notes && (
                    <p className="text-xs text-gray-500 italic">
                      Note: {approval.review_notes}
                    </p>
                  )}

                  <p className="text-xs text-gray-400 mt-1">
                    Created: {new Date(approval.created_at).toLocaleString()}
                    {approval.resolved_at && (
                      <span className="ml-2">
                        | Resolved: {new Date(approval.resolved_at).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPendingStatus && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleAction(approval, 'reject')}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleAction(approval, 'approve')}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                    </>
                  )}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-6 border-t">
          <p className="text-sm text-gray-500">
            Showing {startItem} to {endItem} of {totalCount} items
          </p>
          <div className="flex items-center gap-2">
            <Link href={buildUrl(currentPage - 1)}>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || isPending}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            </Link>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Link key={pageNum} href={buildUrl(pageNum)}>
                    <Button
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      className={currentPage === pageNum ? 'bg-navy' : ''}
                      disabled={isPending}
                    >
                      {pageNum}
                    </Button>
                  </Link>
                );
              })}
            </div>
            <Link href={buildUrl(currentPage + 1)}>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages || isPending}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Single Item Dialog */}
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

      {/* Bulk Action Dialog */}
      <AlertDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'approve' ? 'Approve' : 'Reject'} {selectedItems.size} items?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will {actionType} all {selectedItems.size} selected items.
              {actionType === 'reject' && ' You may need to take manual action for each.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium text-gray-700">
              Notes (optional - applies to all)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this bulk decision..."
              className="mt-2"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={processBulkApproval}
              className={
                actionType === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }
            >
              {actionType === 'approve' ? 'Approve All' : 'Reject All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
