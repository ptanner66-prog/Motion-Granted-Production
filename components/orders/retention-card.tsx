// components/orders/retention-card.tsx
// Retention status and controls for order detail page
// Task 48 | Version 1.0 — January 28, 2026

'use client';

import { useState, useCallback } from 'react';
import { Calendar, Download, Trash2, Clock, AlertTriangle, Check } from 'lucide-react';

interface RetentionStatus {
  retention_expires_at: string | null;
  days_remaining: number | null;
  can_extend: boolean;
  max_extension_date: string;
  extended_by_customer: boolean;
  is_deleted?: boolean;
}

interface RetentionCardProps {
  orderId: string;
  initialStatus: RetentionStatus;
}

export function RetentionCard({ orderId, initialStatus }: RetentionCardProps) {
  const [status, setStatus] = useState<RetentionStatus>(initialStatus);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/retention`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to refresh status:', err);
    }
  }, [orderId]);

  const expiresAt = status.retention_expires_at
    ? new Date(status.retention_expires_at)
    : null;

  const formattedDate = expiresAt?.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isUrgent = status.days_remaining !== null && status.days_remaining <= 14;

  const handleExtend = async (days: number) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    let newDate = new Date();
    if (expiresAt && expiresAt > newDate) {
      newDate = new Date(expiresAt);
    }
    newDate.setDate(newDate.getDate() + days);

    // Enforce max date
    const maxDate = new Date(status.max_extension_date);
    const finalDate = newDate > maxDate ? maxDate : newDate;

    try {
      const response = await fetch(`/api/orders/${orderId}/retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extend',
          new_expiration_date: finalDate.toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extend retention');
      }

      setShowExtendModal(false);
      setSuccess('Retention extended successfully');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setError('Please type DELETE to confirm');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          confirm: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete');
      }

      setShowDeleteModal(false);
      setStatus({ ...status, is_deleted: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (status.is_deleted) {
    return (
      <div className="bg-gray-100 border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-500 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Order Deleted
        </h3>
        <p className="text-gray-500 mt-2">
          This order&apos;s data has been permanently deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-gray-500" />
        Data Retention
      </h3>

      <p className="text-gray-600 mb-3">
        Your documents will be automatically deleted on:
      </p>

      <div className={`rounded-lg p-4 mb-4 ${isUrgent ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          {isUrgent && <AlertTriangle className="w-5 h-5 text-amber-600" />}
          <p className={`text-xl font-semibold ${isUrgent ? 'text-amber-900' : 'text-gray-900'}`}>
            {formattedDate || 'Not set'}
          </p>
        </div>
        {status.days_remaining !== null && (
          <p className={`text-sm mt-1 ${isUrgent ? 'text-amber-700' : 'text-gray-500'}`}>
            {status.days_remaining} days remaining
          </p>
        )}
        {status.extended_by_customer && (
          <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
            <Check className="w-4 h-4" /> Extended by you
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowExtendModal(true)}
          disabled={!status.can_extend || loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Calendar className="w-4 h-4" />
          Extend Retention
        </button>

        <a
          href={`/api/orders/${orderId}/download`}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download All
        </a>

        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Now
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        Maximum retention: 2 years from delivery
      </p>

      {/* Extend Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h4 className="text-lg font-semibold mb-2">Extend Data Retention</h4>
            <p className="text-gray-600 mb-4 text-sm">
              Current expiration: {formattedDate}
            </p>
            <div className="space-y-2 mb-4">
              <button
                onClick={() => handleExtend(30)}
                disabled={loading}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-left transition-colors disabled:opacity-50"
              >
                <span className="font-medium">+30 days</span>
              </button>
              <button
                onClick={() => handleExtend(90)}
                disabled={loading}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-left transition-colors disabled:opacity-50"
              >
                <span className="font-medium">+90 days</span>
              </button>
              <button
                onClick={() => handleExtend(365)}
                disabled={loading}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-left transition-colors disabled:opacity-50"
              >
                <span className="font-medium">+1 year</span>
              </button>
              <button
                onClick={() => handleExtend(730)}
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-left transition-colors disabled:opacity-50"
              >
                <span className="font-medium">Maximum (2 years)</span>
              </button>
            </div>
            <button
              onClick={() => setShowExtendModal(false)}
              disabled={loading}
              className="w-full px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h4 className="text-lg font-semibold text-red-700 flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5" />
              Delete Order Data
            </h4>
            <p className="text-gray-600 mb-4">
              This action <strong>CANNOT</strong> be undone. The following will be permanently deleted:
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1 text-sm">
              <li>All uploaded documents</li>
              <li>All deliverables (motion, declarations, etc.)</li>
              <li>Case information and drafting instructions</li>
            </ul>
            <p className="text-gray-700 mb-2 font-medium">
              Type &quot;DELETE&quot; to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
              placeholder="DELETE"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 font-mono"
            />
            {error && (
              <p className="text-red-600 text-sm mb-4">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                  setError(null);
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || deleteConfirmText !== 'DELETE'}
                className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
