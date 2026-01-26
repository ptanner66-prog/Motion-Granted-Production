'use client';

/**
 * Admin Order Queue Enhancement (Task 67)
 *
 * Enhanced admin order queue with:
 * - Filtering by status, tier, date range, assigned admin
 * - Sorting by deadline, created date, tier, status
 * - Bulk actions (pause, resume, cancel, assign)
 * - Real-time updates via Supabase
 *
 * Source: Chunk 9, Task 67 - Gap Analysis B-5
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Clock,
  AlertCircle,
  CheckCircle,
  PauseCircle,
  XCircle,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  User,
  Calendar,
  ArrowUpDown,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface QueueFilters {
  status?: string[];
  tier?: ('A' | 'B' | 'C')[];
  dateFrom?: Date;
  dateTo?: Date;
  assignedTo?: string;
  search?: string;
}

export interface QueueSort {
  field: 'deadline' | 'created_at' | 'tier' | 'status';
  direction: 'asc' | 'desc';
}

interface Order {
  id: string;
  order_number: string;
  case_caption: string;
  motion_type: string;
  jurisdiction: string;
  status: string;
  created_at: string;
  filing_deadline: string | null;
  total_price: number;
  profiles?: {
    full_name: string;
    email: string;
  };
  order_workflow_state?: Array<{
    current_tier: string;
    current_phase: string;
    assigned_to?: string;
  }>;
}

interface QueueProps {
  initialFilters?: QueueFilters;
  initialSort?: QueueSort;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="w-4 h-4" /> },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800', icon: <RefreshCw className="w-4 h-4" /> },
  complete: { label: 'Complete', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-4 h-4" /> },
  hold: { label: 'On Hold', color: 'bg-orange-100 text-orange-800', icon: <PauseCircle className="w-4 h-4" /> },
  error: { label: 'Error', color: 'bg-red-100 text-red-800', icon: <AlertCircle className="w-4 h-4" /> },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800', icon: <XCircle className="w-4 h-4" /> },
};

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  A: { label: 'Tier A', color: 'bg-emerald-100 text-emerald-800' },
  B: { label: 'Tier B', color: 'bg-blue-100 text-blue-800' },
  C: { label: 'Tier C', color: 'bg-purple-100 text-purple-800' },
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Real-time order queue subscription hook
 */
