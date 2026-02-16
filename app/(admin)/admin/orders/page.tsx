import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Calendar,
  ChevronRight,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  Bot,
} from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { formatMotionType } from '@/config/motion-types'
import { TierBadge } from '@/components/workflow/TierBadge'
import type { OrderStatus } from '@/types'

export const metadata: Metadata = {
  title: 'All Orders - Admin',
  description: 'Manage all customer orders.',
}

interface Order {
  id: string
  order_number: string
  motion_type: string
  motion_tier: number | null
  case_caption: string
  status: string
  total_price: number
  filing_deadline: string
  created_at: string
  profiles?: {
    full_name: string
    email: string
  }
  order_workflows?: {
    current_phase: number | null
  }[]
}

const TIER_INT_TO_LETTER: Record<number, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' }

const PHASE_LABELS: Record<number, string> = {
  1: 'I - Intake',
  2: 'II - Legal Standards',
  3: 'III - Evidence Strategy',
  4: 'IV - Research',
  5: 'V - Drafting',
  6: 'V.1 - Cit. Verify',
  7: 'VI - Opposition',
  8: 'VII - Judge Sim',
  9: 'VII.1 - Post-Rev Cit',
  10: 'VIII - Revisions',
  11: 'VIII.5 - Caption',
  12: 'IX - Support Docs',
  13: 'IX.1 - Sep. Statement',
  14: 'X - Assembly',
}

function PhaseIndicator({ phase, status }: { phase: number | null | undefined; status: string }) {
  if (status === 'completed' || status === 'draft_delivered' || status === 'revision_delivered') {
    return <span className="text-green-600 text-xs font-medium">Delivered</span>
  }
  if (!phase) {
    return <span className="text-gray-400 text-xs italic">Awaiting workflow</span>
  }
  const label = PHASE_LABELS[phase] || `Phase ${phase}`
  return <span className="text-blue-600 text-xs font-medium">{label}</span>
}

