import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Timer,
  TrendingUp,
  Zap,
  Calendar,
} from 'lucide-react'
import Link from 'next/link'
import { formatMotionType } from '@/config/motion-types'
import { QueueRefreshButton } from './queue-refresh-button'

export const metadata: Metadata = {
  title: 'Generation Queue | Admin',
  description: 'Monitor and manage the motion draft generation queue',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Type definitions
interface QueuedOrder {
  id: string
  order_number: string
  case_caption: string
  motion_type: string
  motion_tier: string
  filing_deadline: string
  status: string
  created_at: string
  queue_position: number | null
  generation_started_at: string | null
  generation_attempts: number | null
  generation_error: string | null
}

interface CompletedOrder {
  id: string
  order_number: string
  motion_type: string
  generation_started_at: string | null
  generation_completed_at: string | null
}

interface QueueStats {
  queue_depth: number
  processing_count: number
  completed_today: number
  failed_count: number
  avg_generation_seconds: number
  oldest_pending_minutes: number
}

// Helper to format relative time
function formatWaitTime(startDate: string | Date): string {
  const start = new Date(startDate)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMinutes / 60)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m`
  if (diffHours < 24) return `${diffHours}h ${diffMinutes % 60}m`
  return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`
}

// Helper to format deadline urgency
function getDeadlineUrgency(deadline: string): {
  color: string
  label: string
  bgColor: string
  textColor: string
} {
  const deadlineDate = new Date(deadline)
  const now = new Date()
  const hoursUntilDeadline = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursUntilDeadline < 24) {
    return {
      color: 'red',
      label: 'Critical',
      bgColor: 'bg-red-100',
      textColor: 'text-red-700',
    }
  }
  if (hoursUntilDeadline < 72) {
    return {
      color: 'yellow',
      label: 'Soon',
      bgColor: 'bg-amber-100',
      textColor: 'text-amber-700',
    }
  }
  return {
    color: 'green',
    label: 'Normal',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
  }
}

// Helper to estimate completion time
function estimateCompletion(queuePosition: number, avgMinutesPerOrder: number = 2): string {
  const minutes = queuePosition * avgMinutesPerOrder
  if (minutes < 60) return `~${minutes} min`
  return `~${(minutes / 60).toFixed(1)} hr`
}

