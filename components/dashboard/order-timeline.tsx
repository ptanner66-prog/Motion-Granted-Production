'use client'

import { useState } from 'react'
import {
  CheckCircle,
  Circle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  XCircle,
  SkipForward,
  Pause,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateShort } from '@/lib/utils'
import { QualityBadge } from '@/components/dashboard/quality-badge'

// Customer-facing phase display names (simplified from technical names)
const PHASE_DISPLAY: Record<
  string,
  { name: string; description: string }
> = {
  I: {
    name: 'Order Intake & Classification',
    description: 'Your order is being reviewed and classified.',
  },
  II: {
    name: 'Conflict Check',
    description: 'Verifying no conflicts of interest exist.',
  },
  III: {
    name: 'Attorney Review',
    description: 'Evidence strategy and issue identification. A hold may occur if additional information is needed.',
  },
  IV: {
    name: 'Legal Research Planning',
    description: 'Case law and authority research is underway.',
  },
  V: {
    name: 'Citation Search & Retrieval',
    description: 'Locating and verifying legal citations.',
  },
  'V.1': {
    name: 'Citation Verification',
    description: 'Every citation is verified against official court records.',
  },
  VI: {
    name: 'Motion Drafting',
    description: 'Your motion is being drafted with opposition anticipation.',
  },
  VII: {
    name: 'Quality Review',
    description: 'Judge simulation grades the motion for quality.',
  },
  'VII.1': {
    name: 'Citation Cross-Validation',
    description: 'Post-revision citations are being re-verified.',
  },
  VIII: {
    name: 'Document Formatting',
    description: 'Revisions and formatting for court standards.',
  },
  'VIII.5': {
    name: 'Format Validation',
    description: 'Caption and formatting consistency verified across all documents.',
  },
  IX: {
    name: 'Filing Package Assembly',
    description: 'Declarations, proposed order, and proof of service assembled.',
  },
  'IX.1': {
    name: 'Final Quality Check',
    description: 'Separate statement verification (MSJ/MSA motions).',
  },
  X: {
    name: 'Delivery',
    description: 'Your documents are ready for review.',
  },
}

const PHASE_ORDER = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII',
  'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X',
] as const

export interface TimelinePhase {
  phase: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped' | 'held'
  startedAt?: string
  completedAt?: string
  qualityScore?: number
  metadata?: Record<string, unknown>
}

interface OrderTimelineProps {
  orderId: string
  phases: TimelinePhase[]
  currentPhase?: string
  className?: string
}

const STATUS_ICON = {
  completed: CheckCircle,
  in_progress: Loader2,
  failed: XCircle,
  held: Pause,
  skipped: SkipForward,
  pending: Circle,
} as const

const STATUS_COLORS = {
  completed: 'text-emerald-500',
  in_progress: 'text-blue-500',
  failed: 'text-red-500',
  held: 'text-amber-500',
  skipped: 'text-gray-400',
  pending: 'text-gray-300',
} as const

const STATUS_LINE_COLORS = {
  completed: 'bg-emerald-500',
  in_progress: 'bg-blue-500',
  failed: 'bg-red-500',
  held: 'bg-amber-500',
  skipped: 'bg-gray-300',
  pending: 'bg-gray-200',
} as const

export function OrderTimeline({
  phases,
  currentPhase,
  className,
}: OrderTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Build a lookup from phase code to phase data
  const phaseMap = new Map(phases.map((p) => [p.phase, p]))

  // Determine which phases to show when collapsed (current + 2 before + 2 after)
  const currentIndex = currentPhase
    ? PHASE_ORDER.indexOf(currentPhase as typeof PHASE_ORDER[number])
    : -1

  const visiblePhases = isExpanded
    ? PHASE_ORDER
    : PHASE_ORDER.filter((_, idx) => {
        if (currentIndex < 0) return idx < 3
        return Math.abs(idx - currentIndex) <= 2
      })

  const completedCount = phases.filter((p) => p.status === 'completed').length

  return (
    <div className={cn('rounded-xl border border-gray-100 bg-white p-4 sm:p-6', className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-navy">Order Progress</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {completedCount} of {PHASE_ORDER.length} phases complete
          </p>
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-gray-400 transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      <div className="mt-4">
        <ol className="relative space-y-0">
          {visiblePhases.map((phaseCode, idx) => {
            const phaseData = phaseMap.get(phaseCode)
            const status = phaseData?.status ?? 'pending'
            const display = PHASE_DISPLAY[phaseCode]
            const isCurrent = phaseCode === currentPhase
            const isLast = idx === visiblePhases.length - 1

            const IconComponent = STATUS_ICON[status]
            const iconColor = STATUS_COLORS[status]
            const lineColor = STATUS_LINE_COLORS[status]

            return (
              <li key={phaseCode} className="relative flex gap-3 pb-6 last:pb-0">
                {/* Connector line */}
                {!isLast && (
                  <div
                    className={cn(
                      'absolute left-[11px] top-6 h-full w-0.5',
                      lineColor
                    )}
                    aria-hidden="true"
                  />
                )}

                {/* Icon */}
                <div className="relative z-10 flex-shrink-0">
                  <IconComponent
                    className={cn(
                      'h-[22px] w-[22px]',
                      iconColor,
                      status === 'in_progress' && 'animate-spin'
                    )}
                  />
                </div>

                {/* Content */}
                <div className={cn('min-w-0 flex-1', isCurrent && 'font-medium')}>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isCurrent ? 'text-navy' : 'text-gray-500'
                      )}
                    >
                      Phase {phaseCode}
                    </span>
                    {status === 'held' && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        On Hold
                      </span>
                    )}
                    {phaseData?.qualityScore != null && (
                      <QualityBadge score={phaseData.qualityScore} size="sm" />
                    )}
                  </div>
                  <p
                    className={cn(
                      'text-sm',
                      isCurrent ? 'text-navy' : 'text-gray-600'
                    )}
                  >
                    {display?.name ?? `Phase ${phaseCode}`}
                  </p>
                  {isExpanded && display?.description && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {display.description}
                    </p>
                  )}
                  {isExpanded && phaseData?.startedAt && (
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      {phaseData.completedAt
                        ? `Completed ${formatDateShort(phaseData.completedAt)}`
                        : `Started ${formatDateShort(phaseData.startedAt)}`}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {!isExpanded && PHASE_ORDER.length > visiblePhases.length && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="mt-2 text-xs font-medium text-teal hover:underline"
          >
            Show all {PHASE_ORDER.length} phases
          </button>
        )}
      </div>
    </div>
  )
}
