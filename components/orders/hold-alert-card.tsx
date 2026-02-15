'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertCircle,
  Clock,
  Send,
  XCircle,
  Loader2,
  Pause,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface HoldAlertCardProps {
  orderId: string
  holdReason: string | null
  holdExpiresAt: string | null
  statusVersion: number
  amountPaid: number
}

export function HoldAlertCard({
  orderId,
  holdReason,
  holdExpiresAt,
  statusVersion,
  amountPaid,
}: HoldAlertCardProps) {
  const router = useRouter()
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  const refundAmount = amountPaid > 0 ? (amountPaid / 100).toFixed(2) : '0.00'

  const handleSubmitResponse = async () => {
    if (!response.trim()) {
      setError('Please provide a response.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/hold-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: response.trim(), status_version: statusVersion }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit response')
      }
      setResponse('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    setCancelLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_version: statusVersion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel')
      setShowCancelConfirm(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order')
    } finally {
      setCancelLoading(false)
    }
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden ring-2 ring-amber-300 bg-gradient-to-br from-amber-50 to-amber-50/50">
      <CardHeader className="bg-gradient-to-r from-amber-100/80 to-transparent border-b border-amber-200">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
          <Pause className="h-5 w-5 text-amber-600" />
          We need more information to proceed
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* Hold reason */}
        {holdReason && (
          <div className="p-4 rounded-lg bg-white border border-amber-200">
            <p className="text-sm font-medium text-amber-800 mb-1">Concern:</p>
            <p className="text-gray-700">{holdReason}</p>
          </div>
        )}

        {/* Timeout display */}
        {holdExpiresAt && (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <Clock className="h-4 w-4" />
            <span>
              Response required by: <strong>{formatDate(holdExpiresAt)}</strong>
            </span>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Response form */}
        <div className="space-y-3">
          <Textarea
            placeholder="Provide your response or additional information here..."
            value={response}
            onChange={(e) => setResponse((e.target as HTMLTextAreaElement).value)}
            className="min-h-[120px]"
          />

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white flex-1"
              onClick={handleSubmitResponse}
              disabled={loading || !response.trim()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Response
            </Button>

            <button
              className="text-sm text-red-500 hover:text-red-700 underline px-4 py-2"
              onClick={() => setShowCancelConfirm(true)}
            >
              Cancel order (100% refund)
            </button>
          </div>
        </div>

        {/* Cancel confirmation */}
        <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <XCircle className="h-5 w-5" />
                Cancel Order?
              </DialogTitle>
              <DialogDescription>
                Since your order is on hold, you will receive a full refund of ${refundAmount}.
                This will be processed within 5-10 business days.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
                No, go back
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelLoading}
                className="gap-2"
              >
                {cancelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Yes, cancel and refund
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