function getDaysUntilDue(deadline: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(deadline)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getUrgencyClass(daysUntilDue: number, status: string) {
  if (status === 'completed' || status === 'cancelled') return ''
  if (daysUntilDue <= 3) return 'border-l-4 border-l-red-500'
  if (daysUntilDue <= 7) return 'border-l-4 border-l-orange-500'
  return ''
}

export default async function AdminOrdersPage() {
  const supabase = await createClient()

  // Fetch all orders with client info and workflow state
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      *,
      profiles:client_id (
        full_name,
        email
      ),
      order_workflows (
        current_phase
      )
    `)
    .order('created_at', { ascending: false })

  const allOrders: Order[] = orders || []

  // Categorize orders by status
  const needsApprovalOrders = allOrders.filter(o => o.status === 'pending_review')
  const revisionRequestedOrders = allOrders.filter(o => o.status === 'revision_requested')
  const inProgressOrders = allOrders.filter(o => ['submitted', 'in_progress', 'under_review', 'assigned'].includes(o.status))
  const deliveredOrders = allOrders.filter(o => ['draft_delivered', 'revision_delivered'].includes(o.status))
  const completedOrders = allOrders.filter(o => o.status === 'completed')
  const blockedOrders = allOrders.filter(o => o.status === 'blocked')
  const holdOrders = allOrders.filter(o => o.status === 'on_hold' || o.status === 'hold_pending')

  // Calculate action required count (includes HOLD orders)
  const actionRequiredCount = needsApprovalOrders.length + revisionRequestedOrders.length + holdOrders.length

  // Determine default tab — prioritize HOLD orders
  let defaultTab = 'in_progress'
  if (revisionRequestedOrders.length > 0) defaultTab = 'revisions'
  if (needsApprovalOrders.length > 0) defaultTab = 'needs_approval'
  if (holdOrders.length > 0) defaultTab = 'on_hold'

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header with Stats */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">All Orders</h1>
        <p className="text-gray-500 mt-1">Manage and track all customer orders</p>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          {holdOrders.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-700 mb-1">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">On Hold</span>
              </div>
              <p className="text-2xl font-bold text-red-800">{holdOrders.length}</p>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-700 mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Ready to Approve</span>
            </div>
            <p className="text-2xl font-bold text-amber-800">{needsApprovalOrders.length}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-purple-700 mb-1">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-medium">Revision Requests</span>
            </div>
            <p className="text-2xl font-bold text-purple-800">{revisionRequestedOrders.length}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <Bot className="h-4 w-4" />
              <span className="text-sm font-medium">In Progress</span>
            </div>
            <p className="text-2xl font-bold text-blue-800">{inProgressOrders.length}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">Delivered</span>
            </div>
            <p className="text-2xl font-bold text-green-800">{deliveredOrders.length}</p>
          </div>
        </div>
      </div>

      {/* Alert for action required */}
      {actionRequiredCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
          <div>
            <p className="font-medium text-orange-800">Action Required</p>
            <p className="text-sm text-orange-700">
              You have {needsApprovalOrders.length > 0 && `${needsApprovalOrders.length} motion${needsApprovalOrders.length !== 1 ? 's' : ''} ready to approve`}
              {needsApprovalOrders.length > 0 && revisionRequestedOrders.length > 0 && ' and '}
              {revisionRequestedOrders.length > 0 && `${revisionRequestedOrders.length} revision request${revisionRequestedOrders.length !== 1 ? 's' : ''}`}
              .
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="bg-gray-100 p-1 border border-gray-200 flex-wrap">
          {holdOrders.length > 0 && (
            <TabsTrigger
              value="on_hold"
              className="data-[state=active]:bg-red-100 data-[state=active]:text-red-700 text-gray-500 rounded-lg px-4"
            >
              On Hold
              <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                {holdOrders.length}
              </span>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="needs_approval"
            className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700 text-gray-500 rounded-lg px-4"
          >
            Ready to Approve
            {needsApprovalOrders.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                {needsApprovalOrders.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="revisions"
            className="data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 text-gray-500 rounded-lg px-4"
          >
            Revision Requests
            {revisionRequestedOrders.length > 0 && (
              <span className="ml-2 rounded-full bg-purple-500 px-2 py-0.5 text-xs font-semibold text-white">
                {revisionRequestedOrders.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="in_progress"
            className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-600 text-gray-500 rounded-lg px-4"
          >
            In Progress
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">
              {inProgressOrders.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="delivered"
            className="data-[state=active]:bg-green-100 data-[state=active]:text-green-600 text-gray-500 rounded-lg px-4"
          >
            Delivered
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600">
              {deliveredOrders.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-600 text-gray-500 rounded-lg px-4"
          >
            Completed
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">
              {completedOrders.length}
            </span>
          </TabsTrigger>
          {blockedOrders.length > 0 && (
            <TabsTrigger
              value="blocked"
              className="data-[state=active]:bg-red-100 data-[state=active]:text-red-600 text-gray-500 rounded-lg px-4"
            >
              Blocked
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                {blockedOrders.length}
              </span>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-gray-200 data-[state=active]:text-navy text-gray-500 rounded-lg px-4"
          >
            All
            <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
              {allOrders.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="on_hold">
          <OrderList
            orders={holdOrders}
            emptyMessage="No orders on hold"
            actionHint="These orders are paused and need admin action to resolve."
            actionColor="red"
          />
        </TabsContent>

        <TabsContent value="needs_approval">
          <OrderList
            orders={needsApprovalOrders}
            emptyMessage="No drafts waiting for your approval"
            actionHint="Review and approve these AI-generated motions before delivery to clients."
            actionColor="amber"
          />
        </TabsContent>

        <TabsContent value="revisions">
          <OrderList
            orders={revisionRequestedOrders}
            emptyMessage="No revision requests pending"
            actionHint="Clients have requested changes to these delivered motions."
            actionColor="purple"
          />
        </TabsContent>

        <TabsContent value="in_progress">
          <OrderList orders={inProgressOrders} emptyMessage="No orders currently in progress" />
        </TabsContent>

        <TabsContent value="delivered">
          <OrderList orders={deliveredOrders} emptyMessage="No drafts delivered to clients yet" />
        </TabsContent>

        <TabsContent value="completed">
          <OrderList orders={completedOrders} emptyMessage="No completed orders yet" />
        </TabsContent>

        <TabsContent value="blocked">
          <OrderList
            orders={blockedOrders}
            emptyMessage="No blocked orders"
            actionHint="These orders encountered issues during processing. Click to investigate."
            actionColor="red"
          />
        </TabsContent>

        <TabsContent value="all">
          <OrderList orders={allOrders} emptyMessage="No orders yet" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OrderList({
  orders,
  emptyMessage,
  actionHint,
  actionColor
}: {
  orders: Order[],
  emptyMessage: string,
  actionHint?: string,
  actionColor?: 'amber' | 'purple' | 'red'
}) {
  if (orders.length === 0) {
    return (
      <Card className="bg-white border-gray-200">
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400">{emptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  const colorClasses = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  }

  const actionBanner = actionHint ? (
    <div className={`border-b px-4 py-3 text-sm ${actionColor ? colorClasses[actionColor] : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
      <strong>Action Required:</strong> {actionHint}
    </div>
  ) : null;

  return (
    <Card className="bg-white border-gray-200 overflow-hidden">
      {actionBanner}
      <div className="divide-y divide-gray-200">
        {orders.map((order) => {
          const daysUntilDue = getDaysUntilDue(order.filing_deadline)
          return (
            <Link
              key={order.id}
              href={`/admin/orders/${order.id}`}
              className={`flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${getUrgencyClass(daysUntilDue, order.status)}`}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
                  <FileText className="h-6 w-6 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-gray-400">
                      {order.order_number}
                    </span>
                    <OrderStatusBadge status={order.status as OrderStatus} size="sm" />
                    {order.motion_tier != null && (
                      <TierBadge tier={TIER_INT_TO_LETTER[order.motion_tier] || 'A'} size="sm" showTooltip={false} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-navy truncate">
                      {formatMotionType(order.motion_type)}
                    </p>
                    <span className="hidden sm:inline-flex">
                      <PhaseIndicator
                        phase={order.order_workflows?.[0]?.current_phase}
                        status={order.status}
                      />
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <User className="h-3 w-3" />
                    <span className="truncate">
                      {order.profiles?.full_name || order.profiles?.email || 'Unknown'}
                    </span>
                    <span>•</span>
                    <span className="truncate">{order.case_caption}</span>
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0 ml-4 hidden sm:block">
                <p className="font-bold text-navy tabular-nums text-lg">
                  {formatCurrency(order.total_price)}
                </p>
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  <span className={`text-sm ${
                    daysUntilDue > 0 && daysUntilDue <= 7
                      ? 'text-orange-500 font-medium'
                      : daysUntilDue <= 3
                        ? 'text-red-500 font-medium'
                        : 'text-gray-400'
                  }`}>
                    {order.status === 'completed' ? 'Completed' : formatDateShort(order.filing_deadline)}
                    {daysUntilDue > 0 && daysUntilDue <= 7 && order.status !== 'completed' && (
                      <span className="ml-1">({daysUntilDue}d)</span>
                    )}
                  </span>
                </div>
              </div>

              <ChevronRight className="h-5 w-5 text-gray-400 ml-2 flex-shrink-0" />
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
