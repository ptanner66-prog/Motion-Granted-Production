import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Users,
  TrendingUp,
  ChevronRight,
  Calendar,
  ArrowRight,
} from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { OrderStatus } from '@/types'

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  description: 'Motion Granted admin dashboard.',
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
  client_id: string
  profiles?: {
    full_name: string
    email: string
  }
}

export default async function AdminDashboardPage() {
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
    .limit(10)

  // Get all orders for stats
  const { data: allOrders } = await supabase
    .from('orders')
    .select('status, total_price')

  // Calculate stats
  const pendingOrders = allOrders?.filter((o: { status: string }) =>
    o.status === 'submitted'
  ).length || 0

  const inProgressOrders = allOrders?.filter((o: { status: string }) =>
    ['in_progress', 'in_review'].includes(o.status)
  ).length || 0

  const completedOrders = allOrders?.filter((o: { status: string }) =>
    o.status === 'completed'
  ).length || 0

  const totalRevenue = allOrders?.reduce((sum: number, o: { total_price: number }) =>
    sum + (o.total_price || 0), 0
  ) || 0

  // Get unique clients count
  const { count: clientCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'client')

  const stats = [
    {
      label: 'New Orders',
      value: pendingOrders,
      icon: AlertCircle,
      bgColor: 'bg-gradient-to-br from-orange-50 to-orange-100',
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-600',
      valueColor: 'text-orange-700',
      urgent: pendingOrders > 0,
      href: '/admin/orders?status=submitted'
    },
    {
      label: 'In Progress',
      value: inProgressOrders,
      icon: Clock,
      bgColor: 'bg-gradient-to-br from-blue-50 to-blue-100',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
      valueColor: 'text-blue-700',
      href: '/admin/orders?status=in_progress'
    },
    {
      label: 'Completed',
      value: completedOrders,
      icon: CheckCircle,
      bgColor: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600',
      valueColor: 'text-emerald-700',
      href: '/admin/orders?status=completed'
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      bgColor: 'bg-gradient-to-br from-purple-50 to-purple-100',
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-600',
      valueColor: 'text-purple-700',
      isRevenue: true,
      href: '/admin/analytics'
    },
  ]

  const recentOrders: Order[] = orders || []

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
          Admin Dashboard
        </h1>
        <p className="text-gray-500 mt-1">
          Overview of all orders and business metrics
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group">
            <Card className={`${stat.bgColor} border-0 overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg ${stat.urgent ? 'ring-2 ring-orange-400' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">
                      {stat.label}
                    </p>
                    <p className={`text-3xl font-bold ${stat.valueColor} ${stat.isRevenue ? '' : 'tabular-nums'}`}>
                      {stat.value}
                    </p>
                  </div>
                  <div className={`${stat.iconBg} p-3 rounded-xl transition-transform duration-300 group-hover:scale-110`}>
                    <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 p-3 rounded-xl">
                <Users className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Clients</p>
                <p className="text-2xl font-bold text-navy tabular-nums">{clientCount || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 p-3 rounded-xl">
                <FileText className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Orders</p>
                <p className="text-2xl font-bold text-navy tabular-nums">{allOrders?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 p-3 rounded-xl">
                <TrendingUp className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Avg. Order Value</p>
                <p className="text-2xl font-bold text-navy tabular-nums">
                  {allOrders?.length ? formatCurrency(totalRevenue / allOrders.length) : '$0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100">
          <div>
            <CardTitle className="text-lg font-semibold text-navy">Recent Orders</CardTitle>
            <CardDescription className="text-gray-500">Latest orders from all clients</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild className="text-gray-500 hover:text-teal">
            <Link href="/admin/orders" className="flex items-center gap-1">
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-semibold text-navy mb-1">No orders yet</h3>
              <p className="text-gray-500">Orders will appear here when clients submit them</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                      <FileText className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs text-gray-400">
                          {order.order_number}
                        </span>
                        <OrderStatusBadge status={order.status as OrderStatus} size="sm" />
                      </div>
                      <p className="font-medium text-navy truncate">
                        {order.motion_type}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {order.profiles?.full_name || order.profiles?.email || 'Unknown Client'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 ml-4 hidden sm:block">
                    <p className="font-bold text-navy tabular-nums">
                      {formatCurrency(order.total_price)}
                    </p>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      <Calendar className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {formatDateShort(order.filing_deadline)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-gray-400 ml-2" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
