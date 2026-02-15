'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  CheckCircle,
  RefreshCw,
  XCircle,
  AlertCircle,
  Download,
  Loader2,
} from 'lucide-react'

interface CP3ActionsProps {
  orderId: string
  statusVersion: number
  amountPaid: number
}

export function CP3Actions({ orderId, statusVersion, amountPaid }: CP3ActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showChangesForm, setShowChangesForm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [changeNotes, setChangeNotes] = useState('')

  const refundAmount = amountPaid > 0 ? (amountPaid / 100 * 0.5).toFixed(2) : '0.00'

  const handleApprove = async () => {
    setLoading('approve')
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_version: statusVersion }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError('This order was modified by another action. Please refresh and try again.')
          return
        }
        throw new Error(data.error || 'Failed to approve')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve order')
    } finally {
      setLoading(null)
    }
  }

  const handleRequestChanges = async () => {
    if (!changeNotes.trim()) {
      setError('Please describe the changes you need.')
      return
    }
    setLoading('changes')
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: changeNotes.trim(), status_version: statusVersion }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError('This order was modified by another action. Please refresh and try again.')
          return
        }
        throw new Error(data.error || 'Failed to request changes')
      }
      setShowChangesForm(false)
      setChangeNotes('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request changes')
    } finally {
      setLoading(null)
    }
  }

  const handleCancel = async () => {
    setLoading('cancel')
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_version: statusVersion }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError('This order was modified by another action. Please refresh and try again.')
          return
        }
        throw new Error(data.error || 'Failed to cancel order')
      }
      setShowCancelConfirm(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order')
    } finally {
      setLoading(null)
    }
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden ring-2 ring-emerald-200">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-transparent border-b border-emerald-100">
        <CardTitle className="text-lg flex items-center gap-2 text-emerald-800">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          Your Draft is Ready for Review
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <p className="text-gray-600 text-sm">
          Review your filing package and choose an action below. Approving will finalize the order and provide download access.
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          {/* Approve & Download */}
          <Button
            size="lg"
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleApprove}
            disabled={loading !== null}
          >
            {loading === 'approve' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Approve &amp; Download
          </Button>

          {/* Request Changes */}
          {!showChangesForm ? (
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => setShowChangesForm(true)}
              disabled={loading !== null}
            >
              <RefreshCw className="h-4 w-4" />
              Request Changes
            </Button>
          ) : (
            <div className="space-y-3 border border-amber-200 rounded-xl p-4 bg-amber-50/50">
              <p className="text-sm font-medium text-amber-800">
                Describe the changes you need (this is free rework):
              </p>
              <Textarea
                placeholder="Please describe the specific changes needed..."
                value={changeNotes}
                onChange={(e) => setChangeNotes((e.target as HTMLTextAreaElement).value)}
                className="min-h-[100px]"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleRequestChanges}
                  disabled={loading !== null || !changeNotes.trim()}
                >
                  {loading === 'changes' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Submit Changes
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowChangesForm(false); setChangeNotes('') }}
                  disabled={loading !== null}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Cancel Order */}
          <button
            className="text-sm text-red-500 hover:text-red-700 underline text-center mt-2 disabled:opacity-50"
            onClick={() => setShowCancelConfirm(true)}
            disabled={loading !== null}
          >
            Cancel Order
          </button>
        </div>

        {/* Cancel Confirmation Modal */}
        <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <XCircle className="h-5 w-5" />
                Cancel Order?
              </DialogTitle>
              <DialogDescription>
                Are you sure? A 50% refund (${refundAmount}) will be processed within 5-10 business days.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCancelConfirm(false)}
                disabled={loading !== null}
              >
                No, go back
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={loading !== null}
                className="gap-2"
              >
                {loading === 'cancel' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Yes, cancel and refund
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
