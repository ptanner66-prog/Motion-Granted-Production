import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils'
import { formatMotionType } from '@/config/motion-types'
import { StatusUpdateForm } from '@/components/admin/status-update-form'
import { UploadDeliverableButton } from '@/components/admin/upload-deliverable-button'
import { DownloadAllButton } from '@/components/admin/download-all-button'
import { DocumentDownloadButton } from '@/components/documents/document-download-button'
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
  FileCheck,
  Upload,
  Bot,
  MessageSquare,
  CheckCircle,
} from 'lucide-react'
import type { OrderStatus } from '@/types'
import { ClaudeChat } from '@/components/admin/claude-chat'
import { AdminRevisionRequests } from '@/components/admin/admin-revision-requests'
import { QuickApproveButton } from '@/components/admin/quick-approve-button'
import { RetryGenerationButton } from '@/components/admin/retry-generation-button'
import { MotionReview } from '@/components/admin/motion-review'

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

  // Split documents into uploads and deliverables
  const clientUploads = documents.filter(doc => doc.document_type !== 'deliverable')
  const deliverables = documents.filter(doc => doc.document_type === 'deliverable')

  const client = order.profiles

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/orders"
          className="inline-flex items-center text-sm text-gray-500 hover:text-orange-400 transition-colors mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
                {order.order_number}
              </h1>
              <OrderStatusBadge status={order.status as OrderStatus} />
            </div>
            <p className="text-lg text-gray-600">{formatMotionType(order.motion_type)}</p>
            <p className="text-sm text-gray-400 mt-1">
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
          <Tabs defaultValue={['pending_review'].includes(order.status) ? 'review' : ['revision_requested', 'in_progress'].includes(order.status) ? 'chat' : 'details'}>
            <TabsList className="bg-gray-100 p-1 border border-gray-200">
              <TabsTrigger
                value="review"
                className="data-[state=active]:bg-green-100 data-[state=active]:text-green-700 text-gray-500 rounded-lg px-4 gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Review Motion
                {order.status === 'pending_review' && (
                  <span className="ml-1 rounded-full bg-green-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                    Ready
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 text-gray-500 rounded-lg px-4 gap-2"
              >
                <Bot className="h-4 w-4" />
                Claude Chat
              </TabsTrigger>
              <TabsTrigger
                value="details"
                className="data-[state=active]:bg-gray-200 data-[state=active]:text-navy text-gray-500 rounded-lg px-4 gap-2"
              >
                <FileText className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:bg-gray-200 data-[state=active]:text-navy text-gray-500 rounded-lg px-4 gap-2"
              >
                <Paperclip className="h-4 w-4" />
                Documents
                <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-semibold text-gray-600 ml-1">
                  {documents.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="review" className="mt-6">
              <MotionReview orderId={order.id} orderNumber={order.order_number} orderStatus={order.status} />
            </TabsContent>

            <TabsContent value="chat" className="mt-6">
              <ClaudeChat orderId={order.id} orderNumber={order.order_number} />
            </TabsContent>

            <TabsContent value="details" className="mt-6 space-y-6">
              {/* Case Information */}
              <Card className="bg-white border-gray-200">
                <CardHeader className="border-b border-gray-200">
                  <CardTitle className="text-lg flex items-center gap-2 text-navy">
                    <Scale className="h-5 w-5 text-gray-400" />
                    Case Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Case Caption</p>
                      <p className="text-navy">{order.case_caption}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Case Number</p>
                      <p className="text-navy font-mono">{order.case_number}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Jurisdiction</p>
                      <p className="text-navy">{order.jurisdiction}</p>
                    </div>
                    {order.court_division && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Court/Division</p>
                        <p className="text-navy">{order.court_division}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Parties */}
              {parties.length > 0 && (
                <Card className="bg-white border-gray-200">
                  <CardHeader className="border-b border-gray-200">
                    <CardTitle className="text-lg flex items-center gap-2 text-navy">
                      <User className="h-5 w-5 text-gray-400" />
                      Parties
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {parties.map((party, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 rounded-xl bg-gray-100 border border-gray-200"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                            <User className="h-5 w-5 text-gray-500" />
                          </div>
                          <div>
                            <p className="font-semibold text-navy">{party.party_name}</p>
                            <p className="text-sm text-gray-500">{party.party_role}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Statement of Facts */}
              <Card className="bg-white border-gray-200 overflow-hidden">
                <CardHeader className="border-b border-gray-200">
                  <CardTitle className="text-lg text-navy">Statement of Facts</CardTitle>
                </CardHeader>
                <CardContent className="p-6 overflow-hidden">
                  <p className="text-gray-600 whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed">{order.statement_of_facts}</p>
                </CardContent>
              </Card>

              {/* Procedural History */}
              <Card className="bg-white border-gray-200 overflow-hidden">
                <CardHeader className="border-b border-gray-200">
                  <CardTitle className="text-lg text-navy">Procedural History</CardTitle>
                </CardHeader>
                <CardContent className="p-6 overflow-hidden">
                  <p className="text-gray-600 whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed">{order.procedural_history}</p>
                </CardContent>
              </Card>

              {/* Drafting Instructions */}
              <Card className="bg-white border-gray-200 overflow-hidden">
                <CardHeader className="border-b border-gray-200">
                  <CardTitle className="text-lg flex items-center gap-2 text-navy">
                    <FileText className="h-5 w-5 text-gray-400" />
                    Drafting Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 overflow-hidden">
                  <p className="text-gray-600 whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed">{order.instructions}</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-6 space-y-6">
              {/* Deliverables Section */}
              <Card className="bg-white border-gray-200">
                <CardHeader className="border-b border-gray-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2 text-navy">
                        <FileCheck className="h-5 w-5 text-teal" />
                        Deliverables
                      </CardTitle>
                      <CardDescription className="text-gray-400 mt-1.5">Completed drafts ready for client</CardDescription>
                    </div>
                    <UploadDeliverableButton orderId={order.id} />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {deliverables.length > 0 ? (
                    <div className="space-y-3">
                      {deliverables.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between rounded-xl bg-teal/5 border border-teal/20 p-4 hover:border-teal/40 hover:bg-teal/10 transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal/20">
                              <FileCheck className="h-6 w-6 text-teal" />
                            </div>
                            <div>
                              <p className="font-semibold text-navy">{doc.file_name}</p>
                              <p className="text-sm text-gray-400">
                                Delivered • {formatDateShort(doc.created_at)}
                              </p>
                            </div>
                          </div>
                          <DocumentDownloadButton
                            filePath={doc.file_url}
                            fileName={doc.file_name}
                            variant="outline"
                            className="border-teal/30 hover:bg-teal hover:text-white hover:border-teal"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Upload className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>No deliverables uploaded yet</p>
                      <p className="text-sm mt-1">Use the button above to upload completed drafts</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Client Uploads Section */}
              <Card className="bg-white border-gray-200">
                <CardHeader className="border-b border-gray-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2 text-navy">
                        <Paperclip className="h-5 w-5 text-gray-400" />
                        Client Uploads
                      </CardTitle>
                      <CardDescription className="text-gray-400 mt-1.5">Supporting documents provided by client</CardDescription>
                    </div>
                    <DownloadAllButton orderId={order.id} orderNumber={order.order_number} documentCount={documents.length} />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {clientUploads.length > 0 ? (
                    <div className="space-y-3">
                      {clientUploads.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between rounded-xl bg-gray-100 border border-gray-200 p-4 hover:border-teal/30 hover:bg-gray-50 transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-200">
                              <FileText className="h-6 w-6 text-gray-500" />
                            </div>
                            <div>
                              <p className="font-semibold text-navy">{doc.file_name}</p>
                              <p className="text-sm text-gray-400">
                                {doc.document_type} • {formatDateShort(doc.created_at)}
                              </p>
                            </div>
                          </div>
                          <DocumentDownloadButton
                            filePath={doc.file_url}
                            fileName={doc.file_name}
                            variant="outline"
                            className="border-gray-300 hover:bg-teal hover:text-white hover:border-teal"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>No documents uploaded by client</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Approve - shown when draft needs review */}
          {order.status === 'pending_review' && (
            <QuickApproveButton
              orderId={order.id}
              orderNumber={order.order_number}
            />
          )}

          {/* Retry Generation - shown when generation failed */}
          {(order.status === 'generation_failed' || order.status === 'blocked') && (
            <RetryGenerationButton
              orderId={order.id}
              orderNumber={order.order_number}
              errorMessage={order.generation_error}
            />
          )}

          {/* Revision Requests - shown when client requested revision */}
          {(order.status === 'revision_requested' || order.status === 'draft_delivered' || order.status === 'revision_delivered') && (
            <AdminRevisionRequests orderId={order.id} />
          )}

          {/* Status Update */}
          <StatusUpdateForm orderId={order.id} currentStatus={order.status} />

          {/* Order Summary */}
          <Card className="bg-white border-gray-200">
            <CardHeader className="border-b border-gray-200">
              <CardTitle className="text-lg text-navy flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-gray-400" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Base Price</span>
                <span className="font-semibold text-navy tabular-nums">{formatCurrency(order.base_price)}</span>
              </div>
              {order.rush_surcharge > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Rush Surcharge</span>
                  <span className="font-semibold text-orange-400 tabular-nums">+{formatCurrency(order.rush_surcharge)}</span>
                </div>
              )}
              <Separator className="bg-gray-100" />
              <div className="flex justify-between items-center">
                <span className="font-bold text-navy">Total</span>
                <span className="font-bold text-navy text-xl tabular-nums">
                  {formatCurrency(order.total_price)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="bg-white border-gray-200">
            <CardHeader className="border-b border-gray-200">
              <CardTitle className="text-lg text-navy flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Submitted</span>
                <span className="text-navy">{formatDate(order.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Expected Delivery</span>
                <span className="text-navy">{formatDate(order.expected_delivery)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Filing Deadline</span>
                <span className="text-orange-400 font-medium">{formatDate(order.filing_deadline)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Turnaround</span>
                <span className="text-navy capitalize">{order.turnaround.replace('_', ' ')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Client Info */}
          <Card className="bg-white border-gray-200">
            <CardHeader className="border-b border-gray-200">
              <CardTitle className="text-lg text-navy flex items-center gap-2">
                <Building className="h-5 w-5 text-gray-400" />
                Client Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Name</p>
                <p className="text-navy">{client?.full_name || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Email</p>
                <p className="text-navy">{client?.email || 'Not provided'}</p>
              </div>
              {client?.phone && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Phone</p>
                  <p className="text-navy">{client.phone}</p>
                </div>
              )}
              {client?.bar_number && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Bar Number</p>
                  <p className="text-navy">{client.bar_number}</p>
                </div>
              )}
              {client?.firm_name && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Firm</p>
                  <p className="text-navy">{client.firm_name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
