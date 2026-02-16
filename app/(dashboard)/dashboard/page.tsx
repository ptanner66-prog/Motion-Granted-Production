import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import {
  PlusCircle,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Calendar,
  DollarSign,
  ChevronRight,
  ExternalLink,
  Settings
} from 'lucide-react'
import { formatCurrencyFromCents, formatRelativeTime, truncateString, mapToDisplayStatus } from '@/lib/utils'
import { formatMotionType } from '@/config/motion-types'
import type { OrderDisplayKey } from '@/config/motion-types'

interface Order {
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

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your Motion Granted dashboard.',
}

function getDaysUntilDue(deadline: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(deadline)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getUrgencyClass(daysUntilDue: number) {
  if (daysUntilDue <= 3) return 'urgency-overdue'
  if (daysUntilDue <= 7) return 'urgency-soon'
  return ''
}

/** Display price from amount_paid (cents from Stripe) or total_price (dollars fallback) */
function displayPrice(order: Order): string {
  if (order.amount_paid && order.amount_paid > 0) {
    return `$${(order.amount_paid / 100).toFixed(2)}`
  }
  return `$${order.total_price.toFixed(2)}`
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch recent orders with parties
  const { data: orders } = await supabase
    .from('orders')
    .select('*, parties(party_name, party_role)')
    .eq('client_id', user?.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Fetch all order statuses for stats
  const { data: allOrders } = await supabase
    .from('orders')
    .select('status')
    .eq('client_id', user?.id)

  // Stat card queries per 7-status model spec
  const activeCount = allOrders?.filter((o: { status: string }) => {
    const ds = mapToDisplayStatus(o.status)
    return ['PAID', 'IN_PROGRESS', 'REVISION_REQ'].includes(ds)
  }).length || 0

  const completedCount = allOrders?.filter((o: { status: string }) => {
    const ds = mapToDisplayStatus(o.status)
    return ds === 'COMPLETED'
  }).length || 0

  const pendingReviewCount = allOrders?.filter((o: { status: string }) => {
    const ds = mapToDisplayStatus(o.status)
    return ['AWAITING_APPROVAL', 'HOLD_PENDING'].includes(ds)
  }).length || 0

  const stats = [
    {
      label: 'Active Orders',
      value: activeCount,
      icon: Clock,
      color: 'blue',
      bgGradient: 'from-blue-500/10 to-blue-600/5',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      trend: 'In progress',
      href: '/orders?status=active'
    },
    {
      label: 'Completed',
      value: completedCount,
      icon: CheckCircle,
      color: 'green',
      bgGradient: 'from-emerald-500/10 to-emerald-600/5',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      trend: 'All time',
      href: '/orders?status=completed'
    },
    {
      label: 'Pending Review',
      value: pendingReviewCount,
      icon: AlertCircle,
      color: 'orange',
      bgGradient: 'from-orange-500/10 to-orange-600/5',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      trend: pendingReviewCount > 0 ? 'Action needed' : 'None pending',
      urgent: pendingReviewCount > 0,
      href: '/orders?status=pending_review'
    },
  ]

  const quickActions = [
    {
      title: 'New Order',
      description: 'Start a new motion request',
      icon: PlusCircle,
      href: '/submit',
      iconBg: 'bg-gradient-to-br from-teal/20 to-teal/10',
      iconColor: 'text-teal',
      primary: true
    },
    {
      title: 'View All Orders',
      description: 'See your order history',
      icon: FileText,
      href: '/orders',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    {
      title: 'View Pricing',
      description: 'See motion prices',
      icon: DollarSign,
      href: '/pricing',
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
      external: true
    },
    {
      title: 'Settings',
      description: 'Account settings',
      icon: Settings,
      href: '/settings',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600'
    }
  ]

  const recentOrders: Order[] = orders || []

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
            Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            Welcome back! Here&apos;s your order overview.
          </p>
        </div>
      </div>

      {/* Stats Grid - Hero Numbers */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group"
          >
            <Card className={`stat-card card-hover overflow-hidden border-0 shadow-sm ${stat.urgent ? 'ring-2 ring-orange-200' : ''}`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-50`} />
              <CardContent className="relative p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">
                      {stat.label}
                    </p>
                    <p className="text-4xl font-bold text-navy tabular-nums tracking-tight">
                      {stat.value}
                    </p>
                    <p className={`text-xs mt-2 font-medium ${stat.urgent ? 'text-orange-600' : 'text-gray-400'}`}>
                      {stat.trend}
                    </p>
                  </div>
                  <div className={`${stat.iconBg} p-3 rounded-xl transition-transform duration-300 group-hover:scale-110`}>
                    <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Orders */}
      <Card className="mt-8 shadow-sm border-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-gray-50/80 to-transparent border-b border-gray-100">
          <div>
            <CardTitle className="text-lg font-semibold text-navy">Recent Orders</CardTitle>
            <CardDescription className="text-gray-500">Your most recent motion orders</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild className="text-gray-600 hover:text-navy">
            <Link href="/orders" className="flex items-center gap-1">
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="empty-state py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
                <FileText className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-navy mb-1">No orders yet</h3>
              <p className="text-gray-500 mb-4">Get started by creating your first motion order</p>
              <Button asChild>
                <Link href="/orders/new">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Order
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentOrders.map((order, index) => {
                const daysUntilDue = getDaysUntilDue(order.filing_deadline)
                const displayStatus = mapToDisplayStatus(order.status)
                const partyString = order.parties?.map(p => p.party_name).join(' v. ') || ''
                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className={`order-card flex items-center justify-between py-4 px-6 hover:bg-gray-50/50 transition-all ${getUrgencyClass(daysUntilDue)}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 group-hover:bg-gray-200 transition-colors">
                          <FileText className="h-6 w-6 text-gray-500" />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-gray-400 tracking-wide">
                            {order.order_number}
                          </span>
                          <OrderStatusBadge status={displayStatus as OrderDisplayKey} size="sm" />
                        </div>
                        <p className="font-semibold text-navy truncate">
                          {formatMotionType(order.motion_type)}
                        </p>
                        {partyString && (
                          <p className="text-sm text-gray-500 truncate">
                            {truncateString(partyString, 80)}
                          </p>
                        )}
                        {!partyString && (
                          <p className="text-sm text-gray-500 truncate">{order.case_caption}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 ml-4 hidden sm:block">
                      <p className="font-bold text-navy tabular-nums">
                        {displayPrice(order)}
                      </p>
                      <div className="flex items-center justify-end gap-1.5 mt-1 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span className={`${daysUntilDue <= 7 ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                          {formatRelativeTime(order.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                      <ChevronRight className="h-5 w-5 text-gray-300" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              target={action.external ? '_blank' : undefined}
              rel={action.external ? 'noopener noreferrer' : undefined}
            >
              <Card className={`action-card h-full border-0 shadow-sm transition-all ${action.primary ? 'ring-1 ring-teal/30 bg-gradient-to-br from-teal/5 to-transparent' : ''}`}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`action-icon ${action.iconBg} p-3 rounded-xl transition-all duration-300`}>
                    <action.icon className={`h-6 w-6 ${action.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy flex items-center gap-1">
                      {action.title}
                      {action.external && (
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                      )}
                    </p>
                    <p className="text-sm text-gray-500 truncate">{action.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
