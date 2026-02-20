'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  RefreshCw,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Calendar,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { formatDate } from '@/lib/utils'
import { DocumentCard } from '@/components/dashboard/document-card'
import { QualityBadge } from '@/components/dashboard/quality-badge'

// ============================================================================
// TYPES
// ============================================================================

interface OrderDocument {
  id: string
  type: string
  filename: string
  downloadUrl: string
  fileType: string
  fileSizeBytes: number
  pageCount?: number
  wordCount?: number
}

interface OrderInfo {
  id: string
  orderNumber: string
  motionType: string
  jurisdiction: string
  status: string
  statusVersion: number
  filingDeadline?: string
  qualityScore?: number
  revisionCount?: number
  caseCaption?: string
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function ReviewPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-6 w-48 mb-6" />
      <Skeleton className="h-10 w-96 mb-2" />
      <Skeleton className="h-5 w-64 mb-8" />
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ReviewPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const orderId = params.id

  // State
  const [order, setOrder] = useState<OrderInfo | null>(null)
  const [documents, setDocuments] = useState<OrderDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Approve flow state
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [approveSuccess, setApproveSuccess] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

  // Request changes flow state
  const [showChangesDialog, setShowChangesDialog] = useState(false)
  const [changeNotes, setChangeNotes] = useState('')
  const [isRequestingChanges, setIsRequestingChanges] = useState(false)
  const [changesSuccess, setChangesSuccess] = useState(false)
  const [changesError, setChangesError] = useState<string | null>(null)

