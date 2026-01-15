import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils'
import { StatusUpdateForm } from '@/components/admin/status-update-form'
import {
  ArrowLeft,
  FileText,
  User,
  Scale,
  Paperclip,
  Clock,
  Calendar,
  DollarSign,
  Building,
} from 'lucide-react'
import type { OrderStatus } from '@/types'

export const metadata: Metadata = {
  title: 'Order Details - Admin',
  description: 'View and manage order details.',
}

interface Party {
  party_name: string
  party_role: string
}

interface Document {
  id: string
  file_name: string
  file_url: string
  document_type: string
  created_at: string
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch order with client info
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      profiles:client_id (
        full_name,
        email,
        phone,
        bar_number,
        firm_name,
        firm_address,
        firm_phone
      )
    `)
    .eq('id', id)
    .single()

  if (error || !order) {
    notFound()
  }

  // Fetch parties
  const { data: partiesData } = await supabase
    .from('parties')
    .select('party_name, party_role')
    .eq('order_id', id)
  const parties: Party[] = partiesData || []

  // Fetch documents
  const { data: documentsData } = await supabase
    .from('documents')
    .select('*')
    .eq('order_id', id)
  const documents: Document[] = documentsData || []

  const client = order.profiles

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/orders"
          className="inline-flex items-center text-sm text-gray-400 hover:text-orange-400 transition-colors mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {order.order_number}
              </h1>
              <OrderStatusBadge status={order.status as OrderStatus} />
            </div>
            <p className="text-lg text-gray-300">{order.motion_type}</p>
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium">{order.case_caption}</span>
              <span className="mx-2">•</span>
              Case #{order.case_number}
            </p>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="details">
            <TabsList className="bg-gray-800 p-1 border border-gray-700">
              <TabsTrigger
                value="details"
                className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 rounded-lg px-4 gap-2"
              >
                <FileText className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 rounded-lg px-4 gap-2"
              >
                <Paperclip className="h-4 w-4" />
                Documents
                <span className="rounded-full bg-gray-600 px-1.5 py-0.5 text-xs font-semibold text-gray-300 ml-1">
                  {documents.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-6 space-y-6">
              {/* Case Information */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-800">
                  <CardTitle className="text-lg flex items-center gap-2 text-white">
                    <Scale className="h-5 w-5 text-gray-500" />
                    Case Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Case Caption</p>
                      <p className="text-white">{order.case_caption}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Case Number</p>
                      <p className="text-white font-mono">{order.case_number}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Jurisdiction</p>
                      <p className="text-white">{order.jurisdiction}</p>
                    </div>
                    {order.court_division && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Court/Division</p>
                        <p className="text-white">{order.court_division}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Parties */}
              {parties.length > 0 && (
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="border-b border-gray-800">
                    <CardTitle className="text-lg flex items-center gap-2 text-white">
                      <User className="h-5 w-5 text-gray-500" />
                      Parties
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {parties.map((party, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 rounded-xl bg-gray-800 border border-gray-700"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700">
                            <User className="h-5 w-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">{party.party_name}</p>
                            <p className="text-sm text-gray-400">{party.party_role}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Statement of Facts */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-800">
                  <CardTitle className="text-lg text-white">Statement of Facts</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{order.statement_of_facts}</p>
                </CardContent>
              </Card>

              {/* Procedural History */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-800">
                  <CardTitle className="text-lg text-white">Procedural History</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{order.procedural_history}</p>
                </CardContent>
              </Card>

              {/* Drafting Instructions */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-800 bg-orange-500/5">
                  <CardTitle className="text-lg flex items-center gap-2 text-white">
                    <FileText className="h-5 w-5 text-orange-400" />
                    Drafting Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{order.instructions}</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-800">
                  <CardTitle className="text-lg flex items-center gap-2 text-white">
                    <Paperclip className="h-5 w-5 text-gray-500" />
                    Uploaded Documents
                  </CardTitle>
                  <CardDescription className="text-gray-500">Documents provided with this order</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  {documents.length > 0 ? (
                    <div className="space-y-3">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between rounded-xl bg-gray-800 border border-gray-700 p-4"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-700">
                              <FileText className="h-6 w-6 text-gray-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-white">{doc.file_name}</p>
                              <p className="text-sm text-gray-500">
                                {doc.document_type} • {formatDateShort(doc.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 text-gray-700" />
                      <p>No documents uploaded</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Update */}
          <StatusUpdateForm orderId={order.id} currentStatus={order.status} />

          {/* Order Summary */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-800">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-gray-500" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Base Price</span>
                <span className="font-semibold text-white tabular-nums">{formatCurrency(order.base_price)}</span>
              </div>
              {order.rush_surcharge > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Rush Surcharge</span>
                  <span className="font-semibold text-orange-400 tabular-nums">+{formatCurrency(order.rush_surcharge)}</span>
                </div>
              )}
              <Separator className="bg-gray-800" />
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">Total</span>
                <span className="font-bold text-white text-xl tabular-nums">
                  {formatCurrency(order.total_price)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-800">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-500" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-400">Submitted</span>
                <span className="text-white">{formatDate(order.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Expected Delivery</span>
                <span className="text-white">{formatDate(order.expected_delivery)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Filing Deadline</span>
                <span className="text-orange-400 font-medium">{formatDate(order.filing_deadline)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Turnaround</span>
                <span className="text-white capitalize">{order.turnaround.replace('_', ' ')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Client Info */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-800">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Building className="h-5 w-5 text-gray-500" />
                Client Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Name</p>
                <p className="text-white">{client?.full_name || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</p>
                <p className="text-white">{client?.email || 'Not provided'}</p>
              </div>
              {client?.phone && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone</p>
                  <p className="text-white">{client.phone}</p>
                </div>
              )}
              {client?.bar_number && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Bar Number</p>
                  <p className="text-white">{client.bar_number}</p>
                </div>
              )}
              {client?.firm_name && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Firm</p>
                  <p className="text-white">{client.firm_name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
