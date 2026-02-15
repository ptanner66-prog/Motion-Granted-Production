'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RefreshCw, AlertCircle, Loader2, Mail } from 'lucide-react'

interface PostApprovalRevisionProps {
  orderId: string
  revisionCount: number
  statusVersion: number
}

export function PostApprovalRevision({
  orderId,
  revisionCount,
  statusVersion,
}: PostApprovalRevisionProps) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Already used the 1 included revision
  if (revisionCount >= 1) {
    return (
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-gray-400" />
            Revisions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-gray-600 mb-3">
            Your included revision has been used ({revisionCount} of 1).
          </p>
          <p className="text-sm text-gray-500 mb-4">
            For additional revisions, please contact support.
          </p>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href="mailto:support@motiongranted.com?subject=Additional Revision Request">
              <Mail className="h-4 w-4" />
              Contact Support
            </a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const handleSubmit = async () => {
    if (!notes.trim() || notes.trim().length < 10) {
      setError('Please provide detailed revision instructions (at least 10 characters).')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revisionDetails: notes.trim(),
          notes: notes.trim(),
          status_version: statusVersion,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit revision request')
      }
      setSuccess(true)
      setTimeout(() => router.refresh(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit revision')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Card className="border-0 shadow-sm overflow-hidden ring-2 ring-emerald-200">
        <CardContent className="p-6 text-center">
          <RefreshCw className="h-8 w-8 mx-auto mb-3 text-emerald-600" />
          <p className="font-semibold text-emerald-800">Revision request submitted!</p>
          <p className="text-sm text-gray-500 mt-1">Your draft is being revised.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-violet-50 to-transparent border-b border-violet-100">
        <CardTitle className="text-lg flex items-center gap-2 text-violet-800">
          <RefreshCw className="h-5 w-5 text-violet-600" />
          Request a Revision
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-violet-700">1 of 1</span> revision remaining.
          Describe the changes needed to your approved draft.
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Textarea
          placeholder="Describe the specific changes needed. Include page numbers, sections, or text references..."
          value={notes}
          onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
          className="min-h-[120px]"
        />
        <p className="text-xs text-gray-400">
          Minimum 10 characters. This is separate from CP3 changes requests.
        </p>

        <Button
          className="w-full gap-2"
          onClick={handleSubmit}
          disabled={loading || notes.trim().length < 10}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Submit Revision Request
        </Button>
      </CardContent>
    </Card>
  )
}
