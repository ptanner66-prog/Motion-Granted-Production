import { Metadata } from 'next'
import Link from 'next/link'
import type { OrderStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PlusCircle,
  FileText,
  Search,
  Calendar,
  ChevronRight,
  Filter,
  SortAsc
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDateShort } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Orders',
  description: 'View and manage your motion orders.',
}

interface OrderItem {
  id: string
  order_number: string
  motion_type: string
  case_caption: string
  status: OrderStatus
  total_price: number
  filing_deadline: string
  created_at: string
  days_until_due: number
}

// Mock data - in production, fetch from Supabase
const orders: OrderItem[] = [
  {
    id: '1',
    order_number: 'MG-2501-0001',
    motion_type: 'Motion for Summary Judgment',
    case_caption: 'Smith v. Jones',
    status: 'in_progress',
    total_price: 2000,
    filing_deadline: '2025-02-15',
    created_at: '2025-01-10',
    days_until_due: 31,
  },
  {
    id: '2',
    order_number: 'MG-2501-0002',
    motion_type: 'Motion to Compel Discovery',
    case_caption: 'Johnson v. ABC Corp',
    status: 'draft_delivered',
    total_price: 600,
    filing_deadline: '2025-01-28',
    created_at: '2025-01-08',
    days_until_due: 13,
  },
  {
    id: '3',
    order_number: 'MG-2501-0003',
    motion_type: 'Peremptory Exception — Prescription',
    case_caption: 'Davis v. Medical Center',
    status: 'submitted',
    total_price: 950,
    filing_deadline: '2025-02-05',
    created_at: '2025-01-12',
    days_until_due: 21,
  },
  {
    id: '4',
    order_number: 'MG-2412-0015',
    motion_type: 'Motion to Continue',
    case_caption: 'Williams v. State',
    status: 'completed',
    total_price: 350,
    filing_deadline: '2024-12-20',
    created_at: '2024-12-10',
    days_until_due: -26,
  },
  {
    id: '5',
    order_number: 'MG-2412-0012',
    motion_type: 'Motion for Preliminary Injunction',
    case_caption: 'TechCo v. Competitor Inc',
    status: 'completed',
    total_price: 1400,
    filing_deadline: '2024-12-15',
    created_at: '2024-12-01',
    days_until_due: -31,
  },
]

function getUrgencyClass(daysUntilDue: number, status: string) {
  if (status === 'completed' || status === 'cancelled') return ''
  if (daysUntilDue <= 3) return 'urgency-overdue'
  if (daysUntilDue <= 7) return 'urgency-soon'
  return ''
}

export default function OrdersPage() {
  const activeOrders = orders.filter(o => !['completed', 'cancelled'].includes(o.status))
  const completedOrders = orders.filter(o => o.status === 'completed')

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">Orders</h1>
          <p className="text-gray-500 mt-1">View and manage your motion orders</p>
        </div>
        <Button asChild className="btn-premium shadow-md hover:shadow-lg" size="lg">
          <Link href="/orders/new">
            <PlusCircle className="mr-2 h-5 w-5" />
            New Order
          </Link>
        </Button>
      </div>

      {/* Search and filters */}
      <div className="mt-8 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by order number, case, or motion type..."
            className="pl-10 h-11 border-gray-200 focus:border-teal focus:ring-teal/30"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 gap-2 border-gray-200 text-gray-600">
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
          </Button>
          <Button variant="outline" className="h-11 gap-2 border-gray-200 text-gray-600">
            <SortAsc className="h-4 w-4" />
            <span className="hidden sm:inline">Sort</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="mt-8">
        <TabsList className="bg-gray-100/70 p-1">
          <TabsTrigger
            value="active"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4"
          >
            Active
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {activeOrders.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4"
          >
            Completed
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              {completedOrders.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4"
          >
            All
            <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
              {orders.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          <OrderList orders={activeOrders} />
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <OrderList orders={completedOrders} />
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <OrderList orders={orders} />
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
          <p className="text-gray-500 mb-6 max-w-sm">
            Start by creating a new order to get your motion drafted
          </p>
          <Button asChild className="btn-premium">
            <Link href="/orders/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Order
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <div className="divide-y divide-gray-100">
        {orders.map((order, index) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className={`order-card flex items-center justify-between p-5 hover:bg-gray-50/50 transition-all ${getUrgencyClass(order.days_until_due, order.status)}`}
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <div className="flex items-center gap-4 min-w-0 flex-1">
              {/* Document icon */}
              <div className="relative flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 transition-colors group-hover:bg-gray-200">
                  <FileText className="h-6 w-6 text-gray-500" />
                </div>
              </div>

              {/* Order info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs text-gray-400 tracking-wide">
                    {order.order_number}
                  </span>
                  <OrderStatusBadge status={order.status} size="sm" />
                </div>
                <p className="font-semibold text-navy truncate">
                  {order.motion_type}
                </p>
                <p className="text-sm text-gray-500 truncate">{order.case_caption}</p>
              </div>
            </div>

            {/* Price and deadline */}
            <div className="text-right flex-shrink-0 ml-4 hidden sm:block">
              <p className="font-bold text-navy tabular-nums text-lg">
                {formatCurrency(order.total_price)}
              </p>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                <span className={`text-sm ${
                  order.days_until_due > 0 && order.days_until_due <= 7
                    ? 'text-orange-600 font-medium'
                    : 'text-gray-500'
                }`}>
                  {order.status === 'completed' ? 'Completed' : formatDateShort(order.filing_deadline)}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight className="h-5 w-5 text-gray-300 ml-2 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </Card>
  )
}
