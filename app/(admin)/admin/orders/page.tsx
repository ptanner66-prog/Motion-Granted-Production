import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  Calendar,
  ChevronRight,
  User,
} from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { OrderStatus } from '@/types'

export const metadata: Metadata = {
  title: 'All Orders - Admin',
  description: 'Manage all customer orders.',
}

interface Order {
  id: string
  order_number: string
  motion_type: string
  case_caption: string
  status: string
  total_price: number
  filing_deadline: string
  created_at: string
  profiles?: {
    full_name: string
    email: string
  }
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

  // Fetch all orders with client info
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      *,
      profiles:client_id (
        full_name,
        email
      )
    `)
    .order('created_at', { ascending: false })

  const allOrders: Order[] = orders || []
  const pendingOrders = allOrders.filter(o => o.status === 'submitted')
  const inProgressOrders = allOrders.filter(o => ['in_progress', 'in_review'].includes(o.status))
  const completedOrders = allOrders.filter(o => o.status === 'completed')
  const reviewOrders = allOrders.filter(o => o.status === 'draft_delivered')

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">All Orders</h1>
        <p className="text-gray-500 mt-1">Manage and track all customer orders</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="bg-gray-100 p-1 border border-gray-200">
          <TabsTrigger
            value="pending"
            className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-600 text-gray-500 rounded-lg px-4"
          >
            New
            <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-600">
              {pendingOrders.length}
            </span>
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
            value="review"
            className="data-[state=active]:bg-purple-100 data-[state=active]:text-purple-600 text-gray-500 rounded-lg px-4"
          >
            Pending Review
            <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-600">
              {reviewOrders.length}
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

        <TabsContent value="pending">
          <OrderList orders={pendingOrders} emptyMessage="No new orders waiting for assignment" />
        </TabsContent>

        <TabsContent value="in_progress">
          <OrderList orders={inProgressOrders} emptyMessage="No orders currently in progress" />
        </TabsContent>

        <TabsContent value="review">
          <OrderList orders={reviewOrders} emptyMessage="No orders pending client review" />
        </TabsContent>

        <TabsContent value="completed">
          <OrderList orders={completedOrders} emptyMessage="No completed orders yet" />
        </TabsContent>

        <TabsContent value="all">
          <OrderList orders={allOrders} emptyMessage="No orders yet" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OrderList({ orders, emptyMessage }: { orders: Order[], emptyMessage: string }) {
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

  return (
    <Card className="bg-white border-gray-200 overflow-hidden">
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
                  </div>
                  <p className="font-semibold text-navy truncate">
                    {order.motion_type}
                  </p>
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
