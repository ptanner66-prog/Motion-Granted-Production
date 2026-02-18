// app/(admin)/admin/orders/[id]/components/ApproveDeliverButton.tsx
'use client';

import { useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';

interface ApproveDeliverButtonProps {
  orderId: string;
  isValid: boolean | null;
  unauthorizedCount: number;
  warnings: string[];
  strippedCitations: string[];
  adminId: string;
  onDeliveryComplete: () => void;
}

// Audit logging now happens server-side in the deliver route (A16-P0-005 fix)
async function deliverOrder(
  orderId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/admin/orders/${orderId}/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, metadata }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || 'Delivery failed' };
    }

    return { success: true };
  } catch (err) {
    console.error('[Deliver] Error:', err);
    return { success: false, error: 'Network error' };
  }
}

export function ApproveDeliverButton({
  orderId,
  isValid,
  unauthorizedCount,
  warnings,
  strippedCitations,
  adminId,
  onDeliveryComplete,
}: ApproveDeliverButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation data is missing entirely
  if (isValid === null) {
    return (
      <div className="space-y-3">
        <button
          disabled
          className="w-full bg-gray-300 text-gray-500 py-3 px-6 rounded-lg font-semibold cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Approve &amp; Deliver (Validation Required)
          </span>
        </button>
        <p className="text-amber-600 text-sm text-center">
          Citation validation must complete before delivery.
        </p>
      </div>
    );
  }

  // Validation passed - show green approve button
  if (isValid === true) {
    const handleApprove = async () => {
      setIsLoading(true);
      setError(null);

      const result = await deliverOrder(orderId, 'STANDARD_DELIVERY', { isValid: true });
      setIsLoading(false);

      if (result.success) {
        onDeliveryComplete();
      } else {
        setError(result.error || 'Delivery failed');
      }
    };

    return (
      <div className="space-y-2">
        <button
          onClick={handleApprove}
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-2">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
            {isLoading ? 'Delivering...' : 'Approve & Deliver to Client'}
          </span>
        </button>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}
      </div>
    );
  }

  // Validation FAILED - show disabled approve + override option
  const handleOverride = async () => {
    const confirmed = window.confirm(
      `WARNING: Citation validation FAILED.\n\n` +
      `${unauthorizedCount} unauthorized citation(s) detected.\n\n` +
      `Delivering this motion with unverified citations may expose the ` +
      `hiring attorney to sanctions or malpractice claims.\n\n` +
      `Are you sure you want to override and deliver?`
    );

    if (!confirmed) return;

    setIsLoading(true);
    setError(null);

    // Audit logging happens server-side in deliver route
    const result = await deliverOrder(orderId, 'CITATION_OVERRIDE_DELIVERY', {
      unauthorizedCount,
      warnings,
      strippedCitations,
    });
    setIsLoading(false);

    if (result.success) {
      onDeliveryComplete();
    } else {
      setError(result.error || 'Delivery failed');
    }
  };

  return (
    <div className="space-y-3">
      {/* Disabled primary approve button */}
      <button
        disabled
        className="w-full bg-gray-300 text-gray-500 py-3 px-6 rounded-lg font-semibold cursor-not-allowed"
      >
        <span className="flex items-center justify-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Approve &amp; Deliver (Blocked)
        </span>
      </button>
      <p className="text-red-600 text-sm text-center font-medium">
        {unauthorizedCount} unauthorized citation{unauthorizedCount !== 1 ? 's' : ''} detected. Delivery blocked.
      </p>

      {/* Override button */}
      <button
        onClick={handleOverride}
        disabled={isLoading}
        className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2 px-4 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
      >
        <span className="flex items-center justify-center gap-2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ShieldAlert className="w-4 h-4" />
          )}
          {isLoading ? 'Processing...' : 'Override and Deliver Anyway'}
        </span>
      </button>
      <p className="text-amber-600 text-xs text-center">
        This action will be logged to the audit trail.
      </p>

      {error && <p className="text-red-600 text-sm text-center">{error}</p>}
    </div>
  );
}
