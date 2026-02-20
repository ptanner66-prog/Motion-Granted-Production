'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Scale,
  BookOpen,
  Shield,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

/**
 * PhaseXApprovalModal Component
 *
 * Phase X (CP3) blocking checkpoint modal for final approval.
 * Requires admin to verify:
 * - Document completeness
 * - Citation accuracy
 * - Legal standards compliance
 * - No ethical concerns
 */

interface PhaseXApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  orderNumber: string;
  orderId: string;
  motionType: string;
  judgeGrade?: string;
  citationCount?: number;
}

const APPROVAL_CHECKLIST = [
  {
    id: 'document_complete',
    label: 'Document is complete with all required sections',
    icon: FileCheck,
  },
  {
    id: 'citations_verified',
    label: 'All citations have been verified and are accurate',
    icon: BookOpen,
  },
  {
    id: 'legal_standards',
    label: 'Motion meets applicable legal standards for jurisdiction',
    icon: Scale,
  },
  {
    id: 'no_ethical_concerns',
    label: 'No ethical concerns or conflicts identified',
    icon: Shield,
  },
];

export function PhaseXApprovalModal({
  isOpen,
  onClose,
  workflowId,
  orderNumber,
  orderId,
  motionType,
  judgeGrade,
  citationCount,
}: PhaseXApprovalModalProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [action, setAction] = useState<'approve' | 'changes' | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const allChecked = APPROVAL_CHECKLIST.every(item => checkedItems[item.id]);

  const handleApprove = async () => {
    if (!allChecked) {
      toast({
        title: 'Checklist Incomplete',
        description: 'Please verify all items before approving.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    setAction('approve');

    try {
      const response = await fetch(`/api/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          action: 'approve',
          internalNotes: notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve');
      }

      toast({
        title: 'Motion Approved',
        description: `${orderNumber} has been approved and delivered to client.`,
      });

      onClose();
      router.refresh();
    } catch (error) {
      toast({
        title: 'Approval Failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setAction(null);
    }
  };

  const handleRequestChanges = async () => {
    if (!notes.trim()) {
      toast({
        title: 'Feedback Required',
        description: 'Please provide feedback for the requested changes.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    setAction('changes');

    try {
      const response = await fetch('/api/workflow/request-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          phaseCode: 'X',
          feedback: notes,
          revisionInstructions: notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request changes');
      }

      toast({
        title: 'Changes Requested',
        description: `Revision loop ${data.newLoop} of ${data.maxLoops} initiated.`,
      });

      onClose();
      router.refresh();
    } catch (error) {
      toast({
        title: 'Request Failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setAction(null);
    }
  };

  const toggleItem = (id: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-6 w-6 text-purple-600" />
            Phase X - Final Approval
          </DialogTitle>
          <DialogDescription>
            Review and approve {orderNumber} for client delivery.
          </DialogDescription>
        </DialogHeader>

        {/* Motion Summary */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Motion Type</span>
            <span className="font-medium text-gray-900">{motionType}</span>
          </div>
          {judgeGrade && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Judge Simulation Grade</span>
              <span className={cn(
                'font-bold',
                judgeGrade.startsWith('A') ? 'text-green-600' :
                judgeGrade.startsWith('B') ? 'text-blue-600' : 'text-orange-600'
              )}>
                {judgeGrade}
              </span>
            </div>
          )}
          {citationCount !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Verified Citations</span>
              <span className="font-medium text-gray-900">{citationCount}</span>
            </div>
          )}
        </div>

        {/* Approval Checklist */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-gray-700">
            Approval Checklist
          </Label>
          {APPROVAL_CHECKLIST.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                  checkedItems[item.id]
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                )}
                onClick={() => toggleItem(item.id)}
              >
                <Checkbox
                  id={item.id}
                  checked={checkedItems[item.id] || false}
                  onCheckedChange={() => toggleItem(item.id)}
                />
                <Icon className={cn(
                  'h-5 w-5',
                  checkedItems[item.id] ? 'text-green-600' : 'text-gray-400'
                )} />
                <Label
                  htmlFor={item.id}
                  className="cursor-pointer flex-1 text-sm"
                >
                  {item.label}
                </Label>
              </div>
            );
          })}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes" className="text-sm font-semibold text-gray-700">
            Notes / Feedback
            {!allChecked && (
              <span className="text-orange-600 font-normal ml-1">
                (required for changes)
              </span>
            )}
          </Label>
          <Textarea
            id="notes"
            placeholder="Add any notes or feedback for this approval..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[100px]"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleRequestChanges}
            disabled={isSubmitting || !notes.trim()}
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            {isSubmitting && action === 'changes' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4 mr-2" />
            )}
            Request Changes
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isSubmitting || !allChecked}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting && action === 'approve' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Approve & Deliver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PhaseXApprovalModal;
