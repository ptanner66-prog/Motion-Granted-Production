import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Users,
  Clock,
  CheckCircle,
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Analytics - Admin',
  description: 'Business metrics and analytics.',
}

interface Order {
  id: string
  total_price: number
  status: string
  motion_type: string
  turnaround: string
  created_at: string
}

export default async function AdminAnalyticsPage() {
  const supabase = await createClient()

  // Get all orders
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  // Get all clients
  const { count: totalClients } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'client')

  const allOrders: Order[] = orders || []

  // Calculate current month stats
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear

  const currentMonthOrders = allOrders.filter(o => {
    const d = new Date(o.created_at)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const lastMonthOrders = allOrders.filter(o => {
    const d = new Date(o.created_at)
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
  })

  // Revenue calculations
  const totalRevenue = allOrders.reduce((sum, o) => sum + (o.total_price || 0), 0)
  const currentMonthRevenue = currentMonthOrders.reduce((sum, o) => sum + (o.total_price || 0), 0)
  const lastMonthRevenue = lastMonthOrders.reduce((sum, o) => sum + (o.total_price || 0), 0)

  // Calculate percentage change
  const revenueChange = lastMonthRevenue > 0
    ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : 0

  const ordersChange = lastMonthOrders.length > 0
    ? ((currentMonthOrders.length - lastMonthOrders.length) / lastMonthOrders.length) * 100
    : 0

  // Order status breakdown
  const completedOrders = allOrders.filter(o => o.status === 'completed').length
  const pendingOrders = allOrders.filter(o => o.status === 'submitted').length
  const inProgressOrders = allOrders.filter(o => ['in_progress', 'in_review', 'assigned'].includes(o.status)).length

  // Average order value
  const avgOrderValue = allOrders.length > 0 ? totalRevenue / allOrders.length : 0

  // Orders by motion type
  const motionTypes: Record<string, number> = {}
  allOrders.forEach(o => {
    motionTypes[o.motion_type] = (motionTypes[o.motion_type] || 0) + 1
  })
  const topMotionTypes = Object.entries(motionTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Orders by turnaround
  const turnaroundTypes: Record<string, number> = {}
  allOrders.forEach(o => {
    const type = o.turnaround === 'standard' ? 'Standard' :
                 o.turnaround === 'rush_72' ? '72-hour Rush' : '48-hour Rush'
    turnaroundTypes[type] = (turnaroundTypes[type] || 0) + 1
  })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Analytics</h1>
        <p className="text-gray-400 mt-1">Business metrics and performance insights</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400 mb-1">Total Revenue</p>
                <p className="text-3xl font-bold text-white">{formatCurrency(totalRevenue)}</p>
                <div className={`flex items-center gap-1 mt-2 text-sm ${revenueChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {revenueChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  <span>{Math.abs(revenueChange).toFixed(1)}% vs last month</span>
                </div>
              </div>
              <div className="bg-emerald-500/20 p-3 rounded-xl">
                <DollarSign className="h-6 w-6 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400 mb-1">Total Orders</p>
                <p className="text-3xl font-bold text-white">{allOrders.length}</p>
                <div className={`flex items-center gap-1 mt-2 text-sm ${ordersChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {ordersChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  <span>{Math.abs(ordersChange).toFixed(1)}% vs last month</span>
                </div>
              </div>
              <div className="bg-blue-500/20 p-3 rounded-xl">
                <FileText className="h-6 w-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-500/5 border-purple-500/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400 mb-1">Avg. Order Value</p>
                <p className="text-3xl font-bold text-white">{formatCurrency(avgOrderValue)}</p>
                <p className="text-sm text-gray-500 mt-2">Per order</p>
              </div>
              <div className="bg-purple-500/20 p-3 rounded-xl">
                <TrendingUp className="h-6 w-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-teal/20 to-teal/5 border-teal/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400 mb-1">Total Clients</p>
                <p className="text-3xl font-bold text-white">{totalClients || 0}</p>
                <p className="text-sm text-gray-500 mt-2">Registered users</p>
              </div>
              <div className="bg-teal/20 p-3 rounded-xl">
                <Users className="h-6 w-6 text-teal" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Order Status Breakdown */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white">Order Status</CardTitle>
            <CardDescription className="text-gray-500">Current order pipeline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500/20 p-2 rounded-lg">
                  <Clock className="h-4 w-4 text-orange-400" />
                </div>
                <span className="text-gray-300">Pending</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full"
                    style={{ width: `${allOrders.length > 0 ? (pendingOrders / allOrders.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-white font-semibold w-8 text-right">{pendingOrders}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/20 p-2 rounded-lg">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-gray-300">In Progress</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${allOrders.length > 0 ? (inProgressOrders / allOrders.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-white font-semibold w-8 text-right">{inProgressOrders}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/20 p-2 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                </div>
                <span className="text-gray-300">Completed</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${allOrders.length > 0 ? (completedOrders / allOrders.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-white font-semibold w-8 text-right">{completedOrders}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Turnaround Distribution */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white">Turnaround Times</CardTitle>
            <CardDescription className="text-gray-500">Order delivery preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(turnaroundTypes).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    type === 'Standard' ? 'bg-gray-700' :
                    type === '72-hour Rush' ? 'bg-orange-500/20' : 'bg-red-500/20'
                  }`}>
                    <Clock className={`h-4 w-4 ${
                      type === 'Standard' ? 'text-gray-400' :
                      type === '72-hour Rush' ? 'text-orange-400' : 'text-red-400'
                    }`} />
                  </div>
                  <span className="text-gray-300">{type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        type === 'Standard' ? 'bg-gray-500' :
                        type === '72-hour Rush' ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${allOrders.length > 0 ? (count / allOrders.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-white font-semibold w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
            {Object.keys(turnaroundTypes).length === 0 && (
              <p className="text-gray-500 text-center py-4">No orders yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Motion Types */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white">Popular Motion Types</CardTitle>
          <CardDescription className="text-gray-500">Most requested motion types</CardDescription>
        </CardHeader>
        <CardContent>
          {topMotionTypes.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No orders yet</p>
          ) : (
            <div className="space-y-4">
              {topMotionTypes.map(([type, count], index) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-gray-600 w-8">#{index + 1}</span>
                    <span className="text-gray-300">{type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal to-teal-dark rounded-full"
                        style={{ width: `${(count / topMotionTypes[0][1]) * 100}%` }}
                      />
                    </div>
                    <span className="text-white font-semibold w-12 text-right">{count} orders</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
