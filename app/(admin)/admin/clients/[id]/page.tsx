import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building,
  Calendar,
  FileText,
  Scale,
  ChevronRight,
  User,
  Clock,
  DollarSign,
} from 'lucide-react'
import { formatDateShort, formatCurrency } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Client Details - Admin',
  description: 'View client information and orders.',
}

interface Order {
  id: string
  order_number: string
  motion_type: string
  status: string
  total_price: number
  created_at: string
  filing_deadline: string
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch client profile
  const { data: client, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !client) {
    notFound()
  }

  // Fetch client's orders
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const clientOrders: Order[] = orders || []
  const totalSpent = clientOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0)
  const completedOrders = clientOrders.filter(o => o.status === 'completed').length

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700'
      case 'in_progress':
      case 'assigned':
        return 'bg-blue-100 text-blue-700'
      case 'submitted':
      case 'under_review':
        return 'bg-amber-100 text-amber-700'
      case 'cancelled':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Back button */}
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-teal mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Clients
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal to-teal-dark text-white text-xl font-bold">
            {client.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-navy">{client.full_name || 'Unknown'}</h1>
            <p className="text-gray-500">Client since {formatDateShort(client.created_at)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`mailto:${client.email}`}>
              <Mail className="h-4 w-4 mr-2" />
              Email Client
            </a>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card className="bg-white border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-teal/10 p-3 rounded-xl">
                <FileText className="h-6 w-6 text-teal" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Orders</p>
                <p className="text-2xl font-bold text-navy">{clientOrders.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-green-500/10 p-3 rounded-xl">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Spent</p>
                <p className="text-2xl font-bold text-navy">{formatCurrency(totalSpent)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-blue-500/10 p-3 rounded-xl">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-navy">{completedOrders}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Client Info */}
        <Card className="bg-white border-gray-200 lg:col-span-1">
          <CardHeader className="border-b border-gray-200">
            <CardTitle className="text-lg font-semibold text-navy flex items-center gap-2">
              <User className="h-5 w-5 text-teal" />
              Client Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                <p className="text-sm font-medium text-navy">{client.email}</p>
              </div>
            </div>

            {client.phone && (
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                  <p className="text-sm font-medium text-navy">{client.phone}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Scale className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Bar Number</p>
                <p className="text-sm font-medium text-navy">{client.bar_number || 'Not provided'}</p>
              </div>
            </div>

            {client.states_licensed && client.states_licensed.length > 0 && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Licensed States</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {client.states_licensed.map((state: string) => (
                      <span
                        key={state}
                        className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded"
                      >
                        {state}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {client.firm_name && (
              <div className="flex items-start gap-3">
                <Building className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Firm</p>
                  <p className="text-sm font-medium text-navy">{client.firm_name}</p>
                  {client.firm_address && (
                    <p className="text-sm text-gray-500 mt-1">{client.firm_address}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Member Since</p>
                <p className="text-sm font-medium text-navy">{formatDateShort(client.created_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders */}
        <Card className="bg-white border-gray-200 lg:col-span-2">
          <CardHeader className="border-b border-gray-200">
            <CardTitle className="text-lg font-semibold text-navy flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal" />
              Order History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {clientOrders.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-semibold text-navy mb-1">No orders yet</h3>
                <p className="text-gray-400">This client has not placed any orders</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {clientOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-semibold text-navy">{order.order_number}</p>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}>
                          {formatStatus(order.status)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{order.motion_type}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Created {formatDateShort(order.created_at)} • Due {formatDateShort(order.filing_deadline)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm font-semibold text-navy">{formatCurrency(order.total_price)}</p>
                      <ChevronRight className="h-5 w-5 text-gray-300" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
