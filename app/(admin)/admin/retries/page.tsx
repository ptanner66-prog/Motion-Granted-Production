'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  RefreshCw,
  Loader2,
  XCircle,
  Clock,
  Search,
  CalendarIcon,
  Eye,
  RotateCcw,
  Ban,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import { formatMotionType } from '@/config/motion-types';
import { format } from 'date-fns';

// Types
interface FailedOrder {
  id: string;
  order_number: string;
  case_caption: string;
  motion_type: string;
  status: string;
  generation_error: string | null;
  generation_attempts: number | null;
  generation_started_at: string | null;
  created_at: string;
  filing_deadline: string;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
}

interface DateRange {
  from: Date | undefined;
  to?: Date | undefined;
}

type StatusFilter = 'all' | 'failed' | 'stuck';

export default function AdminRetriesPage() {
  const { toast } = useToast();
  const supabase = createClient();

  // State
  const [orders, setOrders] = useState<FailedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });

  // Stats
  const [stats, setStats] = useState({
    totalFailed: 0,
    totalStuck: 0,
    avgRetryCount: 0,
  });

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Build the query for failed orders
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          case_caption,
          motion_type,
          status,
          generation_error,
          generation_attempts,
          generation_started_at,
          created_at,
          filing_deadline,
          profiles:client_id (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      // Apply date range filter
      if (dateRange.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching orders:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch orders',
          variant: 'destructive',
        });
        return;
      }

      // Filter for failed/stuck orders
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      // Cast the data to FailedOrder array
      const allOrders = (data || []) as FailedOrder[];

      const filteredOrders = allOrders.filter((order) => {
        // Failed orders: status is generation_failed OR has generation_error
        const isFailed = order.status === 'generation_failed' ||
          (order.status === 'in_progress' && order.generation_error);

        // Stuck orders: in_progress for more than 15 minutes
        const isStuck = order.status === 'in_progress' &&
          order.generation_started_at &&
          order.generation_started_at < fifteenMinutesAgo;

        // Apply status filter
        if (statusFilter === 'failed') return isFailed;
        if (statusFilter === 'stuck') return isStuck;
        return isFailed || isStuck;
      });

      // Apply search filter
      const searchFiltered = searchQuery
        ? filteredOrders.filter(
            (order) =>
              order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
              order.case_caption.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : filteredOrders;

      setOrders(searchFiltered);

      // Calculate stats from all data (not search filtered)
      const failedCount = allOrders.filter(
        (o) => o.status === 'generation_failed' || (o.status === 'in_progress' && o.generation_error)
      ).length;
      const stuckCount = allOrders.filter(
        (o) =>
          o.status === 'in_progress' &&
          o.generation_started_at &&
          o.generation_started_at < fifteenMinutesAgo
      ).length;

      const ordersWithAttempts = allOrders.filter((o) => (o.generation_attempts || 0) > 0);
      const avgRetries = ordersWithAttempts.length > 0
        ? ordersWithAttempts.reduce((sum, o) => sum + (o.generation_attempts || 0), 0) / ordersWithAttempts.length
        : 0;

      setStats({
        totalFailed: failedCount,
        totalStuck: stuckCount,
        avgRetryCount: Math.round(avgRetries * 10) / 10,
      });
    } catch (err) {
      console.error('Error in fetchOrders:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, dateRange, statusFilter, searchQuery, toast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Handle retry
  const handleRetry = async (orderId: string, orderNumber: string) => {
    setRetryingId(orderId);
    try {
      // First, reset the order status to allow retry
      const { error: resetError } = await supabase
        .from('orders')
        .update({
          status: 'submitted',
          generation_error: null,
          generation_started_at: null,
        })
        .eq('id', orderId);

      if (resetError) {
        throw new Error('Failed to reset order status');
      }

      // Then trigger the automation
      const response = await fetch('/api/automation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to retry generation');
      }

      toast({
        title: 'Retry Started',
        description: `Order ${orderNumber} has been re-queued for processing.`,
      });

      // Refresh the list
      fetchOrders();
    } catch (error) {
      toast({
        title: 'Retry Failed',
        description: error instanceof Error ? error.message : 'Failed to retry generation',
        variant: 'destructive',
      });
    } finally {
      setRetryingId(null);
    }
  };

  // Handle cancel
  const handleCancel = async (orderId: string, orderNumber: string) => {
    setCancellingId(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) {
        throw new Error('Failed to cancel order');
      }

      toast({
        title: 'Order Cancelled',
        description: `Order ${orderNumber} has been cancelled.`,
      });

      // Refresh the list
      fetchOrders();
    } catch (error) {
      toast({
        title: 'Cancel Failed',
        description: error instanceof Error ? error.message : 'Failed to cancel order',
        variant: 'destructive',
      });
    } finally {
      setCancellingId(null);
    }
  };

  // Get status badge
  const getStatusBadge = (order: FailedOrder) => {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const isStuck =
      order.status === 'in_progress' &&
      order.generation_started_at &&
      order.generation_started_at < fifteenMinutesAgo;

    if (order.status === 'generation_failed') {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    }

    if (isStuck) {
      return (
        <Badge variant="warning" className="gap-1">
          <Clock className="h-3 w-3" />
          Stuck
        </Badge>
      );
    }

    if (order.generation_error) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Error
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    );
  };

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Retry Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Manage failed and stuck generation jobs
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => fetchOrders()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-red-100">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Failed Orders</p>
                <p className="text-2xl font-bold text-red-600">
                  {loading ? <Skeleton className="h-8 w-12" /> : stats.totalFailed}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-100">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Stuck in Processing</p>
                <p className="text-2xl font-bold text-amber-600">
                  {loading ? <Skeleton className="h-8 w-12" /> : stats.totalStuck}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-100">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg Retry Count</p>
                <p className="text-2xl font-bold text-blue-600">
                  {loading ? <Skeleton className="h-8 w-12" /> : stats.avgRetryCount}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by order number or case..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onValueChange={(value: StatusFilter) => setStatusFilter(value)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Issues</SelectItem>
                <SelectItem value="failed">Failed Only</SelectItem>
                <SelectItem value="stuck">Stuck Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`w-full sm:w-[240px] justify-start text-left font-normal ${
                    !dateRange.from && 'text-gray-400'
                  }`}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'LLL dd')} - {format(dateRange.to, 'LLL dd')}
                      </>
                    ) : (
                      format(dateRange.from, 'LLL dd, y')
                    )
                  ) : (
                    'Pick a date range'
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={2}
                />
                {(dateRange.from || dateRange.to) && (
                  <div className="p-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setDateRange({ from: undefined, to: undefined })}
                    >
                      Clear dates
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b border-gray-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Failed/Stuck Orders
          </CardTitle>
          <CardDescription>
            Orders that failed generation or have been stuck in processing for over 15 minutes
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Order #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Case Caption
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Error Message
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Attempts
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-mono text-sm font-medium text-navy hover:text-teal transition-colors"
                        >
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[200px]">
                          <p className="text-sm text-gray-900 truncate">
                            {order.case_caption}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatMotionType(order.motion_type)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(order)}
                      </td>
                      <td className="px-4 py-3">
                        {order.generation_error ? (
                          <div className="max-w-[250px]">
                            <p
                              className="text-xs text-red-600 font-mono truncate"
                              title={order.generation_error}
                            >
                              {order.generation_error}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-gray-600">
                          {order.generation_attempts || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-gray-600">
                            {formatDateShort(order.created_at)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatTimeAgo(order.created_at)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetry(order.id, order.order_number)}
                            disabled={retryingId === order.id || cancellingId === order.id}
                            className="gap-1 text-teal border-teal hover:bg-teal/10"
                          >
                            {retryingId === order.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Retry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancel(order.id, order.order_number)}
                            disabled={retryingId === order.id || cancellingId === order.id}
                            className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          >
                            {cancellingId === order.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Ban className="h-3 w-3" />
                            )}
                            Cancel
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="gap-1"
                          >
                            <Link href={`/admin/orders/${order.id}`}>
                              <Eye className="h-3 w-3" />
                              View
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <CheckCircle2 className="h-16 w-16 text-emerald-300 mb-4" />
              <p className="text-lg font-medium text-navy">All Clear!</p>
              <p className="text-sm mt-1">No failed or stuck orders found</p>
              {(searchQuery || statusFilter !== 'all' || dateRange.from) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setDateRange({ from: undefined, to: undefined });
                  }}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help Text */}
      <Card className="border-0 shadow-sm bg-blue-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">About this dashboard</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>
                  <strong>Failed</strong> orders have status &quot;generation_failed&quot; or encountered an error during processing
                </li>
                <li>
                  <strong>Stuck</strong> orders have been &quot;in_progress&quot; for more than 15 minutes without completing
                </li>
                <li>
                  <strong>Retry</strong> will reset the order and re-queue it for generation
                </li>
                <li>
                  <strong>Cancel</strong> will permanently mark the order as cancelled
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
