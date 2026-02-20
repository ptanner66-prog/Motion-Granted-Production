'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import type { RefundSuggestion } from '@/lib/payments/refund-calculator';
import { validateRefundOverrideReason } from '@/lib/payments/refund-calculator';

interface ApprovalDetailActionsProps {
  approvalId: string;
  approvalType?: string;
  refundSuggestion?: RefundSuggestion | null;
  orderId?: string;
}

export function ApprovalDetailActions({
  approvalId,
  approvalType,
  refundSuggestion,
  orderId,
}: ApprovalDetailActionsProps) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [notes, setNotes] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Refund override state
  const isRefund = approvalType === 'refund_request' && refundSuggestion != null;
  const [refundAmountDollars, setRefundAmountDollars] = useState(
    isRefund ? (refundSuggestion!.suggestedRefundCents / 100).toFixed(2) : ''
  );
  const [overrideReason, setOverrideReason] = useState('');

  const actualRefundCents = isRefund
    ? Math.round(parseFloat(refundAmountDollars || '0') * 100)
    : 0;
  const isOverride = isRefund && actualRefundCents !== refundSuggestion!.suggestedRefundCents;

  const handleAction = (action: 'approve' | 'reject') => {
    setActionType(action);
    setNotes('');
    setOverrideError(null);
    setDialogOpen(true);
  };

  const processApproval = async () => {
    // Validate override reason for refund overrides
    if (isRefund && actionType === 'approve' && isOverride) {
      const validation = validateRefundOverrideReason(overrideReason);
      if (!validation.valid) {
        setOverrideError(validation.error ?? null);
        return;
      }
    }

    setProcessing(true);
    setDialogOpen(false);

    try {
      const body: Record<string, unknown> = {
        approvalId,
        action: actionType,
        notes: notes || undefined,
      };

      // Include refund data for refund_request approvals
      if (isRefund && actionType === 'approve') {
        body.refundAmountCents = actualRefundCents;
        body.overrideReason = isOverride ? overrideReason : undefined;
        body.orderId = orderId;
        body.suggestedRefundCents = refundSuggestion!.suggestedRefundCents;
        body.suggestedPercentage = refundSuggestion!.suggestedPercentage;
      }

      const response = await fetch('/api/automation/approval-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        router.refresh();
        router.push('/admin/automation/approvals');
      } else {
        const error = await response.json();
        console.error('Failed to process approval:', error);
        setProcessing(false);
      }
    } catch (error) {
      console.error('Error processing approval:', error);
      setProcessing(false);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Refund amount override (refund_request only) */}
          {isRefund && (
            <div className="mb-2">
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Refund Amount ($)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={refundAmountDollars}
                onChange={(e) => {
                  setRefundAmountDollars(e.target.value);
                  setOverrideError(null);
                }}
              />
              {isOverride && (
                <div className="mt-2">
                  <div className="flex items-center gap-1 text-amber-600 text-xs mb-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Differs from suggested ${(refundSuggestion!.suggestedRefundCents / 100).toFixed(2)}</span>
                  </div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Override Reason (required, min 10 chars)
                  </label>
                  <Textarea
                    value={overrideReason}
                    onChange={(e) => {
                      setOverrideReason(e.target.value);
                      setOverrideError(null);
                    }}
                    placeholder="Explain why you're deviating from the suggested amount..."
                    rows={2}
                  />
                  {overrideError && (
                    <p className="text-xs text-red-600 mt-1">{overrideError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Decision Notes (optional)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about your decision..."
              rows={3}
            />
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={() => handleAction('approve')}
            disabled={processing}
          >
            {processing && actionType === 'approve' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Approve
          </Button>
          <Button
            variant="outline"
            className="w-full text-red-600 hover:bg-red-50"
            onClick={() => handleAction('reject')}
            disabled={processing}
          >
            {processing && actionType === 'reject' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Reject
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'approve' ? 'Approve' : 'Reject'} this request?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'approve'
                ? isRefund
                  ? `This will approve a refund of $${(actualRefundCents / 100).toFixed(2)}. Stripe refund must be processed separately.`
                  : 'This will approve the automation action and proceed with the workflow.'
                : 'This will reject the automation action. You may need to take manual action.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {notes && (
            <div className="py-2">
              <p className="text-sm text-gray-500">Your notes:</p>
              <p className="text-sm bg-gray-50 rounded p-2 mt-1">{notes}</p>
            </div>
          )}

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
              Confirm {actionType === 'approve' ? 'Approval' : 'Rejection'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
