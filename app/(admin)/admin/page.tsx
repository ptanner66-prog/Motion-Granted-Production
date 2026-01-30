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
  A: 'bg-gray-100 text-gray-700 border-gray-300',
  B: 'bg-gray-100 text-gray-700 border-gray-300',
  C: 'bg-gray-100 text-gray-700 border-gray-300',
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

  // Fetch active workflows (with graceful handling if tables don't exist)
  let activeWorkflows: WorkflowRow[] = []
  let phasesNeedingReview: PhaseRow[] = []
  let workflowsInProgress = 0
  let workflowsCompleted = 0
  let workflowsBlocked = 0
  let workflowTablesExist = true

  try {
    // PRIMARY: Query v7.2 workflow_state table (where actual workflow engine tracks state)
    const { count: v72InProgress, error: v72Error } = await supabase
      .from('workflow_state')
      .select('*', { count: 'exact', head: true })
      .in('phase_status', ['PENDING', 'RUNNING', 'CHECKPOINT', 'HOLD'])
      .is('completed_at', null)

    const { count: v72Completed } = await supabase
      .from('workflow_state')
      .select('*', { count: 'exact', head: true })
      .eq('phase_status', 'COMPLETE')

    const { count: v72Blocked } = await supabase
      .from('workflow_state')
      .select('*', { count: 'exact', head: true })
      .in('phase_status', ['ERROR', 'CANCELLED'])

    if (!v72Error) {
      // Use v7.2 workflow_state counts
      workflowsInProgress = v72InProgress || 0
      workflowsCompleted = v72Completed || 0
      workflowsBlocked = v72Blocked || 0
    }

    // FALLBACK: Query legacy order_workflows table for display data
    const { data: wfData, error: wfError } = await supabase
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

    if (wfError && wfError.code === '42P01') {
      // Table doesn't exist - workflow migration not run
      workflowTablesExist = false
    } else if (!wfError) {
      activeWorkflows = (wfData || []) as WorkflowRow[]

      // Fetch phases requiring review
      const { data: reviewData } = await supabase
        .from('workflow_phase_executions')
        .select('id, status, requires_review, phase_number, order_workflow_id')
        .eq('requires_review', true)
        .eq('status', 'requires_review')
      phasesNeedingReview = (reviewData || []) as PhaseRow[]

      // If v7.2 query failed, fall back to legacy counts
      if (v72Error) {
        const { count: inProgress } = await supabase
          .from('order_workflows')
          .select('*', { count: 'exact', head: true })
          .in('status', ['in_progress', 'pending', 'awaiting_cp1', 'awaiting_cp2', 'awaiting_cp3'])
        workflowsInProgress = inProgress || 0

        const { count: completed } = await supabase
          .from('order_workflows')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'completed')
        workflowsCompleted = completed || 0

        const { count: blocked } = await supabase
          .from('order_workflows')
          .select('*', { count: 'exact', head: true })
          .in('status', ['blocked', 'failed', 'error'])
        workflowsBlocked = blocked || 0
      }
    }
  } catch {
    // Workflow tables not available
    workflowTablesExist = false
  }

  // Calculate stats
  const pendingOrders = allOrders?.filter((o: { status: string }) =>
    o.status === 'submitted'
  ).length || 0

  const inProgressOrders = allOrders?.filter((o: { status: string }) =>
    ['in_progress', 'under_review', 'pending_review'].includes(o.status)
  ).length || 0

  const completedOrders = allOrders?.filter((o: { status: string }) =>
    ['completed', 'draft_delivered', 'revision_delivered'].includes(o.status)
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
      urgent: pendingOrders > 0,
      href: '/admin/orders?status=submitted'
    },
    {
      label: 'In Progress',
      value: inProgressOrders,
      icon: Clock,
      href: '/admin/orders?status=in_progress'
    },
    {
      label: 'Avg. Turnaround',
      value: avgTurnaroundDays !== null ? `${avgTurnaroundDays} days` : 'N/A',
      icon: CheckCircle,
      href: '/admin/orders?status=completed'
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      isRevenue: true,
      href: '/admin/analytics'
    },
  ]

  const recentOrders: Order[] = orders || []
  const workflows = activeWorkflows
  const reviewCount = phasesNeedingReview.length

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

      {/* Workflow Setup Banner */}
      {!workflowTablesExist && (
        <Card className="mb-8 bg-white border border-gray-200 border-l-4 border-l-amber-500 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="bg-gray-100 p-3 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-gray-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-navy mb-1">Workflow System Setup Required</h3>
                <p className="text-sm text-gray-600 mb-3">
                  The AI workflow system tables have not been created yet. Run the database migration to enable automated document production with 14-phase workflows, citation verification, and quality scoring.
                </p>
                <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-700 mb-3 border border-gray-200">
                  <p className="mb-1 text-gray-500">-- Run this in your Supabase SQL Editor:</p>
                  <p>supabase/migrations/003_motion_workflow_system.sql</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="gap-2">
                    Open Supabase Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group">
            <Card className={`bg-white border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md ${stat.urgent ? 'border-l-4 border-l-red-500' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">
                      {stat.label}
                    </p>
                    <p className={`text-3xl font-bold text-navy ${stat.isRevenue ? '' : 'tabular-nums'}`}>
                      {stat.value}
                    </p>
                  </div>
                  <div className="bg-gray-100 p-3 rounded-lg transition-transform duration-300 group-hover:scale-105">
                    <stat.icon className="h-6 w-6 text-gray-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Workflow Stats */}
      {workflowTablesExist && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <Workflow className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Active Workflows</p>
                  <p className="text-2xl font-bold text-navy tabular-nums">{workflowsInProgress}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-white border shadow-sm ${reviewCount > 0 ? 'border-l-4 border-l-amber-500 border-gray-200' : 'border-gray-200'}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-gray-600" />
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
                <div className="bg-gray-100 p-3 rounded-lg">
                  <BookCheck className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Completed</p>
                  <p className="text-2xl font-bold text-navy tabular-nums">{workflowsCompleted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-white border shadow-sm ${workflowsBlocked > 0 ? 'border-l-4 border-l-red-500 border-gray-200' : 'border-gray-200'}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <AlertCircle className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Blocked</p>
                  <p className="text-2xl font-bold text-navy tabular-nums">{workflowsBlocked}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Active Workflows */}
        {workflowTablesExist ? (
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
                  const progress = (wf.current_phase / 14) * 100
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
                          Phase {wf.current_phase}/14
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
        ) : (
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-semibold text-navy flex items-center gap-2">
                <Workflow className="h-5 w-5 text-blue-500" />
                AI Document Production
              </CardTitle>
              <CardDescription className="text-gray-500">Automated 14-phase workflow system</CardDescription>
            </CardHeader>
            <CardContent className="py-8 text-center">
              <Workflow className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-semibold text-navy mb-2">Workflow System Available</h3>
              <p className="text-gray-500 text-sm mb-4 max-w-sm mx-auto">
                Run the migration to enable AI-powered document production with citation verification and quality scoring.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                  Setup Instructions
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

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
                  <FileText className="h-4 w-4 text-gray-500" />
                  <Badge variant="outline" className="bg-white border-gray-300 text-gray-700">Tier A</Badge>
                  <span className="text-sm text-gray-600">Procedural/Administrative</span>
                </div>
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-gray-500" />
                  <Badge variant="outline" className="bg-white border-gray-300 text-gray-700">Tier B</Badge>
                  <span className="text-sm text-gray-600">Intermediate</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-gray-500" />
                  <Badge variant="outline" className="bg-white border-gray-300 text-gray-700">Tier C</Badge>
                  <span className="text-sm text-gray-600">Complex/Dispositive</span>
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
