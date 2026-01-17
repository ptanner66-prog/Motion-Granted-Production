'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface RevisionRequestFormProps {
  orderId: string;
  orderNumber: string;
  revisionCount: number;
  maxRevisions?: number;
  disabled?: boolean;
}

export function RevisionRequestForm({
  orderId,
  orderNumber,
  revisionCount,
  maxRevisions = 2,
  disabled = false,
}: RevisionRequestFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [revisionDetails, setRevisionDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const remainingRevisions = maxRevisions - revisionCount;
  const canRequestRevision = remainingRevisions > 0 && !disabled;

  const handleSubmit = async () => {
    if (!revisionDetails.trim() || revisionDetails.trim().length < 10) {
      setError('Please provide detailed revision instructions (at least 10 characters)');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/revision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ revisionDetails: revisionDetails.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to submit revision request');
      }

      setSuccess(true);
      setRevisionDetails('');

      // Refresh the page after a short delay
      setTimeout(() => {
        setIsOpen(false);
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canRequestRevision) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <RefreshCw className="h-4 w-4" />
        No Revisions Left
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Request Revision
          <span className="ml-1 text-xs bg-gray-100 px-1.5 py-0.5 rounded-full">
            {remainingRevisions} left
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-teal" />
            Request Revision
          </DialogTitle>
          <DialogDescription>
            Submit revision instructions for order {orderNumber}. You have {remainingRevisions} free revision{remainingRevisions !== 1 ? 's' : ''} remaining.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <Alert className="border-emerald-200 bg-emerald-50">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <AlertTitle className="text-emerald-800">Revision Request Submitted</AlertTitle>
            <AlertDescription className="text-emerald-700">
              Your revision request has been received. We&apos;ll assign a clerk and begin working on your revisions shortly.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4 py-4">
              <div>
                <label htmlFor="revision-details" className="block text-sm font-medium text-navy mb-2">
                  Revision Instructions
                </label>
                <Textarea
                  id="revision-details"
                  placeholder="Please describe the changes you'd like made to your draft. Be as specific as possible, including page numbers, sections, or specific text that needs to be revised..."
                  value={revisionDetails}
                  onChange={(e) => setRevisionDetails(e.target.value)}
                  className="min-h-[150px] resize-none"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum 10 characters. The more detail you provide, the better we can address your concerns.
                </p>
              </div>

              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Important</AlertTitle>
                <AlertDescription className="text-amber-700">
                  Each order includes {maxRevisions} free revisions. Additional revisions may incur charges.
                  Revisions are for adjustments to the existing draft, not for changes to the original case facts or instructions.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || revisionDetails.trim().length < 10}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Submit Revision Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
