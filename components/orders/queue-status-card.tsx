'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Loader2, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { getQueueStatusMessage, estimateCompletion } from '@/lib/queue-status'

interface QueueStatusCardProps {
  orderId: string
  status: string
  queuePosition: number | null
  generationStartedAt?: string | null
}

export function QueueStatusCard({
  orderId,
  status,
  queuePosition,
  generationStartedAt,
}: QueueStatusCardProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const statusMessage = getQueueStatusMessage(status, queuePosition)

  // Timer for in-progress orders
  useEffect(() => {
    if (status !== 'in_progress' || !generationStartedAt) {
      return
    }

    const startTime = new Date(generationStartedAt).getTime()
    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)

    return () => clearInterval(interval)
  }, [status, generationStartedAt])

  // Don't show for completed/delivered statuses
  if (['draft_delivered', 'completed', 'revision_delivered', 'cancelled'].includes(status)) {
    return null
  }

  const isProcessing = status === 'in_progress'
  const isFailed = status === 'generation_failed'
  const isPending = status === 'pending_review'

  // Progress calculation for visual feedback
  const getProgressValue = () => {
    if (isPending) return 100
    if (isProcessing) {
      // Estimate ~2 minutes (120 seconds) for generation
      return Math.min(95, (elapsedSeconds / 120) * 100)
    }
    if (queuePosition) {
      // Show some initial progress even when in queue
      return Math.max(5, 30 - queuePosition * 5)
    }
    return 10
  }

  return (
    <Card className={`border-0 shadow-sm overflow-hidden ${
      isFailed ? 'bg-red-50 border-red-200' :
      isProcessing ? 'bg-amber-50 border-amber-200' :
      isPending ? 'bg-emerald-50 border-emerald-200' :
      'bg-blue-50 border-blue-200'
    }`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-xl ${
            isFailed ? 'bg-red-100' :
            isProcessing ? 'bg-amber-100' :
            isPending ? 'bg-emerald-100' :
            'bg-blue-100'
          }`}>
            {isFailed ? (
              <AlertCircle className="h-5 w-5 text-red-600" />
            ) : isProcessing ? (
              <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
            ) : isPending ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Clock className="h-5 w-5 text-blue-600" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold ${
              isFailed ? 'text-red-700' :
              isProcessing ? 'text-amber-700' :
              isPending ? 'text-emerald-700' :
              'text-blue-700'
            }`}>
              {statusMessage.title}
            </h3>
            <p className={`text-sm mt-1 ${
              isFailed ? 'text-red-600' :
              isProcessing ? 'text-amber-600' :
              isPending ? 'text-emerald-600' :
              'text-blue-600'
            }`}>
              {statusMessage.description}
            </p>

            {/* Processing timer */}
            {isProcessing && elapsedSeconds > 0 && (
              <div className="mt-2 text-xs text-amber-500">
                Processing for {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
              </div>
            )}

            {/* Progress bar */}
            {statusMessage.showProgress && (
              <div className="mt-3">
                <Progress
                  value={getProgressValue()}
                  className={`h-1.5 ${
                    isProcessing ? '[&>div]:bg-amber-500' :
                    isPending ? '[&>div]:bg-emerald-500' :
                    '[&>div]:bg-blue-500'
                  }`}
                />
              </div>
            )}

            {/* Estimated completion for queued orders */}
            {queuePosition && !isProcessing && !isPending && (
              <div className="mt-2 text-xs text-blue-500">
                Estimated: {estimateCompletion(queuePosition)}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
