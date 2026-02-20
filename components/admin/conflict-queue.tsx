// /components/admin/conflict-queue.tsx
// Admin component for reviewing and resolving conflict checks
// T-83: Fixed table name (conflict_events → conflict_matches)
// T-84: Routed through server API (removed browser Supabase client)
// VERSION: 2.0 — February 20, 2026

'use client';

import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

// Types matching conflict_matches schema (01/28 migration)
interface ConflictMatchRow {
  id: string;
  type: 'SAME_CASE_NUMBER' | 'OPPOSING_PARTIES' | 'PRIOR_REPRESENTATION' | 'RELATED_MATTER' | 'SAME_ATTORNEY_BOTH_SIDES';
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  current_order_id: string;
  current_case_number: string;
  current_party_name: string;
  current_opposing_party: string;
  current_attorney_id: string;
  conflicting_order_id: string;
  conflicting_case_number: string;
  conflicting_party_name: string;
  conflicting_opposing_party: string;
  conflicting_attorney_id: string;
  match_field: 'case_number' | 'party_name' | 'opposing_party' | 'attorney';
  match_confidence: number; // 0-100
  match_reason: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  detected_at: string;
  created_at: string;
}

interface ConflictQueueProps {
  /** Filter to show only pending conflicts */
  pendingOnly?: boolean;
  /** Maximum items to display */
  limit?: number;
  /** Callback when conflict is resolved */
  onResolve?: (conflictId: string, resolution: 'approved' | 'rejected') => void;
}

/**
 * Conflict Queue - Admin component for reviewing potential conflicts
 * T-84: All data flows through /api/admin/conflicts (service_role, bypasses RLS)
 */
export function ConflictQueue({
  pendingOnly = true,
  limit = 50,
  onResolve
}: ConflictQueueProps) {
  const [conflicts, setConflicts] = useState<ConflictMatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<ConflictMatchRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  // Fetch conflicts via server API
  useEffect(() => {
    fetchConflicts();
  }, [pendingOnly, limit]);

  async function fetchConflicts() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        pendingOnly: String(pendingOnly),
        limit: String(limit),
      });

      const res = await fetch(`/api/admin/conflicts?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const { conflicts: data } = await res.json();
      setConflicts(data || []);
    } catch (err) {
      console.error('[ConflictQueue] Error fetching conflicts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch conflicts');
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(
    conflictId: string,
    resolution: 'approved' | 'rejected'
  ) {
    setProcessing(conflictId);

    try {
      const conflict = conflicts.find(c => c.id === conflictId);

      const res = await fetch('/api/admin/conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conflictId,
          resolution,
          resolutionNotes: resolutionNotes || null,
          orderId: conflict?.current_order_id,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      // Refresh list
      await fetchConflicts();
      setSelectedConflict(null);
      setResolutionNotes('');

      // Callback
      onResolve?.(conflictId, resolution);

    } catch (err) {
      console.error('[ConflictQueue] Error resolving conflict:', err);
      setError(err instanceof Error ? err.message : 'Failed to resolve conflict');
    } finally {
      setProcessing(null);
    }
  }

  // Get conflict type badge color (T-83: uses conflict_matches type values)
  function getConflictBadgeColor(type: ConflictMatchRow['type']): string {
    switch (type) {
      case 'SAME_CASE_NUMBER': return 'bg-red-100 text-red-800';
      case 'OPPOSING_PARTIES': return 'bg-orange-100 text-orange-800';
      case 'PRIOR_REPRESENTATION': return 'bg-yellow-100 text-yellow-800';
      case 'RELATED_MATTER': return 'bg-blue-100 text-blue-800';
      case 'SAME_ATTORNEY_BOTH_SIDES': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  // Get severity indicator (T-83: uses severity + match_confidence)
  function getSeverityIndicator(severity: ConflictMatchRow['severity'], confidence: number): { color: string; label: string } {
    if (severity === 'BLOCKING') return { color: 'text-red-600', label: `Blocking (${confidence}%)` };
    if (severity === 'WARNING') return { color: 'text-orange-600', label: `Warning (${confidence}%)` };
    return { color: 'text-gray-600', label: `Info (${confidence}%)` };
  }

  // Format type for display
  function formatType(type: string): string {
    return type.replace(/_/g, ' ');
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-500">Loading conflicts...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800 font-medium">Error loading conflicts</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button
          onClick={fetchConflicts}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (conflicts.length === 0) {
    return (
      <div className="p-6 text-center bg-green-50 border border-green-200 rounded-lg">
        <svg className="w-12 h-12 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mt-2 text-green-800 font-medium">No pending conflicts</p>
        <p className="text-green-600 text-sm">All conflict checks are clear.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">
          Conflict Queue
          <span className="ml-2 px-2 py-1 text-sm bg-yellow-100 text-yellow-800 rounded-full">
            {conflicts.length} pending
          </span>
        </h2>
        <button
          onClick={fetchConflicts}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {/* Conflict List */}
      <div className="space-y-3">
        {conflicts.map((conflict) => {
          const severityInfo = getSeverityIndicator(conflict.severity, conflict.match_confidence);
          const isSelected = selectedConflict?.id === conflict.id;
          const isProcessing = processing === conflict.id;

          return (
            <div
              key={conflict.id}
              className={`border rounded-lg p-4 transition-all ${
                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Conflict Header */}
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getConflictBadgeColor(conflict.type)}`}>
                    {formatType(conflict.type)}
                  </span>
                  <span className={`text-sm font-medium ${severityInfo.color}`}>
                    {severityInfo.label}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(conflict.detected_at || conflict.created_at), { addSuffix: true })}
                </span>
              </div>

              {/* Conflict Details — T-83: uses conflict_matches columns directly */}
              <div className="mt-3 grid grid-cols-2 gap-4">
                {/* Current Order */}
                <div className="p-3 bg-white border border-gray-200 rounded">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">New Order</p>
                  <p className="font-medium text-gray-900">{conflict.current_case_number || 'N/A'}</p>
                  <p className="text-sm text-gray-600">{conflict.current_party_name || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">vs {conflict.current_opposing_party || 'N/A'}</p>
                </div>

                {/* Conflicting Order */}
                <div className="p-3 bg-white border border-gray-200 rounded">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Existing Order</p>
                  <p className="font-medium text-gray-900">{conflict.conflicting_case_number || 'N/A'}</p>
                  <p className="text-sm text-gray-600">{conflict.conflicting_party_name || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">vs {conflict.conflicting_opposing_party || 'N/A'}</p>
                </div>
              </div>

              {/* Match Details */}
              <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                <span className="text-gray-500">Matched on: </span>
                <span className="font-medium">{conflict.match_field}</span>
                <span className="text-gray-500 ml-2">— {conflict.match_reason}</span>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center space-x-3">
                {!isSelected ? (
                  <button
                    onClick={() => setSelectedConflict(conflict)}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Review
                  </button>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Resolution notes (optional)"
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleResolve(conflict.id, 'approved')}
                      disabled={isProcessing}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {isProcessing ? 'Processing...' : 'Approve (No Conflict)'}
                    </button>
                    <button
                      onClick={() => handleResolve(conflict.id, 'rejected')}
                      disabled={isProcessing}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {isProcessing ? 'Processing...' : 'Reject (Conflict Exists)'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedConflict(null);
                        setResolutionNotes('');
                      }}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ConflictQueue;
