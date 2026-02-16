'use client'

/**
 * HOLD Resolution Panel — SP-22 Tasks 15-19
 *
 * Admin component for managing HOLD orders.
 * Shows hold_reason badge, time-in-hold, and 3 resolution options:
 *   - Resume (continue workflow at appropriate phase)
 *   - Cancel (with refund)
 *   - Escalate (mark for further review)
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, Clock, Play, XCircle, ArrowUpCircle } from 'lucide-react'

interface HoldResolutionPanelProps {
  orderId: string
  holdReason: string | null
  holdTriggeredAt: string | null
  holdEscalated: boolean
  holdReminderSent: boolean
}

const HOLD_REASON_LABELS: Record<string, { label: string; color: string; description: string }> = {
  evidence_gap: {
    label: 'Evidence Gap',
    color: 'bg-red-100 text-red-800 border-red-200',
    description: 'Critical evidence missing — attorney needs to provide additional documents.',
  },
  tier_reclassification: {
    label: 'Tier Reclassification',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Motion complexity requires tier upgrade — attorney needs to approve price change.',
  },
  revision_stall: {
    label: 'Revision Stall',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    description: 'Revision loop stalled — quality not improving across iterations.',
  },
  citation_critical_failure: {
    label: 'Citation Failure',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Critical citation verification failures — legal authority cannot be confirmed.',
  },
}

function getTimeOnHold(triggeredAt: string | null): string {
  if (!triggeredAt) return 'Unknown'
  const hours = (Date.now() - new Date(triggeredAt).getTime()) / (1000 * 60 * 60)
  if (hours < 1) return 'Less than 1 hour'
  if (hours < 24) return `${Math.floor(hours)} hours`
  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)
  return `${days} day${days !== 1 ? 's' : ''}, ${remainingHours}h`
}

function getHoldStage(triggeredAt: string | null, escalated: boolean, reminderSent: boolean): string {
  if (!triggeredAt) return 'Unknown'
  const hours = (Date.now() - new Date(triggeredAt).getTime()) / (1000 * 60 * 60)
  if (hours >= 168) return '7d+ (Terminal)'
  if (hours >= 72 || escalated) return '72h+ (Escalated)'
  if (hours >= 24 || reminderSent) return '24h+ (Reminder Sent)'
  return 'Initial (< 24h)'
}

export function HoldResolutionPanel({
  orderId,
  holdReason,
  holdTriggeredAt,
  holdEscalated,
  holdReminderSent,
}: HoldResolutionPanelProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [notes, setNotes] = useState('')

  const reasonInfo = HOLD_REASON_LABELS[holdReason ?? ''] ?? {
    label: holdReason ?? 'Unknown',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    description: 'Hold reason not recognized.',
  }

  const timeOnHold = getTimeOnHold(holdTriggeredAt)
  const holdStage = getHoldStage(holdTriggeredAt, holdEscalated, holdReminderSent)

  async function handleAction(action: 'RESUME' | 'CANCEL' | 'ESCALATE') {
    setIsLoading(action)
    setResult(null)

    try {
      const res = await fetch('/api/admin/hold-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action, notes }),
      })

      const data = await res.json()
      setResult({
        success: data.success ?? false,
        message: data.message ?? data.error ?? 'Unknown result',
      })

      if (data.success) {
        // Reload to show updated state
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch {
      setResult({ success: false, message: 'Network error. Please try again.' })
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <CardTitle className="text-lg text-red-900">HOLD Checkpoint</CardTitle>
        </div>
        <CardDescription className="text-red-700">
          This order is paused and requires action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hold Reason Badge */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Reason:</span>
          <Badge variant="outline" className={reasonInfo.color}>
            {reasonInfo.label}
          </Badge>
        </div>
        <p className="text-sm text-gray-600">{reasonInfo.description}</p>

        {/* Status Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">Time on Hold:</span>
            <span className="font-medium">{timeOnHold}</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">Stage:</span>
            <span className="font-medium">{holdStage}</span>
          </div>
        </div>

        {/* Notes Input */}
        <div>
          <label htmlFor="hold-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Resolution Notes (optional)
          </label>
          <textarea
            id="hold-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="Add notes about the resolution..."
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => handleAction('RESUME')}
            disabled={isLoading !== null}
            className="bg-green-600 hover:bg-green-700 text-white"
            size="sm"
          >
            <Play className="h-4 w-4 mr-1" />
            {isLoading === 'RESUME' ? 'Resuming...' : 'Resume'}
          </Button>
          <Button
            onClick={() => handleAction('CANCEL')}
            disabled={isLoading !== null}
            variant="destructive"
            size="sm"
          >
            <XCircle className="h-4 w-4 mr-1" />
            {isLoading === 'CANCEL' ? 'Cancelling...' : 'Cancel + Refund'}
          </Button>
          <Button
            onClick={() => handleAction('ESCALATE')}
            disabled={isLoading !== null}
            variant="outline"
            size="sm"
          >
            <ArrowUpCircle className="h-4 w-4 mr-1" />
            {isLoading === 'ESCALATE' ? 'Escalating...' : 'Escalate'}
          </Button>
        </div>

        {/* Result Message */}
        {result && (
          <div className={`p-3 rounded-md text-sm ${
            result.success
              ? 'bg-green-100 text-green-800 border border-green-200'
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {result.message}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