export default async function QueuePage() {
  const supabase = await createClient()

  // Fetch queue statistics
  const { data: queueStatsData } = await supabase.rpc('get_queue_stats')
  const queueStats = queueStatsData as QueueStats[] | null

  // Fetch orders in queue (submitted, under_review, in_progress)
  const { data: queuedOrdersData } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      case_caption,
      motion_type,
      motion_tier,
      filing_deadline,
      status,
      created_at,
      queue_position,
      generation_started_at,
      generation_attempts,
      generation_error
    `)
    .in('status', ['submitted', 'under_review', 'in_progress', 'generation_failed'])
    .order('filing_deadline', { ascending: true })
  const queuedOrders = queuedOrdersData as QueuedOrder[] | null

  // Fetch recently completed orders (last 24h)
  // Server component - Date.now() is safe here (ESLint purity rule is for client components)
  // eslint-disable-next-line react-hooks/purity
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: completedOrdersData } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      motion_type,
      generation_started_at,
      generation_completed_at
    `)
    .in('status', ['pending_review', 'draft_delivered', 'completed'])
    .gte('generation_completed_at', yesterday)
    .order('generation_completed_at', { ascending: false })
    .limit(10)
  const completedOrders = completedOrdersData as CompletedOrder[] | null

  // Calculate average generation time
  const avgGenerationSeconds = queueStats?.[0]?.avg_generation_seconds || 0
  const avgMinutes = Math.round(avgGenerationSeconds / 60)

  // Estimate time to clear queue
  const queueDepth = (queueStats?.[0]?.queue_depth || 0) + (queueStats?.[0]?.processing_count || 0)
  const estimatedClearTime = queueDepth * (avgMinutes || 2)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Generation Queue</h1>
          <p className="text-gray-500 mt-1">
            Monitor motion draft generation in real-time
          </p>
        </div>
        <QueueRefreshButton />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-100">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Queue Depth</p>
                <p className="text-2xl font-bold text-navy">
                  {queueStats?.[0]?.queue_depth || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-100">
                <Loader2 className="h-6 w-6 text-amber-600 animate-spin" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Processing</p>
                <p className="text-2xl font-bold text-navy">
                  {queueStats?.[0]?.processing_count || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-100">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Completed Today</p>
                <p className="text-2xl font-bold text-navy">
                  {queueStats?.[0]?.completed_today || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${(queueStats?.[0]?.failed_count || 0) > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <XCircle className={`h-6 w-6 ${(queueStats?.[0]?.failed_count || 0) > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Failed</p>
                <p className={`text-2xl font-bold ${(queueStats?.[0]?.failed_count || 0) > 0 ? 'text-red-600' : 'text-navy'}`}>
                  {queueStats?.[0]?.failed_count || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Timer className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Avg Generation Time</p>
                <p className="text-lg font-semibold text-navy">
                  {avgMinutes > 0 ? `${avgMinutes} min` : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Est. Queue Clear</p>
                <p className="text-lg font-semibold text-navy">
                  {queueDepth > 0 ? (estimatedClearTime < 60 ? `~${estimatedClearTime} min` : `~${(estimatedClearTime / 60).toFixed(1)} hr`) : 'Empty'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Oldest Pending</p>
                <p className="text-lg font-semibold text-navy">
                  {queueStats?.[0]?.oldest_pending_minutes
                    ? `${Math.round(queueStats[0].oldest_pending_minutes)} min`
                    : 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b border-gray-100">
          <CardTitle className="text-lg">Active Queue</CardTitle>
          <CardDescription>
            Orders being processed or waiting for generation (sorted by deadline priority)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {queuedOrders && queuedOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Order
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Case
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Motion Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Deadline
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Wait Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {queuedOrders.map((order, index) => {
                    const urgency = getDeadlineUrgency(order.filing_deadline)
                    const deadlineDate = new Date(order.filing_deadline)
                    const isProcessing = order.status === 'in_progress'
                    const isFailed = order.status === 'generation_failed'

                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-gray-50/50 transition-colors ${
                          isFailed ? 'bg-red-50/30' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-gray-500">
                            {order.queue_position || index + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="font-medium text-navy hover:text-teal transition-colors"
                          >
                            {order.order_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700 max-w-[200px] truncate block">
                            {order.case_caption}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {formatMotionType(order.motion_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${urgency.bgColor} ${urgency.textColor}`}>
                              {urgency.color === 'red' && <AlertTriangle className="h-3 w-3" />}
                              {deadlineDate.toLocaleDateString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isProcessing ? (
                            <Badge variant="warning" className="gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Processing
                            </Badge>
                          ) : isFailed ? (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Queued</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-500">
                            {isProcessing && order.generation_started_at
                              ? formatWaitTime(order.generation_started_at)
                              : formatWaitTime(order.created_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <Link href={`/admin/orders/${order.id}`}>
                                View
                              </Link>
                            </Button>
                            {isFailed && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-orange-600 border-orange-200 hover:bg-orange-50"
                              >
                                Retry
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <CheckCircle2 className="h-12 w-12 text-emerald-300 mb-4" />
              <p className="font-medium">Queue is empty</p>
              <p className="text-sm mt-1">All orders have been processed</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recently Completed */}
      {completedOrders && completedOrders.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="text-lg">Recently Completed</CardTitle>
            <CardDescription>
              Orders completed in the last 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {completedOrders.map((order) => {
                const genTime = order.generation_started_at && order.generation_completed_at
                  ? Math.round(
                      (new Date(order.generation_completed_at).getTime() -
                        new Date(order.generation_started_at).getTime()) /
                        1000
                    )
                  : null

                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-medium text-navy hover:text-teal transition-colors"
                      >
                        {order.order_number}
                      </Link>
                      <span className="text-sm text-gray-500">
                        {formatMotionType(order.motion_type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      {genTime && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3.5 w-3.5" />
                          {genTime}s
                        </span>
                      )}
                      {order.generation_completed_at && (
                        <span>
                          {new Date(order.generation_completed_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
