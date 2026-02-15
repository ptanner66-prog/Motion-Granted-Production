import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/config/motion-types'
import { Card, CardContent } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  Calendar,
  ChevronRight,
} from 'lucide-react'
import { formatRelativeTime, truncateString, mapToDisplayStatus } from '@/lib/utils'
import { formatMotionType } from '@/config/motion-types'

export const metadata: Metadata = {
  title: 'Orders',
  description: 'View and manage your motion orders.',
}

interface OrderItem {
  id: string
  order_number: string
  motion_type: string
  case_caption: string
  status: string
  total_price: number
  amount_paid: number | null
  filing_deadline: string
  created_at: string
  parties?: Array<{ party_name: string; party_role: string }>
}

function getDaysUntilDue(deadline: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(deadline)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getUrgencyClass(daysUntilDue: number, displayStatus: string) {
  if (['COMPLETED', 'CANCELLED'].includes(displayStatus)) return ''
  if (daysUntilDue <= 3) return 'urgency-overdue'
  if (daysUntilDue <= 7) return 'urgency-soon'
  return ''
}

function displayPrice(order: OrderItem): string {
  if (order.amount_paid && order.amount_paid > 0) {
    return `$${(order.amount_paid / 100).toFixed(2)}`
  }
  return `$${order.total_price.toFixed(2)}`
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  const params = await searchParams
  const searchQuery = params.search?.toLowerCase().trim() || ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, motion_type, case_caption, status, total_price, amount_paid, filing_deadline, created_at, parties(party_name, party_role)')
    .eq('client_id', user?.id)
    .order('created_at', { ascending: false })

  let allOrders: OrderItem[] = orders || []

  if (searchQuery) {
    allOrders = allOrders.filter(order =>
      order.order_number.toLowerCase().includes(searchQuery) ||
      order.motion_type.toLowerCase().includes(searchQuery) ||
      order.case_caption.toLowerCase().includes(searchQuery)
    )
  }

  // Filter using 7-status model
  const activeOrders = allOrders.filter(o => {
    const ds = mapToDisplayStatus(o.status)
    return ['PAID', 'IN_PROGRESS', 'REVISION_REQ'].includes(ds)
  })
  const pendingReviewOrders = allOrders.filter(o => {
    const ds = mapToDisplayStatus(o.status)
    return ['AWAITING_APPROVAL', 'HOLD_PENDING'].includes(ds)
  })
  const completedOrders = allOrders.filter(o => {
    const ds = mapToDisplayStatus(o.status)
    return ds === 'COMPLETED'
  })
  const cancelledExcluded = allOrders.filter(o => {
    const ds = mapToDisplayStatus(o.status)
    return ds !== 'CANCELLED'
  })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">Orders</h1>
          <p className="text-gray-500 mt-1">
            {searchQuery ? (
              <>
                Search results for &quot;{params.search}&quot;
                <Link href="/orders" className="ml-2 text-teal hover:underline">
                  Clear search
                </Link>
              </>
            ) : (
              'View and manage your motion orders'
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="mt-8">
        <TabsList className="bg-transparent border-b border-gray-200 p-0 h-auto rounded-none w-full justify-start">
          <TabsTrigger
            value="active"
            className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 data-[state=active]:shadow-none"
          >
            Active ({activeOrders.length})
          </TabsTrigger>
          <TabsTrigger
            value="pending"
            className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 data-[state=active]:shadow-none"
          >
            Pending Review ({pendingReviewOrders.length})
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 data-[state=active]:shadow-none"
          >
            Completed ({completedOrders.length})
          </TabsTrigger>
          <TabsTrigger
            value="all"
            className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 data-[state=active]:shadow-none"
          >
            All ({allOrders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          <OrderList orders={activeOrders} />
        </TabsContent>

        <TabsContent value="pending" className="mt-6">
          <OrderList orders={pendingReviewOrders} />
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <OrderList orders={completedOrders} />
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <OrderList orders={allOrders} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OrderList({ orders }: { orders: OrderItem[] }) {
  if (orders.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="empty-state py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
            <FileText className="h-8 w-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-navy mb-1">No orders found</h3>
          <p className="text-gray-500 max-w-sm">
            Use the New Order tab to create your first motion order
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <div className="divide-y divide-gray-100">
        {orders.map((order, index) => {
          const daysUntilDue = getDaysUntilDue(order.filing_deadline)
          const displayStatus = mapToDisplayStatus(order.status)
          const partyString = order.parties?.map(p => p.party_name).join(' v. ') || ''
          return (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className={`order-card flex items-center justify-between p-5 hover:bg-gray-50/50 transition-all ${getUrgencyClass(daysUntilDue, displayStatus)}`}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="relative flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 transition-colors group-hover:bg-gray-200">
                    <FileText className="h-6 w-6 text-gray-500" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-gray-400 tracking-wide">
                      {order.order_number}
                    </span>
                    <OrderStatusBadge status={displayStatus as OrderStatus} size="sm" />
                  </div>
                  <p className="font-semibold text-navy truncate">
                    {formatMotionType(order.motion_type)}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {partyString ? truncateString(partyString, 80) : order.case_caption}
                  </p>
                </div>
              </div>

              <div className="text-right flex-shrink-0 ml-4 hidden sm:block">
                <p className="font-bold text-navy tabular-nums text-lg">
                  {displayPrice(order)}
                </p>
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  <span className={`text-sm ${
                    displayStatus === 'COMPLETED' ? 'text-gray-500' :
                    daysUntilDue > 0 && daysUntilDue <= 7
                      ? 'text-orange-600 font-medium'
                      : 'text-gray-500'
                  }`}>
                    {formatRelativeTime(order.created_at)}
                  </span>
                </div>
              </div>

              <ChevronRight className="h-5 w-5 text-gray-300 ml-2 flex-shrink-0" />
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
