import { Metadata } from 'next'
import Link from 'next/link'
import type { OrderStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlusCircle, FileText, Search } from 'lucide-react'
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
  },
]

export default function OrdersPage() {
  const activeOrders = orders.filter(o => !['completed', 'cancelled'].includes(o.status))
  const completedOrders = orders.filter(o => o.status === 'completed')

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Orders</h1>
          <p className="text-gray-500">View and manage your motion orders</p>
        </div>
        <Button asChild>
          <Link href="/orders/new">
            <PlusCircle className="mr-2 h-5 w-5" />
            New Order
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="mt-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by order number, case, or motion type..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="mt-6">
        <TabsList>
          <TabsTrigger value="active">
            Active ({activeOrders.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            All ({orders.length})
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
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-lg font-medium text-gray-500">No orders found</p>
          <p className="text-sm text-gray-400">Start by creating a new order</p>
          <Button asChild className="mt-4">
            <Link href="/orders/new">
              <PlusCircle className="mr-2 h-5 w-5" />
              New Order
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <div className="divide-y divide-gray-100">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <FileText className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-gray-500">
                    {order.order_number}
                  </span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="font-medium text-navy">{order.motion_type}</p>
                <p className="text-sm text-gray-500">{order.case_caption}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-navy">
                {formatCurrency(order.total_price)}
              </p>
              <p className="text-sm text-gray-500">
                Due: {formatDateShort(order.filing_deadline)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  )
}
