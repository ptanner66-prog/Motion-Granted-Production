import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
  Workflow,
  BookCheck,
  AlertTriangle,
  Zap,
  Scale,
  Shield,
} from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { formatMotionType } from '@/config/motion-types'
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

interface WorkflowRow {
  id: string
  order_id: string
  current_phase: number
  status: string
  citation_count: number
  quality_score: number | null
  motion_types?: {
    code: string
    name: string
    tier: string
  }
  orders?: {
    order_number: string
  }
}

interface PhaseRow {
  id: string
  status: string
  requires_review: boolean
  phase_number: number
  order_workflow_id: string
}

const TIER_COLORS = {
  A: 'bg-purple-100 text-purple-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  // Fetch recent orders with client info, sorted by filing deadline (soonest first)
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      *,
      profiles:client_id (
        full_name,
        email
      )
    `)
    .order('filing_deadline', { ascending: true })
    .limit(10)

  // Get all orders for stats (include created_at and updated_at for turnaround calculation)
  const { data: allOrders } = await supabase
    .from('orders')
    .select('status, total_price, created_at, updated_at')

  // Fetch active workflows
  const { data: activeWorkflows } = await supabase
    .from('order_workflows')
    .select(`
      id,
      order_id,
      current_phase,
      status,
      citation_count,
      quality_score,
      motion_types(code, name, tier),
      orders(order_number)
    `)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(5)

  // Fetch phases requiring review
  const { data: phasesNeedingReview } = await supabase
    .from('workflow_phase_executions')
    .select('id, status, requires_review, phase_number, order_workflow_id')
    .eq('requires_review', true)
    .eq('status', 'requires_review')

  // Count workflows by status
  const { count: workflowsInProgress } = await supabase
    .from('order_workflows')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'in_progress')

  const { count: workflowsCompleted } = await supabase
    .from('order_workflows')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')

  const { count: workflowsBlocked } = await supabase
    .from('order_workflows')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'blocked')

  // Calculate stats
  const pendingOrders = allOrders?.filter((o: { status: string }) =>
    o.status === 'submitted'
  ).length || 0

  const inProgressOrders = allOrders?.filter((o: { status: string }) =>
    ['in_progress', 'in_review'].includes(o.status)
  ).length || 0

  const completedOrders = allOrders?.filter((o: { status: string }) =>
    o.status === 'completed'
  ) || []

  // Calculate average turnaround time for completed orders
  const avgTurnaroundDays = (() => {
    if (completedOrders.length === 0) return null;

    const totalDays = completedOrders.reduce((sum: number, o: { created_at: string; updated_at: string }) => {
      const created = new Date(o.created_at);
      const completed = new Date(o.updated_at);
      const diffTime = Math.abs(completed.getTime() - created.getTime());
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      return sum + diffDays;
    }, 0);

    return Math.round(totalDays / completedOrders.length * 10) / 10;
  })();

  const totalRevenue = allOrders?.filter((o: { status: string }) => o.status !== 'cancelled')
    .reduce((sum: number, o: { total_price: number }) => sum + (o.total_price || 0), 0) || 0

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
      label: 'Avg. Turnaround',
      value: avgTurnaroundDays !== null ? `${avgTurnaroundDays} days` : 'N/A',
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
  const workflows = (activeWorkflows || []) as WorkflowRow[]
  const reviewCount = (phasesNeedingReview || []).length

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            Overview of all orders and business metrics
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/automation" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Automation Center
          </Link>
        </Button>
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

      {/* Workflow Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-blue-100 p-3 rounded-xl">
                <Workflow className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Active Workflows</p>
                <p className="text-2xl font-bold text-navy tabular-nums">{workflowsInProgress || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-yellow-100 p-3 rounded-xl">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Needs Review</p>
                <p className="text-2xl font-bold text-navy tabular-nums">{reviewCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-green-100 p-3 rounded-xl">
                <BookCheck className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-navy tabular-nums">{workflowsCompleted || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-red-100 p-3 rounded-xl">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Blocked</p>
                <p className="text-2xl font-bold text-navy tabular-nums">{workflowsBlocked || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Active Workflows */}
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100">
            <div>
              <CardTitle className="text-lg font-semibold text-navy flex items-center gap-2">
                <Workflow className="h-5 w-5 text-blue-500" />
                Active Workflows
              </CardTitle>
              <CardDescription className="text-gray-500">Document production in progress</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-gray-500 hover:text-teal">
              <Link href="/admin/automation" className="flex items-center gap-1">
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {workflows.length === 0 ? (
              <div className="py-12 text-center">
                <Workflow className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-semibold text-navy mb-1">No active workflows</h3>
                <p className="text-gray-500">Workflows will appear here when orders are processed</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {workflows.map((wf) => {
                  const progress = (wf.current_phase / 9) * 100
                  const tierColor = TIER_COLORS[wf.motion_types?.tier as keyof typeof TIER_COLORS] || 'bg-gray-100 text-gray-700'

                  return (
                    <div key={wf.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-400">
                            {wf.orders?.order_number || 'Unknown'}
                          </span>
                          <Badge variant="outline" className={tierColor}>
                            Tier {wf.motion_types?.tier}
                          </Badge>
                        </div>
                        <Badge variant={wf.status === 'blocked' ? 'destructive' : 'secondary'}>
                          Phase {wf.current_phase}/9
                        </Badge>
                      </div>
                      <p className="font-medium text-navy text-sm mb-2 truncate">
                        {wf.motion_types?.name || 'Unknown Motion'}
                      </p>
                      <div className="flex items-center gap-4">
                        <Progress value={progress} className="flex-1 h-2" />
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {Math.round(progress)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <BookCheck className="h-3 w-3" />
                          {wf.citation_count} citations
                        </span>
                        {wf.quality_score && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            {Math.round(wf.quality_score * 100)}% quality
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Secondary Stats */}
        <div className="space-y-4">
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

          {/* Motion Type Legend */}
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Motion Tiers</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-purple-600" />
                  <Badge variant="outline" className="bg-purple-100 text-purple-700">Tier A</Badge>
                  <span className="text-sm text-gray-600">Complex Strategic</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <Badge variant="outline" className="bg-blue-100 text-blue-700">Tier B</Badge>
                  <span className="text-sm text-gray-600">Standard Procedural</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <Badge variant="outline" className="bg-green-100 text-green-700">Tier C</Badge>
                  <span className="text-sm text-gray-600">Routine</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
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
                        {formatMotionType(order.motion_type)}
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
