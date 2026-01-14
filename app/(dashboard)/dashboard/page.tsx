import { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { PlusCircle, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your Motion Granted dashboard.',
}

// Mock data - in production, fetch from Supabase
const stats = [
  { label: 'Active Orders', value: 3, icon: Clock, color: 'text-blue-600' },
  { label: 'Completed', value: 12, icon: CheckCircle, color: 'text-green-600' },
  { label: 'Pending Revision', value: 1, icon: AlertCircle, color: 'text-orange-600' },
]

const recentOrders = [
  {
    id: '1',
    order_number: 'MG-2501-0001',
    motion_type: 'Motion for Summary Judgment',
    case_caption: 'Smith v. Jones',
    status: 'in_progress' as const,
    total_price: 2000,
    filing_deadline: '2025-02-15',
  },
  {
    id: '2',
    order_number: 'MG-2501-0002',
    motion_type: 'Motion to Compel Discovery',
    case_caption: 'Johnson v. ABC Corp',
    status: 'draft_delivered' as const,
    total_price: 600,
    filing_deadline: '2025-01-28',
  },
  {
    id: '3',
    order_number: 'MG-2501-0003',
    motion_type: 'Peremptory Exception — Prescription',
    case_caption: 'Davis v. Medical Center',
    status: 'submitted' as const,
    total_price: 950,
    filing_deadline: '2025-02-05',
  },
]

export default function DashboardPage() {
  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
          <p className="text-gray-500">Welcome back! Here&apos;s your order overview.</p>
        </div>
        <Button asChild>
          <Link href="/orders/new">
            <PlusCircle className="mr-2 h-5 w-5" />
            New Order
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-lg bg-gray-100 p-3 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-navy">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Orders */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Your most recent motion orders</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orders">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-gray-100">
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between py-4 hover:bg-gray-50 -mx-6 px-6 transition-colors"
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
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer transition-shadow hover:shadow-md">
          <Link href="/orders/new">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-lg bg-teal/10 p-3">
                <PlusCircle className="h-6 w-6 text-teal" />
              </div>
              <div>
                <p className="font-semibold text-navy">New Order</p>
                <p className="text-sm text-gray-500">Start a new motion</p>
              </div>
            </CardContent>
          </Link>
        </Card>
        <Card className="cursor-pointer transition-shadow hover:shadow-md">
          <Link href="/orders">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-lg bg-blue-100 p-3">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-navy">All Orders</p>
                <p className="text-sm text-gray-500">View order history</p>
              </div>
            </CardContent>
          </Link>
        </Card>
        <Card className="cursor-pointer transition-shadow hover:shadow-md">
          <Link href="/pricing" target="_blank">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-lg bg-purple-100 p-3">
                <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-navy">View Pricing</p>
                <p className="text-sm text-gray-500">See all motion prices</p>
              </div>
            </CardContent>
          </Link>
        </Card>
        <Card className="cursor-pointer transition-shadow hover:shadow-md">
          <Link href="/settings">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-lg bg-gray-100 p-3">
                <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-navy">Settings</p>
                <p className="text-sm text-gray-500">Account settings</p>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  )
}
