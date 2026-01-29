// /components/admin/conflict-queue.tsx
// Admin component for reviewing and resolving conflict checks
// Task 39 — P1
// VERSION: 1.0 — January 28, 2026

'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow } from 'date-fns';

// Types
interface ConflictEvent {
  id: string;
  order_id: string;
  conflict_type: 'case_number' | 'party_name' | 'attorney' | 'same_firm';
  conflicting_order_id: string;
  similarity_score: number;
  status: 'pending' | 'approved' | 'rejected' | 'auto_cleared';
  details: {
    matched_field: string;
    original_value: string;
    conflicting_value: string;
    normalized_original?: string;
    normalized_conflict?: string;
  };
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  // Joined data
  order?: {
    case_number: string;
    client_name: string;
    motion_type: string;
    user_id: string;
  };
  conflicting_order?: {
    case_number: string;
    client_name: string;
    motion_type: string;
    user_id: string;
  };
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
 */
export function ConflictQueue({
  pendingOnly = true,
  limit = 50,
  onResolve
}: ConflictQueueProps) {
  const [conflicts, setConflicts] = useState<ConflictEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch conflicts
  useEffect(() => {
    fetchConflicts();
  }, [pendingOnly, limit]);

  async function fetchConflicts() {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('conflict_events')
        .select(`
          *,
          order:orders!conflict_events_order_id_fkey(
            case_number,
            client_name,
            motion_type,
            user_id
          ),
          conflicting_order:orders!conflict_events_conflicting_order_id_fkey(
            case_number,
            client_name,
            motion_type,
            user_id
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (pendingOnly) {
        query = query.eq('status', 'pending');
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
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
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from('conflict_events')
        .update({
          status: resolution,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: resolutionNotes || null,
        })
        .eq('id', conflictId);

      if (updateError) throw updateError;

      // If approved, may need to update order status
      if (resolution === 'approved') {
        const conflict = conflicts.find(c => c.id === conflictId);
        if (conflict) {
          await supabase
            .from('orders')
            .update({ conflict_status: 'cleared' })
            .eq('id', conflict.order_id);
        }
      }

      // If rejected, may need to flag order
      if (resolution === 'rejected') {
        const conflict = conflicts.find(c => c.id === conflictId);
        if (conflict) {
          await supabase
            .from('orders')
            .update({
              conflict_status: 'conflict_confirmed',
              status: 'hold_conflict',
            })
            .eq('id', conflict.order_id);
        }
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

  // Get conflict type badge color
  function getConflictBadgeColor(type: ConflictEvent['conflict_type']): string {
    switch (type) {
      case 'case_number': return 'bg-red-100 text-red-800';
      case 'party_name': return 'bg-orange-100 text-orange-800';
      case 'attorney': return 'bg-yellow-100 text-yellow-800';
      case 'same_firm': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  // Get similarity indicator
  function getSimilarityIndicator(score: number): { color: string; label: string } {
    if (score >= 0.95) return { color: 'text-red-600', label: 'Exact Match' };
    if (score >= 0.85) return { color: 'text-orange-600', label: 'High' };
    if (score >= 0.70) return { color: 'text-yellow-600', label: 'Medium' };
    return { color: 'text-gray-600', label: 'Low' };
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
          const similarity = getSimilarityIndicator(conflict.similarity_score);
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
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getConflictBadgeColor(conflict.conflict_type)}`}>
                    {conflict.conflict_type.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className={`text-sm font-medium ${similarity.color}`}>
                    {Math.round(conflict.similarity_score * 100)}% - {similarity.label}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(conflict.created_at), { addSuffix: true })}
                </span>
              </div>

              {/* Conflict Details */}
              <div className="mt-3 grid grid-cols-2 gap-4">
                {/* Original Order */}
                <div className="p-3 bg-white border border-gray-200 rounded">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">New Order</p>
                  <p className="font-medium text-gray-900">{conflict.order?.case_number || 'N/A'}</p>
                  <p className="text-sm text-gray-600">{conflict.order?.client_name}</p>
                  <p className="text-xs text-gray-500">{conflict.order?.motion_type}</p>
                </div>

                {/* Conflicting Order */}
                <div className="p-3 bg-white border border-gray-200 rounded">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Existing Order</p>
                  <p className="font-medium text-gray-900">{conflict.conflicting_order?.case_number || 'N/A'}</p>
                  <p className="text-sm text-gray-600">{conflict.conflicting_order?.client_name}</p>
                  <p className="text-xs text-gray-500">{conflict.conflicting_order?.motion_type}</p>
                </div>
              </div>

              {/* Match Details */}
              <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                <span className="text-gray-500">Matched on: </span>
                <span className="font-medium">{conflict.details.matched_field}</span>
                {conflict.details.normalized_original && (
                  <span className="text-gray-500 ml-2">
                    (Normalized: {conflict.details.normalized_original})
                  </span>
                )}
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
