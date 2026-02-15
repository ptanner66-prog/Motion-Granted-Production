import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/config/motion-types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { StatusTimeline } from '@/components/orders/status-timeline'
import { CP3Actions } from '@/components/orders/cp3-actions'
import { DeliverablesCard } from '@/components/orders/deliverables-card'
import { HoldAlertCard } from '@/components/orders/hold-alert-card'
import { PostApprovalRevision } from '@/components/orders/post-approval-revision'
import { CancellationCard } from '@/components/orders/cancellation-card'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatDateShort, formatRelativeTime, mapToDisplayStatus } from '@/lib/utils'
import { formatMotionType } from '@/config/motion-types'
import {
  ArrowLeft,
  Calendar,
  FileText,
  Clock,
  User,
  Scale,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  MessageSquare,
  Hash,
  MapPin,
} from 'lucide-react'

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

export const metadata: Metadata = {
  title: 'Order Details',
  description: 'View order details.',
}

// Calculate progress based on status
function getOrderProgress(status: string) {
  // Progress milestones: revision_requested is NOT forward progress
  const progressMap: Record<string, number> = {
    submitted: 15,
    under_review: 25,
    assigned: 35,
    in_progress: 50,
    in_review: 65,
    draft_delivered: 80,
    revision_requested: 70, // Slightly back from draft_delivered
    revision_delivered: 85,
    completed: 100,
    on_hold: 20,
    cancelled: 0,
    pending_conflict_review: 10,
  }
  return `$${order.total_price.toFixed(2)}`
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('client_id', user.id)
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
    .select('id, file_name, file_url, document_type, created_at')
    .eq('order_id', id)
    .order('created_at', { ascending: true })
  const documents: Document[] = documentsData || []

  const deliverables = documents.filter(doc => doc.document_type === 'deliverable' || doc.document_type === 'draft')
  const clientUploads = documents.filter(doc => doc.document_type !== 'deliverable' && doc.document_type !== 'draft')

  // Fetch activity log from automation_logs
  const { data: activityLogs } = await supabase
    .from('automation_logs')
    .select('action_type, action_details, created_at')
    .eq('order_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Map to 7-status display
  const displayStatus = mapToDisplayStatus(order.status)
  const statusVersion = order.status_version || 1
  const amountPaid = order.amount_paid || 0

  // Party string for header
  const partyString = parties.map(p => p.party_name).join(' v. ')

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/orders"
          className="inline-flex items-center text-sm text-gray-500 hover:text-teal transition-colors mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
              {formatMotionType(order.motion_type)}
            </h1>
            <p className="text-gray-600 mt-1">
              {partyString || order.case_caption}
            </p>
            {order.jurisdiction && (
              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {order.jurisdiction}
                {order.court_division && ` — ${order.court_division}`}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="font-mono text-sm text-gray-400">
                {order.order_number}
              </span>
              <OrderStatusBadge status={displayStatus as OrderStatus} />
            </div>
          </div>
        </div>
      </div>

        {/* Progress bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-gray-600">Order Progress</span>
            <span className="text-teal font-semibold">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal to-teal-dark rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Queue Status Card - Show for orders in queue or processing */}
        {['submitted', 'under_review', 'in_progress', 'pending_review', 'generation_failed'].includes(order.status) && (
          <div className="mt-6">
            <QueueStatusCard
              orderId={order.id}
              status={order.status}
              queuePosition={order.queue_position}
              generationStartedAt={order.generation_started_at}
            />
          </div>
        )}

        {/* CC-R3-07: Conflict Review Notice */}
        {order.status === 'pending_conflict_review' && (
          <Card className="mt-6 border-amber-200 bg-amber-50">
            <CardContent className="flex items-start gap-4 py-5">
              <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900">Order Under Review</h3>
                <p className="text-sm text-amber-800 mt-1">
                  This order is under review for a potential scheduling conflict. You will be notified within 5 business days.
                </p>
                {order.created_at && (
                  <p className="text-xs text-amber-600 mt-2">
                    Expected resolution by: {formatDate(new Date(new Date(order.created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* HOLD_PENDING alert (above main content) */}
      {displayStatus === 'HOLD_PENDING' && (
        <div className="mb-6">
          <HoldAlertCard
            orderId={order.id}
            holdReason={order.hold_reason}
            holdExpiresAt={order.hold_expires_at}
            statusVersion={statusVersion}
            amountPaid={amountPaid}
          />
        </div>
      )}

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* CP3 Approval Actions (only for AWAITING_APPROVAL) */}
          {displayStatus === 'AWAITING_APPROVAL' && (
            <CP3Actions
              orderId={order.id}
              statusVersion={statusVersion}
              amountPaid={amountPaid}
            />
          )}

          {/* Deliverables Card */}
          <DeliverablesCard
            displayStatus={displayStatus}
            deliverables={deliverables}
            orderId={order.id}
            motionType={order.motion_type}
          />

          {/* Post-Approval Revision (only for COMPLETED) */}
          {displayStatus === 'COMPLETED' && (
            <PostApprovalRevision
              orderId={order.id}
              revisionCount={order.revision_count || 0}
              statusVersion={statusVersion}
            />
          )}

          {/* Cancellation details card */}
          {displayStatus === 'CANCELLED' && (
            <CancellationCard
              cancelReason={order.cancel_reason}
              cancelledAt={order.cancelled_at}
              refundAmount={order.refund_amount}
              refundStatus={order.refund_status}
              amountPaid={amountPaid}
            />
          )}

          {/* Case Information */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <Scale className="h-5 w-5 text-gray-500" />
                Case Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Case Caption</p>
                  <p className="text-navy font-medium">{order.case_caption}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Case Number</p>
                  <p className="text-navy font-medium font-mono">{order.case_number}</p>
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
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-gray-500" />
                  Parties
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  {parties.map((party, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
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
          {order.statement_of_facts && (
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                <CardTitle className="text-lg">Statement of Facts</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{order.statement_of_facts}</p>
              </CardContent>
            </Card>
          )}

          {/* Drafting Instructions */}
          {order.instructions && (
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-teal/5 to-transparent border-b border-teal/10">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-teal" />
                  Drafting Instructions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{order.instructions}</p>
              </CardContent>
            </Card>
          )}

          {/* Client uploads */}
          {clientUploads.length > 0 && (
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  Your Uploaded Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {clientUploads.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-4 rounded-xl border border-gray-200 p-4"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                        <FileText className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-navy">{doc.file_name}</p>
                        <p className="text-xs text-gray-500">
                          {doc.document_type} &middot; {formatDateShort(doc.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Price Box */}
          <Card className="border-0 shadow-sm overflow-hidden bg-navy text-white">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-white/60 uppercase tracking-wider font-medium">Total</p>
              <p className="text-3xl font-bold mt-1 text-gold tabular-nums">
                {displayPrice(order)}
              </p>
              {order.turnaround !== 'standard' && (
                <p className="text-xs text-white/50 mt-1">
                  Includes {order.turnaround === 'rush_72' ? '72hr rush' : '48hr rush'} surcharge
                </p>
              )}
            </CardContent>
          </Card>

          {/* Order Details */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
              <CardTitle className="text-lg">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Order ID</span>
                <span className="font-mono text-sm text-navy">{order.order_number}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Motion Type</span>
                <span className="text-sm text-navy font-medium">{formatMotionType(order.motion_type)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Turnaround</span>
                <span className="text-sm text-navy">
                  {order.turnaround === 'standard' ? 'Standard' : order.turnaround === 'rush_72' ? 'Rush 72hr' : 'Rush 48hr'}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Base Price</span>
                <span className="text-sm tabular-nums">${order.base_price.toFixed(2)}</span>
              </div>
              {order.rush_surcharge > 0 && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Rush Surcharge</span>
                    <span className="text-sm text-orange-600 tabular-nums">+${order.rush_surcharge.toFixed(2)}</span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Submitted</span>
                <span className="text-sm text-navy">{formatDateShort(order.created_at)}</span>
              </div>
              {order.delivered_at && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Delivered</span>
                    <span className="text-sm text-navy">{formatDateShort(order.delivered_at)}</span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Filing Deadline</span>
                <span className="text-sm text-orange-600 font-medium">{formatDateShort(order.filing_deadline)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
              <CardTitle className="text-lg">Activity Log</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative space-y-4">
                <div className="absolute left-3 top-4 bottom-4 w-0.5 bg-gray-200" />

                {/* Order created event */}
                <div className="relative flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-white z-10">
                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-navy">Order placed</p>
                    <p className="text-xs text-gray-500">{formatRelativeTime(order.created_at)}</p>
                  </div>
                </div>

                {/* Activity entries */}
                {activityLogs?.map((log, i) => {
                  const actionLabels: Record<string, string> = {
                    checkpoint_approved: 'Draft approved by admin',
                    checkpoint_changes_requested: 'Changes requested by admin',
                    workflow_cancelled: 'Workflow cancelled',
                    revision_requested: 'Revision requested',
                    revision_completed: 'Revision completed',
                    order_approved: 'Order approved by attorney',
                    order_cancelled: 'Order cancelled',
                    hold_response_submitted: 'Hold response submitted',
                    cp3_changes_requested: 'CP3 changes requested',
                    generation_started: 'Drafting started',
                    generation_completed: 'Drafting completed',
                    delivery_notification: 'Delivery notification sent',
                  }
                  return (
                    <div key={i} className="relative flex items-start gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 ring-2 ring-white z-10">
                        <Clock className="h-3 w-3 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-navy">
                          {actionLabels[log.action_type] || log.action_type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-gray-500">{formatRelativeTime(log.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card className="border-0 shadow-sm bg-gradient-to-br from-navy to-navy-light text-white overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <span className="font-semibold">Need Help?</span>
              </div>
              <p className="text-sm text-white/70 mb-4">
                Questions about this order or need to make changes?
              </p>
              <a
                href="mailto:support@motiongranted.com"
                className="inline-flex items-center gap-2 text-sm font-medium text-teal hover:text-teal-light transition-colors"
              >
                Contact Support
                <ChevronRight className="h-4 w-4" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