export function useOrderQueueRealtime(
  filters: QueueFilters,
  sort: QueueSort
): {
  orders: Order[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
} {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          case_caption,
          motion_type,
          jurisdiction,
          status,
          created_at,
          filing_deadline,
          total_price,
          profiles (
            full_name,
            email
          ),
          order_workflow_state (
            current_tier,
            current_phase,
            assigned_to
          )
        `)
        .order(sort.field, { ascending: sort.direction === 'asc' });

      // Apply filters
      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }

      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }

      if (filters.search) {
        query = query.or(`order_number.ilike.%${filters.search}%,case_caption.ilike.%${filters.search}%`);
      }

      const { data, error: queryError } = await query.limit(100);

      if (queryError) {
        throw queryError;
      }

      // Filter by tier (needs to be done client-side due to nested join)
      let filteredData = data || [];
      if (filters.tier && filters.tier.length > 0) {
        filteredData = filteredData.filter((order) => {
          const tier = order.order_workflow_state?.[0]?.current_tier;
          return tier && filters.tier!.includes(tier as 'A' | 'B' | 'C');
        });
      }

      // Filter by assigned admin
      if (filters.assignedTo) {
        filteredData = filteredData.filter((order) => {
          const assigned = order.order_workflow_state?.[0]?.assigned_to;
          return assigned === filters.assignedTo;
        });
      }

      setOrders(filteredData as Order[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch orders'));
    } finally {
      setLoading(false);
    }
  }, [filters, sort]);

  // Initial fetch
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Set up real-time subscription
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('order-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          // Refresh on any order change
          fetchOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_workflow_state',
        },
        () => {
          // Refresh on workflow state change
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  return { orders, loading, error, refresh: fetchOrders };
}

// ============================================================================
// BULK ACTIONS
// ============================================================================

export async function bulkPauseOrders(orderIds: string[]): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('orders')
    .update({ status: 'hold' })
    .in('id', orderIds);

  if (error) throw error;
}

export async function bulkResumeOrders(orderIds: string[]): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('orders')
    .update({ status: 'in_progress' })
    .in('id', orderIds)
    .eq('status', 'hold');

  if (error) throw error;
}

export async function bulkAssignOrders(orderIds: string[], adminId: string): Promise<void> {
  const supabase = createClient();

  for (const orderId of orderIds) {
    const { error } = await supabase
      .from('order_workflow_state')
      .update({ assigned_to: adminId })
      .eq('order_id', orderId);

    if (error) throw error;
  }
}

export async function addOrderNote(orderId: string, note: string, adminId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from('order_notes').insert({
    order_id: orderId,
    note,
    created_by: adminId,
  });

  if (error) throw error;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OrderQueue({ initialFilters = {}, initialSort }: QueueProps) {
  const [filters, setFilters] = useState<QueueFilters>(initialFilters);
  const [sort, setSort] = useState<QueueSort>(
    initialSort || { field: 'created_at', direction: 'desc' }
  );
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const { orders, loading, error, refresh } = useOrderQueueRealtime(filters, sort);

  // Toggle sort
  const toggleSort = (field: QueueSort['field']) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Select all
  const selectAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map((o) => o.id)));
    }
  };

  // Toggle selection
  const toggleSelect = (orderId: string) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Bulk pause
  const handleBulkPause = async () => {
    if (selectedOrders.size === 0) return;
    setActionLoading(true);
    try {
      await bulkPauseOrders(Array.from(selectedOrders));
      setSelectedOrders(new Set());
      refresh();
    } catch (err) {
      console.error('Bulk pause failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk resume
  const handleBulkResume = async () => {
    if (selectedOrders.size === 0) return;
    setActionLoading(true);
    try {
      await bulkResumeOrders(Array.from(selectedOrders));
      setSelectedOrders(new Set());
      refresh();
    } catch (err) {
      console.error('Bulk resume failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Calculate urgency
  const getUrgency = (deadline: string | null): 'urgent' | 'soon' | 'normal' => {
    if (!deadline) return 'normal';
    const days = Math.floor(
      (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (days < 2) return 'urgent';
    if (days < 5) return 'soon';
    return 'normal';
  };

  // Memoized stats
  const stats = useMemo(() => {
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      inProgress: orders.filter((o) => o.status === 'in_progress').length,
      onHold: orders.filter((o) => o.status === 'hold').length,
      urgent: orders.filter((o) => getUrgency(o.filing_deadline) === 'urgent').length,
    };
  }, [orders]);

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Order Queue</h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{stats.total} orders</span>
            <span className="text-yellow-600">{stats.pending} pending</span>
            <span className="text-blue-600">{stats.inProgress} active</span>
            {stats.urgent > 0 && (
              <span className="text-red-600 font-medium">{stats.urgent} urgent</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" />
            Filters
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="p-4 bg-gray-50 rounded-lg border space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {/* Status filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <div className="flex flex-wrap gap-1">
                {['pending', 'in_progress', 'hold', 'error'].map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setFilters((prev) => {
                        const current = prev.status || [];
                        return {
                          ...prev,
                          status: current.includes(status)
                            ? current.filter((s) => s !== status)
                            : [...current, status],
                        };
                      });
                    }}
                    className={`px-2 py-0.5 text-xs rounded ${
                      filters.status?.includes(status)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border'
                    }`}
                  >
                    {STATUS_CONFIG[status]?.label || status}
                  </button>
                ))}
              </div>
            </div>

            {/* Tier filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
              <div className="flex gap-1">
                {(['A', 'B', 'C'] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => {
                      setFilters((prev) => {
                        const current = prev.tier || [];
                        return {
                          ...prev,
                          tier: current.includes(tier)
                            ? current.filter((t) => t !== tier)
                            : [...current, tier],
                        };
                      });
                    }}
                    className={`px-3 py-0.5 text-xs rounded ${
                      filters.tier?.includes(tier)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={filters.search || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Order # or case..."
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>

            {/* Clear filters */}
            <div className="flex items-end">
              <button
                onClick={() => setFilters({})}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {selectedOrders.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-200">
          <span className="text-sm text-blue-700">
            {selectedOrders.size} order{selectedOrders.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={handleBulkPause}
            disabled={actionLoading}
            className="px-2 py-1 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
          >
            Pause
          </button>
          <button
            onClick={handleBulkResume}
            disabled={actionLoading}
            className="px-2 py-1 text-sm bg-green-100 text-green-800 rounded hover:bg-green-200"
          >
            Resume
          </button>
          <button
            onClick={() => setSelectedOrders(new Set())}
            className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded border border-red-200">
          Error loading orders: {error.message}
        </div>
      )}

      {/* Order table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedOrders.size === orders.length && orders.length > 0}
                  onChange={selectAll}
                  className="rounded"
                />
              </th>
              <th
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort('created_at')}
              >
                <div className="flex items-center gap-1">
                  Order
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Case / Motion
              </th>
              <th
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort('tier')}
              >
                <div className="flex items-center gap-1">
                  Tier
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort('status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort('deadline')}
              >
                <div className="flex items-center gap-1">
                  Deadline
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading orders...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  No orders match your filters
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const tier = order.order_workflow_state?.[0]?.current_tier || 'B';
                const phase = order.order_workflow_state?.[0]?.current_phase || '-';
                const urgency = getUrgency(order.filing_deadline);
                const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.B;

                return (
                  <tr
                    key={order.id}
                    className={`hover:bg-gray-50 ${
                      urgency === 'urgent' ? 'bg-red-50' : urgency === 'soon' ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {order.order_number}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(order.created_at)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm text-gray-900 truncate max-w-xs">
                        {order.case_caption || 'No caption'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {order.motion_type?.replace(/_/g, ' ')} • {order.jurisdiction}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${tierConfig.color}`}>
                        {tier}
                      </span>
                      <span className="ml-1 text-xs text-gray-500">{phase}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${statusConfig.color}`}>
                        {statusConfig.icon}
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className={`text-sm ${urgency === 'urgent' ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
                        {formatDate(order.filing_deadline)}
                      </div>
                      {urgency === 'urgent' && (
                        <span className="text-xs text-red-600">URGENT</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button className="p-1 hover:bg-gray-100 rounded">
                        <MoreHorizontal className="w-4 h-4 text-gray-500" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OrderQueue;