  // Fetch order data
  const fetchOrderData = useCallback(async () => {
    if (!orderId) return

    setIsLoading(true)
    setError(null)

    try {
      // Fetch documents from our API
      const docsResponse = await fetch(`/api/orders/${orderId}/documents`)
      if (!docsResponse.ok) {
        const data = await docsResponse.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Failed to load order data')
      }

      const docsData = await docsResponse.json() as {
        orderId: string
        orderNumber: string
        orderStatus: string
        statusVersion: number
        documents: OrderDocument[]
      }

      // Fetch full order details
      const orderResponse = await fetch(`/api/orders/${orderId}`)
      let orderDetail: Record<string, unknown> = {}
      if (orderResponse.ok) {
        orderDetail = (await orderResponse.json()) as Record<string, unknown>
      }

      const orderData = (orderDetail.order ?? orderDetail) as Record<string, unknown>

      setOrder({
        id: orderId,
        orderNumber: docsData.orderNumber ?? (orderData.order_number as string) ?? '',
        motionType: (orderData.motion_type as string) ?? '',
        jurisdiction: (orderData.jurisdiction as string) ?? '',
        status: docsData.orderStatus ?? (orderData.status as string) ?? '',
        statusVersion: docsData.statusVersion ?? (orderData.status_version as number) ?? 0,
        filingDeadline: (orderData.filing_deadline as string) ?? undefined,
        qualityScore: (orderData.quality_score as number) ?? undefined,
        revisionCount: (orderData.revision_count as number) ?? 0,
        caseCaption: (orderData.case_caption as string) ?? undefined,
      })

      setDocuments(docsData.documents ?? [])

      // If the order isn't in a reviewable state, redirect to order detail
      const reviewableStatuses = ['AWAITING_APPROVAL', 'DRAFT_DELIVERED', 'PENDING_REVIEW']
      if (
        docsData.orderStatus &&
        !reviewableStatuses.includes(docsData.orderStatus) &&
        docsData.orderStatus !== 'COMPLETED'
      ) {
        router.replace(`/orders/${orderId}`)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order data')
    } finally {
      setIsLoading(false)
    }
  }, [orderId, router])

  useEffect(() => {
    fetchOrderData()
  }, [fetchOrderData])

  // Approve handler
  const handleApprove = async () => {
    setIsApproving(true)
    setApproveError(null)

    try {
      const response = await fetch(`/api/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_version: order?.statusVersion ?? 0 }),
      })

      const result = await response.json() as {
        error?: string
        success?: boolean
        downloadUrls?: Record<string, string>
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve order')
      }

      setApproveSuccess(true)
      setShowApproveDialog(false)

      // Trigger download of all documents
      if (result.downloadUrls) {
        for (const url of Object.values(result.downloadUrls)) {
          const a = document.createElement('a')
          a.href = url
          a.download = ''
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
      }
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsApproving(false)
    }
  }

  // Request changes handler
  const handleRequestChanges = async () => {
    if (changeNotes.trim().length === 0) {
      setChangesError('Please describe the changes needed.')
      return
    }

    setIsRequestingChanges(true)
    setChangesError(null)

    try {
      const response = await fetch(`/api/orders/${orderId}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: changeNotes.trim(),
          status_version: order?.statusVersion ?? 0,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Failed to submit revision request')
      }

      setChangesSuccess(true)
      setShowChangesDialog(false)
      setChangeNotes('')
    } catch (err) {
      setChangesError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setIsRequestingChanges(false)
    }
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  if (isLoading) {
    return <ReviewPageSkeleton />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Error Loading Review Page</AlertTitle>
          <AlertDescription className="text-red-700">
            {error}
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchOrderData}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try Again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!order) return null

  const isCompleted = order.status === 'completed' || order.status === 'COMPLETED'
  const isAlreadyApproved = isCompleted || approveSuccess
  const isInRevision = changesSuccess || order.status === 'revision_requested' || order.status === 'REVISION_REQ'

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back navigation */}
      <Link
        href={`/orders/${orderId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Order
      </Link>

      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">{order.orderNumber}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy tracking-tight sm:text-3xl">
          {order.motionType
            ? order.motionType
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')
            : 'Motion'}
        </h1>
        {order.jurisdiction && (
          <p className="mt-1 text-sm text-gray-500">{order.jurisdiction}</p>
        )}

        {/* Status badge */}
        <div className="mt-3">
          {isAlreadyApproved && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Approved
            </div>
          )}
          {isInRevision && !isAlreadyApproved && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
              <RefreshCw className="h-4 w-4" />
              Revision Requested
            </div>
          )}
          {!isAlreadyApproved && !isInRevision && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <FileText className="h-4 w-4" />
              Ready for Your Review
            </div>
          )}
        </div>
      </div>

      {/* Filing package */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-navy mb-4">Your Filing Package</h2>
        {documents.length > 0 ? (
          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                type={doc.type}
                filename={doc.filename}
                pageCount={doc.pageCount}
                wordCount={doc.wordCount}
                fileSizeBytes={doc.fileSizeBytes}
                status="final"
                downloadUrlDocx={
                  doc.fileType === 'docx' ||
                  doc.fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    ? doc.downloadUrl
                    : undefined
                }
                downloadUrlPdf={
                  doc.fileType === 'pdf' || doc.fileType === 'application/pdf'
                    ? doc.downloadUrl
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
                <FileText className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500">No documents available yet.</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Quality assessment */}
      {order.qualityScore != null && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-navy mb-3">Quality Assessment</h2>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <QualityBadge score={order.qualityScore} size="lg" />
              <p className="text-sm text-gray-600">Judge simulation quality score</p>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Action buttons */}
      {!isAlreadyApproved && !isInRevision && (
        <section className="mb-8">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => setShowApproveDialog(true)}
              className="flex-1 gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              Approve &amp; Download All
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setShowChangesDialog(true)}
              className="flex-1 gap-2"
            >
              <RefreshCw className="h-5 w-5" />
              Request Changes
            </Button>
          </div>
        </section>
      )}

      {/* Already approved — download links */}
      {isAlreadyApproved && documents.length > 0 && (
        <section className="mb-8">
          <Alert className="border-emerald-200 bg-emerald-50">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <AlertTitle className="text-emerald-800">Order Approved</AlertTitle>
            <AlertDescription className="text-emerald-700">
              Your documents have been approved. You can download them from the cards above.
            </AlertDescription>
          </Alert>
        </section>
      )}

      {/* Revision submitted */}
      {isInRevision && !isAlreadyApproved && (
        <section className="mb-8">
          <Alert className="border-blue-200 bg-blue-50">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800">Revision Requested</AlertTitle>
            <AlertDescription className="text-blue-700">
              Your revision request has been submitted. We will notify you when the updated
              documents are ready for review.
            </AlertDescription>
          </Alert>
        </section>
      )}

      {/* Filing deadline */}
      {order.filingDeadline && !isAlreadyApproved && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <Calendar className="h-4 w-4 flex-shrink-0" />
          <span>
            Filing Deadline: <strong>{formatDate(order.filingDeadline)}</strong>
          </span>
        </div>
      )}

      {/* Revision info */}
      <p className="mb-6 text-xs text-gray-500">
        One revision is included with your order. Additional revisions are billed separately.
      </p>

      {/* Disclaimer */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500 leading-relaxed">
        <strong>Disclaimer:</strong> All documents must be reviewed by the hiring attorney before
        filing with any court. Motion Granted provides legal document drafting services and is not
        a law firm. The hiring attorney is solely responsible for reviewing, approving, and filing
        all documents prepared by Motion Granted.
      </div>

      {/* ================================================================ */}
      {/* APPROVE CONFIRMATION DIALOG                                      */}
      {/* ================================================================ */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve &amp; Download Documents</AlertDialogTitle>
            <AlertDialogDescription>
              By approving, you confirm you have reviewed all documents in the filing package. One
              revision is included if changes are needed later.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {approveError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{approveError}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleApprove()
              }}
              disabled={isApproving}
              className="gap-2"
            >
              {isApproving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Approve &amp; Download
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================ */}
      {/* REQUEST CHANGES DIALOG                                           */}
      {/* ================================================================ */}
      <Dialog open={showChangesDialog} onOpenChange={setShowChangesDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-teal" />
              Request Changes
            </DialogTitle>
            <DialogDescription>
              Please describe the changes needed. Be as specific as possible, including page
              numbers, sections, or specific text.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Textarea
              placeholder="Describe the changes you need. For example: 'On page 3, paragraph 2, the date should be March 15, not March 14.' or 'Please strengthen the argument regarding prescription in Section III.'"
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              className="min-h-[150px] resize-none"
              disabled={isRequestingChanges}
            />
            <p className="text-xs text-gray-500">{changeNotes.length}/5000 characters</p>

            {changesError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700">{changesError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowChangesDialog(false)}
              disabled={isRequestingChanges}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequestChanges}
              disabled={isRequestingChanges || changeNotes.trim().length === 0}
              className="gap-2"
            >
              {isRequestingChanges ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Revision Request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
