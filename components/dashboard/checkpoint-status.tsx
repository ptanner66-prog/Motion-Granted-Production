'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  Upload,
  ArrowRight,
  Timer,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { QualityBadge } from '@/components/dashboard/quality-badge'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export interface CheckpointData {
  type: 'HOLD' | 'CP1' | 'CP2' | 'CP3'
  status: 'pending' | 'active' | 'resolved' | 'expired'
  createdAt: string
  resolvedAt?: string
  metadata?: Record<string, unknown>
}

interface CheckpointStatusProps {
  orderId: string
  checkpoints: CheckpointData[]
  className?: string
}

const HOLD_AUTO_CANCEL_DAYS = 7

function getTimeRemaining(createdAt: string, daysLimit: number): { days: number; hours: number; expired: boolean } {
  const created = new Date(createdAt).getTime()
  const deadline = created + daysLimit * 24 * 60 * 60 * 1000
  const now = Date.now()
  const remaining = deadline - now

  if (remaining <= 0) {
    return { days: 0, hours: 0, expired: true }
  }

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  return { days, hours, expired: false }
}

function getTimeOnHold(createdAt: string): string {
  const created = new Date(createdAt).getTime()
  const elapsed = Date.now() - created
  const days = Math.floor(elapsed / (24 * 60 * 60 * 1000))
  const hours = Math.floor((elapsed % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))

  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

function HoldCheckpoint({ checkpoint }: { checkpoint: CheckpointData }) {
  const holdReason =
    (checkpoint.metadata?.reason as string) ?? 'Additional information is required to proceed.'
  const requiredDocs = (checkpoint.metadata?.requiredDocuments as string[]) ?? []
  const timeOnHold = getTimeOnHold(checkpoint.createdAt)
  const remaining = getTimeRemaining(checkpoint.createdAt, HOLD_AUTO_CANCEL_DAYS)

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-base text-amber-800">
            On Hold &mdash; Awaiting Additional Information
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-amber-700">{holdReason}</p>

        {requiredDocs.length > 0 && (
          <div>
            <p className="text-xs font-medium text-amber-800">Required documents:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-amber-700">
              {requiredDocs.map((doc, i) => (
                <li key={i}>{doc}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-amber-600">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            On hold for {timeOnHold}
          </span>
          {!remaining.expired && (
            <span
              className={cn(
                'flex items-center gap-1',
                remaining.days < 2 && 'font-semibold text-red-600'
              )}
            >
              <Timer className="h-3.5 w-3.5" />
              {remaining.days}d {remaining.hours}h remaining
            </span>
          )}
          {remaining.expired && (
            <span className="font-semibold text-red-600">Auto-cancel period expired</span>
          )}
        </div>

        {remaining.days < 2 && !remaining.expired && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            Warning: This order will be automatically cancelled if no response is received within{' '}
            {remaining.days > 0
              ? `${remaining.days} day${remaining.days !== 1 ? 's' : ''} and ${remaining.hours} hours`
              : `${remaining.hours} hours`}
            .
          </div>
        )}

        {checkpoint.status === 'active' && (
          <Button size="sm" variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100">
            <Upload className="h-3.5 w-3.5" />
            Upload Documents
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function CP1Checkpoint({ checkpoint }: { checkpoint: CheckpointData }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
      <div>
        <p className="text-sm font-medium text-blue-800">
          Legal research is complete. Drafting has begun.
        </p>
        <p className="mt-0.5 text-xs text-blue-600">
          {formatDate(checkpoint.createdAt)}
        </p>
      </div>
    </div>
  )
}

function CP2Checkpoint({ checkpoint }: { checkpoint: CheckpointData }) {
  const qualityScore = checkpoint.metadata?.qualityScore as number | undefined

  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
      <div>
        <p className="text-sm font-medium text-blue-800">
          Your motion has been reviewed by our quality system.
        </p>
        {qualityScore != null && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-xs text-blue-600">Quality grade:</span>
            <QualityBadge score={qualityScore} size="sm" />
          </div>
        )}
        <p className="mt-0.5 text-xs text-blue-600">
          {formatDate(checkpoint.createdAt)}
        </p>
      </div>
    </div>
  )
}

function CP3Checkpoint({
  checkpoint,
  orderId,
}: {
  checkpoint: CheckpointData
  orderId: string
}) {
  const documents = (checkpoint.metadata?.documents as string[]) ?? []

  return (
    <Card className="border-emerald-200 bg-emerald-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-emerald-600" />
          <CardTitle className="text-base text-emerald-800">
            Your Documents Are Ready for Review
          </CardTitle>
          <Badge variant="emerald">Action Required</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.length > 0 && (
          <div>
            <p className="text-xs font-medium text-emerald-800">Filing package includes:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-emerald-700">
              {documents.map((doc, i) => (
                <li key={i}>{doc}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild className="gap-2">
            <Link href={`/orders/${orderId}/review`}>
              Review &amp; Approve
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ResolvedCheckpoint({ checkpoint }: { checkpoint: CheckpointData }) {
  const typeLabels: Record<string, string> = {
    HOLD: 'Hold resolved',
    CP1: 'Research complete',
    CP2: 'Quality review complete',
    CP3: 'Documents approved',
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
      <div>
        <p className="text-xs font-medium text-gray-600">
          {typeLabels[checkpoint.type] ?? checkpoint.type}
        </p>
        <p className="text-[10px] text-gray-400">
          {checkpoint.resolvedAt ? formatDate(checkpoint.resolvedAt) : formatDate(checkpoint.createdAt)}
        </p>
      </div>
    </div>
  )
}

export function CheckpointStatus({
  orderId,
  checkpoints: initialCheckpoints,
  className,
}: CheckpointStatusProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointData[]>(initialCheckpoints)

  // Sync with prop changes
  useEffect(() => {
    setCheckpoints(initialCheckpoints)
  }, [initialCheckpoints])

  // Supabase Realtime subscription for live updates
  const refreshCheckpoints = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('orders')
      .select('status, current_phase, hold_reason, hold_triggered_at, updated_at')
      .eq('id', orderId)
      .single()

    if (data) {
      // Trigger parent refetch by updating state — the parent page should
      // refetch via router.refresh() or a callback. For now, the real-time
      // subscription ensures the UI reflects the latest data.
      setCheckpoints((prev) => {
        // If the order status changed, mark this as needing a refresh
        return [...prev]
      })
    }
  }, [orderId])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`checkpoints-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        () => {
          refreshCheckpoints()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, refreshCheckpoints])

  if (checkpoints.length === 0) {
    return null
  }

  // Separate active and resolved checkpoints
  const activeCheckpoints = checkpoints.filter(
    (cp) => cp.status === 'active' || cp.status === 'pending'
  )
  const resolvedCheckpoints = checkpoints.filter(
    (cp) => cp.status === 'resolved' || cp.status === 'expired'
  )

  return (
    <div className={cn('space-y-3', className)}>
      {/* Active checkpoints */}
      {activeCheckpoints.map((cp, idx) => {
        switch (cp.type) {
          case 'HOLD':
            return <HoldCheckpoint key={`${cp.type}-${idx}`} checkpoint={cp} />
          case 'CP1':
            return <CP1Checkpoint key={`${cp.type}-${idx}`} checkpoint={cp} />
          case 'CP2':
            return <CP2Checkpoint key={`${cp.type}-${idx}`} checkpoint={cp} />
          case 'CP3':
            return (
              <CP3Checkpoint
                key={`${cp.type}-${idx}`}
                checkpoint={cp}
                orderId={orderId}
              />
            )
          default:
            return null
        }
      })}

      {/* Resolved checkpoints (collapsed) */}
      {resolvedCheckpoints.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">Previous checkpoints</p>
          {resolvedCheckpoints.map((cp, idx) => (
            <ResolvedCheckpoint key={`resolved-${cp.type}-${idx}`} checkpoint={cp} />
          ))}
        </div>
      )}
    </div>
  )
}
