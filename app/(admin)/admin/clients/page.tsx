import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Users,
  Mail,
  Phone,
  MapPin,
  FileText,
  Calendar,
  ChevronRight,
  Search,
  Building,
} from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Clients - Admin',
  description: 'View and manage all clients.',
}

interface Client {
  id: string
  email: string
  full_name: string
  phone: string | null
  bar_number: string
  states_licensed: string[]
  firm_name: string | null
  firm_address: string | null
  created_at: string
  order_count?: number
}

export default async function AdminClientsPage() {
  const supabase = await createClient()

  // Fetch all clients
  const { data: clients } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .order('created_at', { ascending: false })

  // Get order counts for each client
  const { data: orderCounts } = await supabase
    .from('orders')
    .select('client_id')

  // Calculate order count per client
  const orderCountMap: Record<string, number> = {}
  orderCounts?.forEach((order: { client_id: string }) => {
    orderCountMap[order.client_id] = (orderCountMap[order.client_id] || 0) + 1
  })

  const clientsWithOrders: Client[] = (clients || []).map((client: Client) => ({
    ...client,
    order_count: orderCountMap[client.id] || 0
  }))

  const totalClients = clientsWithOrders.length
  const activeClients = clientsWithOrders.filter(c => (c.order_count ?? 0) > 0).length

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">Clients</h1>
        <p className="text-gray-500 mt-1">View and manage all registered clients</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card className="bg-white border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-teal/10 p-3 rounded-xl">
                <Users className="h-6 w-6 text-teal" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Clients</p>
                <p className="text-2xl font-bold text-navy tabular-nums">{totalClients}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-500/10 p-3 rounded-xl">
                <FileText className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Active Clients</p>
                <p className="text-2xl font-bold text-navy tabular-nums">{activeClients}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="bg-blue-500/10 p-3 rounded-xl">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">New This Month</p>
                <p className="text-2xl font-bold text-navy tabular-nums">
                  {clientsWithOrders.filter(c => {
                    const created = new Date(c.created_at)
                    const now = new Date()
                    return created.getMonth() === now.getMonth() &&
                           created.getFullYear() === now.getFullYear()
                  }).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client List */}
      <Card className="bg-white border-gray-200">
        <CardHeader className="border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-navy">All Clients</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {clientsWithOrders.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-semibold text-navy mb-1">No clients yet</h3>
              <p className="text-gray-400">Clients will appear here when they register</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {clientsWithOrders.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal to-teal-dark text-white font-semibold">
                      {client.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy truncate">
                        {client.full_name || 'Unknown'}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {client.email}
                        </span>
                        {client.firm_name && (
                          <span className="flex items-center gap-1 hidden sm:flex">
                            <Building className="h-3 w-3" />
                            {client.firm_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0 ml-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium text-navy">
                        {client.order_count ?? 0} order{(client.order_count ?? 0) !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        Joined {formatDateShort(client.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {client.states_licensed && client.states_licensed.length > 0 && (
                        <div className="flex items-center gap-1">
                          {client.states_licensed.slice(0, 2).map((state: string) => (
                            <span
                              key={state}
                              className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded"
                            >
                              {state}
                            </span>
                          ))}
                          {client.states_licensed.length > 2 && (
                            <span className="text-xs text-gray-400">
                              +{client.states_licensed.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
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
