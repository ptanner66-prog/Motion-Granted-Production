'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  X,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface HoldResponseFormProps {
  orderId: string
  orderNumber: string
  holdReason?: string
  requiredDocuments?: string[]
  holdTriggeredAt: string
  autoCancelDays?: number
  className?: string
}

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]

function formatTimeRemaining(holdTriggeredAt: string, autoCancelDays: number) {
  const created = new Date(holdTriggeredAt).getTime()
  const deadline = created + autoCancelDays * 24 * 60 * 60 * 1000
  const now = Date.now()
  const remaining = deadline - now

  if (remaining <= 0) return { text: 'Expired', urgent: true, expired: true }

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))

  const text =
    days > 0
      ? `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}`
      : `${hours} hour${hours !== 1 ? 's' : ''}`

  return { text, urgent: days < 2, expired: false }
}

export function HoldResponseForm({
  orderId,
  orderNumber,
  holdReason = 'Additional information is required to proceed with your motion.',
  requiredDocuments = [],
  holdTriggeredAt,
  autoCancelDays = 7,
  className,
}: HoldResponseFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(() =>
    formatTimeRemaining(holdTriggeredAt, autoCancelDays)
  )

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(holdTriggeredAt, autoCancelDays))
    }, 60_000)
    return () => clearInterval(interval)
  }, [holdTriggeredAt, autoCancelDays])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? [])
      const invalid = selected.filter(
        (f) => !ACCEPTED_TYPES.includes(f.type) || f.size > MAX_FILE_SIZE
      )

      if (invalid.length > 0) {
        setError(
          `Some files were rejected. Accepted formats: PDF, DOC, DOCX, JPG, PNG. Max size: 25MB.`
        )
        return
      }

      setFiles((prev) => [...prev, ...selected])
      setError(null)
      // Reset the input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    []
  )

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSubmit = async () => {
    if (files.length === 0 && additionalInfo.trim().length === 0) {
      setError('Please upload at least one document or provide additional information.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()

      // Upload files to Supabase Storage
      const uploadedPaths: string[] = []

      for (const file of files) {
        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `orders/${orderId}/hold-response/${timestamp}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('order-documents')
          .upload(path, file)

        if (uploadError) {
          throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
        }

        uploadedPaths.push(path)
      }

      // Submit the hold response via API
      const response = await fetch(`/api/orders/${orderId}/hold-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalInfo: additionalInfo.trim(),
          documentPaths: uploadedPaths,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(
          (data as { error?: string }).error || 'Failed to submit hold response'
        )
      }

      setSuccess(true)
      setTimeout(() => {
        router.refresh()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <Card className={cn('border-emerald-200 bg-emerald-50', className)}>
        <CardContent className="flex items-center gap-3 p-6">
          <CheckCircle className="h-6 w-6 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-800">Response Submitted</p>
            <p className="text-sm text-emerald-700">
              Your response for order {orderNumber} has been received. Processing will resume
              shortly.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('border-amber-200', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base text-navy">
              Hold Response Required
            </CardTitle>
          </div>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              timeRemaining.urgent
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700'
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {timeRemaining.expired ? 'Expired' : `${timeRemaining.text} remaining`}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hold reason */}
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">Reason for hold:</p>
          <p className="mt-1 text-sm text-amber-700">{holdReason}</p>
        </div>

        {/* Required documents */}
        {requiredDocuments.length > 0 && (
          <div>
            <p className="text-sm font-medium text-navy">Required Documents</p>
            <ul className="mt-1.5 space-y-1">
              {requiredDocuments.map((doc, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                  <FileText className="h-3.5 w-3.5 text-gray-400" />
                  {doc}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium text-navy">
            Upload Documents
          </label>
          <div
            className={cn(
              'mt-1.5 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
              'border-gray-200 hover:border-teal hover:bg-gray-50/50'
            )}
          >
            <Upload className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-600">
              Drag files here or{' '}
              <button
                type="button"
                className="font-medium text-teal hover:underline"
                onClick={() => fileInputRef.current?.click()}
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-gray-400">
              PDF, DOC, DOCX, JPG, PNG &mdash; Max 25MB per file
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept={ACCEPTED_TYPES.join(',')}
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* Selected files */}
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((file, idx) => (
              <li
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <span className="truncate text-sm text-gray-700">{file.name}</span>
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="ml-2 flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Additional information */}
        <div>
          <label
            htmlFor="hold-additional-info"
            className="block text-sm font-medium text-navy"
          >
            Additional Information
          </label>
          <Textarea
            id="hold-additional-info"
            placeholder="Provide any additional context or clarification that may help resolve this hold..."
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value)}
            className="mt-1.5 min-h-[100px] resize-none"
            disabled={isSubmitting}
          />
        </div>

        {/* Warning */}
        {timeRemaining.urgent && !timeRemaining.expired && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800">Urgent</AlertTitle>
            <AlertDescription className="text-red-700">
              Less than 48 hours remain. This order will be automatically cancelled if no
              response is received.
            </AlertDescription>
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800">Error</AlertTitle>
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            timeRemaining.expired ||
            (files.length === 0 && additionalInfo.trim().length === 0)
          }
          className="w-full gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Submit Response
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
