'use client';

/**
 * RevisionPaymentModal Component
 *
 * v6.3: Displays payment modal for paid revisions.
 * Integrates with Stripe for payment processing.
 */

import { useState } from 'react';
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface RevisionPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  revisionId: string;
  tier: 'A' | 'B' | 'C' | 'D';
  amount: number;
  revisionNumber: number;
  orderNumber?: string;
}

// Tier descriptions
const TIER_INFO = {
  A: { name: 'Simple Motion', price: 75 },
  B: { name: 'Moderate Motion', price: 125 },
  C: { name: 'Complex Motion', price: 200 },
  D: { name: 'Specialized Motion', price: 300 },
};

export function RevisionPaymentModal({
  open,
  onOpenChange,
  workflowId,
  revisionId,
  tier,
  amount,
  revisionNumber,
  orderNumber,
}: RevisionPaymentModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tierInfo = TIER_INFO[tier];

  const handlePayment = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/workflow/revisions/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workflowId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe checkout
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Revision Payment Required
          </DialogTitle>
          <DialogDescription>
            Your free revision has been used. Additional revisions require payment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order info */}
          {orderNumber && (
            <div className="text-sm text-muted-foreground">
              Order: <span className="font-medium text-foreground">{orderNumber}</span>
            </div>
          )}

          {/* Pricing card */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium">Revision #{revisionNumber}</div>
                <div className="text-sm text-muted-foreground">
                  {tierInfo.name} (Tier {tier})
                </div>
              </div>
              <div className="text-2xl font-bold">${amount}</div>
            </div>

            {/* What's included */}
            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-2">What&apos;s Included:</div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Full document revision based on your feedback
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Updated quality review and judge simulation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Citation re-verification
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Updated supporting documents
                </li>
              </ul>
            </div>
          </div>

          {/* Pricing explanation */}
          <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
            <strong>Revision Pricing:</strong> Each order includes 1 free revision.
            Additional revisions are priced by motion complexity:
            Tier A (Simple): $75 | Tier B (Moderate): $125 | Tier C (Complex): $200 | Tier D (Specialized): $300
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              'Processing...'
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Pay ${amount}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RevisionPaymentModal;
