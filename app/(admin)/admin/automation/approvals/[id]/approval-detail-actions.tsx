'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface ApprovalDetailActionsProps {
  approvalId: string;
}

export function ApprovalDetailActions({ approvalId }: ApprovalDetailActionsProps) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [notes, setNotes] = useState('');

  const handleAction = (action: 'approve' | 'reject') => {
    setActionType(action);
    setNotes('');
    setDialogOpen(true);
  };

  const processApproval = async () => {
    setProcessing(true);
    setDialogOpen(false);

    try {
      const response = await fetch('/api/automation/approval-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId,
          action: actionType,
          notes: notes || undefined,
        }),
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
                ? 'This will approve the automation action and proceed with the workflow.'
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
