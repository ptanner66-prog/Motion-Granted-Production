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
import { HoldResolutionPanel } from '@/components/admin/hold-resolution-panel'
import { UploadDeliverableButton } from '@/components/admin/upload-deliverable-button'
import { DeleteDeliverableButton } from '@/components/admin/delete-deliverable-button'
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
import { MotionApprovalPanel } from '@/components/admin/motion-approval-panel'
import { RetryGenerationButton } from '@/components/admin/retry-generation-button'
import { RestartWorkflowButton } from '@/components/admin/restart-workflow-button'
import { MotionReview } from '@/components/admin/motion-review'
import { GenerateNowButton } from '@/components/admin/generate-now-button'
import { TierBadge } from '@/components/workflow/TierBadge'
import { PhaseProgressTracker } from '@/components/workflow/PhaseProgressTracker'
import { JudgeSimulationCard } from '@/components/workflow/JudgeSimulationCard'
import { CitationViewer } from '@/components/citations'
import type { WorkflowPhaseCode, PhaseStatus, JudgeSimulationResult } from '@/types/workflow'

const TIER_INT_TO_LETTER: Record<number, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' }

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
  is_deliverable: boolean
  created_at: string
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch independent data in parallel (order, parties, documents, workflow)
  const [orderResult, partiesResult, documentsResult, workflowResult] = await Promise.all([
    supabase
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
      .single(),
    supabase
      .from('parties')
      .select('party_name, party_role')
      .eq('order_id', id),
    supabase
      .from('documents')
      .select('*')
      .eq('order_id', id),
    supabase
      .from('order_workflows')
      .select('id, current_phase, status, revision_loop')
      .eq('order_id', id)
      .single(),
  ])

  const { data: order, error } = orderResult
  if (error || !order) {
    notFound()
  }

  const parties: Party[] = partiesResult.data || []
  const documents: Document[] = documentsResult.data || []
  const workflow = workflowResult.data

  // Split documents into uploads and deliverables (use is_deliverable flag, not document_type)
  const clientUploads = documents.filter(doc => !doc.is_deliverable)
  const deliverables = documents.filter(doc => doc.is_deliverable === true)

  const client = order.profiles

  // Fetch workflow-dependent data in parallel
  const [phaseExecutionsResult, judgeResultData] = await Promise.all([
    supabase
      .from('workflow_phase_executions')
      .select('phase_number, status')
      .eq('order_workflow_id', workflow?.id || ''),
    supabase
      .from('judge_simulation_results')
      .select('*')
      .eq('workflow_id', workflow?.id || '')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  const phaseExecutions = phaseExecutionsResult.data
  const judgeResult = judgeResultData.data

  // Build phase statuses map
  const phaseStatuses: Partial<Record<WorkflowPhaseCode, PhaseStatus>> = {}
  const phaseNumberToCode: Record<number, WorkflowPhaseCode> = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'V.1',
    7: 'VI', 8: 'VII', 9: 'VII.1', 10: 'VIII', 11: 'VIII.5',
    12: 'IX', 13: 'IX.1', 14: 'X'
  }

  phaseExecutions?.forEach((pe: { phase_number: number; status: string }) => {
    const code = phaseNumberToCode[pe.phase_number]
    if (code) {
      phaseStatuses[code] = pe.status as PhaseStatus
    }
  })

  const judgeSimulationResult: JudgeSimulationResult | undefined = judgeResult ? {
    grade: judgeResult.grade,
    numericGrade: judgeResult.numeric_grade || 0,
    passes: judgeResult.passes,
    strengths: judgeResult.strengths || [],
    weaknesses: judgeResult.weaknesses || [],
    specificFeedback: judgeResult.specific_feedback || '',
    revisionSuggestions: judgeResult.revision_suggestions || [],
    loopNumber: judgeResult.loop_number || 1,
  } : undefined

  // Determine current phase code
  const currentPhaseCode = workflow?.current_phase
    ? phaseNumberToCode[workflow.current_phase] || 'I'
    : 'I'

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
              {order.motion_tier != null && (
                <TierBadge tier={TIER_INT_TO_LETTER[order.motion_tier] || String(order.motion_tier)} showTooltip />
              )}
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

      {/* CC-R3-08: Conflict Review Admin Banner */}
      {order.status === 'pending_conflict_review' && (
        <Card className={`mb-6 ${
          order.filing_deadline && (new Date(order.filing_deadline).getTime() - Date.now()) < 14 * 24 * 60 * 60 * 1000
            ? 'border-red-300 bg-red-50'
            : 'border-amber-300 bg-amber-50'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Scale className={`h-6 w-6 flex-shrink-0 mt-0.5 ${
                order.filing_deadline && (new Date(order.filing_deadline).getTime() - Date.now()) < 14 * 24 * 60 * 60 * 1000
                  ? 'text-red-600'
                  : 'text-amber-600'
              }`} />
              <div className="flex-1">
                <h3 className={`font-semibold ${
                  order.filing_deadline && (new Date(order.filing_deadline).getTime() - Date.now()) < 14 * 24 * 60 * 60 * 1000
                    ? 'text-red-900'
                    : 'text-amber-900'
                }`}>
                  Conflict Review Required
                  {order.filing_deadline && (new Date(order.filing_deadline).getTime() - Date.now()) < 14 * 24 * 60 * 60 * 1000 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-200 text-red-800">
                      DEADLINE {'<'} 14 DAYS
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-700 mt-1">
                  This order was flagged for a potential case number conflict during checkout. Review and resolve before proceeding.
                </p>
                {order.filing_deadline && (
                  <p className="text-sm mt-2 font-medium text-gray-600">
                    Filing deadline: {formatDate(order.filing_deadline)}
                    {' '}({Math.ceil((new Date(order.filing_deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000))} days away)
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Auto-cancels on: {formatDate(new Date(new Date(order.created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workflow Progress Tracker */}
      {workflow && (
        <Card className="mb-6 bg-white border-gray-200">
          <CardContent className="p-6">
            <PhaseProgressTracker
              currentPhase={currentPhaseCode}
              phaseStatuses={phaseStatuses}
              revisionLoop={workflow.revision_loop || 0}
            />
          </CardContent>
        </Card>
      )}

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
              <TabsTrigger
                value="citations"
                className="data-[state=active]:bg-teal/10 data-[state=active]:text-teal text-gray-500 rounded-lg px-4 gap-2"
              >
                <Scale className="h-4 w-4" />
                Citations
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
                  <CardTitle className="text-lg text-navy">
                    Procedural History
                    <span className="text-gray-400 text-xs font-normal ml-2">Optional</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 overflow-hidden">
                  {order.procedural_history && order.procedural_history !== 'Not provided.' ? (
                    <p className="text-gray-600 whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed">{order.procedural_history}</p>
                  ) : (
                    <p className="text-gray-400 italic">Not provided — motion will rely on statement of facts above.</p>
                  )}
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
                          <div className="flex items-center gap-2">
                            <DocumentDownloadButton
                              filePath={doc.file_url}
                              fileName={doc.file_name}
                              variant="outline"
                              className="border-teal/30 hover:bg-teal hover:text-white hover:border-teal"
                            />
                            <DeleteDeliverableButton
                              orderId={order.id}
                              documentId={doc.id}
                              fileName={doc.file_name}
                            />
                          </div>
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

            <TabsContent value="citations" className="mt-6">
              <CitationViewer
                orderId={order.id}
                mode="admin"
                compact={false}
                showTitle={true}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Judge Simulation Results */}
          {workflow && (
            <JudgeSimulationCard
              result={judgeSimulationResult}
              isLoading={workflow.status === 'in_progress' && workflow.current_phase === 8}
            />
          )}

          {/* CP3 Approval Panel - shown when draft needs review */}
          {order.status === 'pending_review' && (
            <MotionApprovalPanel
              orderId={order.id}
              orderNumber={order.order_number}
              clientName={client?.full_name || undefined}
              hasDeliverable={deliverables.length > 0}
            />
          )}

          {/* Quick Approve - shown when draft needs review */}
          {order.status === 'pending_review' && (
            <QuickApproveButton
              orderId={order.id}
              orderNumber={order.order_number}
            />
          )}

          {/* Generate Now - ONLY shown for orders that need INITIAL generation or are in_progress */}
          {/* Don't show for generation_failed - use RetryGenerationButton instead */}
          {['submitted', 'paid', 'under_review', 'in_progress', 'processing', 'assigned'].includes(order.status) && (
            <GenerateNowButton
              orderId={order.id}
              orderNumber={order.order_number}
              orderStatus={order.status}
            />
          )}

          {/* Retry Generation - ONLY shown when generation failed */}
          {/* This replaces GenerateNowButton for failed orders */}
          {(order.status === 'generation_failed' || order.status === 'blocked') && (
            <RetryGenerationButton
              orderId={order.id}
              orderNumber={order.order_number}
              errorMessage={order.generation_error}
            />
          )}

          {/* Restart Workflow - Advanced option, only for stuck/failed workflows */}
          {/* Hidden by default inside the component based on status */}
          <RestartWorkflowButton
            orderId={order.id}
            orderNumber={order.order_number}
            orderStatus={order.status}
          />

          {/* Revision Requests - shown when client requested revision */}
          {(order.status === 'revision_requested' || order.status === 'draft_delivered' || order.status === 'revision_delivered') && (
            <AdminRevisionRequests orderId={order.id} />
          )}

          {/* SP-22: HOLD Resolution Panel — shown when order is on hold */}
          {(order.status === 'on_hold' || order.status === 'hold_pending') && (
            <HoldResolutionPanel
              orderId={order.id}
              holdReason={order.hold_reason}
              holdTriggeredAt={order.hold_triggered_at}
              holdEscalated={order.hold_escalated ?? false}
              holdReminderSent={order.hold_reminder_sent ?? false}
            />
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
                <span className={`font-medium ${
                  order.filing_deadline && (new Date(order.filing_deadline).getTime() - Date.now()) < 14 * 24 * 60 * 60 * 1000
                    ? 'text-red-600'
                    : 'text-orange-400'
                }`}>
                  {formatDate(order.filing_deadline)}
                  {order.filing_deadline && (new Date(order.filing_deadline).getTime() - Date.now()) < 14 * 24 * 60 * 60 * 1000 && (
                    <span className="ml-1 text-xs text-red-600 font-bold">URGENT</span>
                  )}
                </span>
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
