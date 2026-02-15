'use client'

import { cn } from '@/lib/utils'
import { CheckCircle, Circle, Clock, Pause, XCircle, RefreshCw } from 'lucide-react'

interface StatusTimelineProps {
  displayStatus: string
}

const STEPS = [
  { key: 'received', label: 'Order received' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'review', label: 'Ready for review' },
  { key: 'completed', label: 'Completed' },
]

function getActiveStep(status: string): number {
  switch (status) {
    case 'PAID': return 0
    case 'IN_PROGRESS': return 1
    case 'HOLD_PENDING': return 1
    case 'AWAITING_APPROVAL': return 2
    case 'REVISION_REQ': return 1
    case 'COMPLETED': return 3
    case 'CANCELLED': return -1
    default: return 0
  }
}

export function StatusTimeline({ displayStatus }: StatusTimelineProps) {
  const activeStep = getActiveStep(displayStatus)
  const isCancelled = displayStatus === 'CANCELLED'
  const isHold = displayStatus === 'HOLD_PENDING'
  const isRevision = displayStatus === 'REVISION_REQ'

  return (
    <div className="relative">
      {/* Cancelled overlay */}
      {isCancelled && (
        <div className="absolute inset-0 bg-gray-50/80 rounded-xl z-10 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 border border-red-200 text-red-700 font-semibold text-sm">
            <XCircle className="h-4 w-4" />
            Cancelled
          </span>
        </div>
      )}

      <div className={cn('flex items-center justify-between', isCancelled && 'opacity-30')}>
        {STEPS.map((step, index) => {
          const isCompleted = index < activeStep
          const isCurrent = index === activeStep
          const isHoldStep = isHold && index === 1
          const isRevisionStep = isRevision && index === 2

          return (
            <div key={step.key} className="flex-1 flex flex-col items-center relative">
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={cn(
                    'absolute top-4 right-1/2 left-auto w-full h-0.5 -translate-x-0',
                    isCompleted || isCurrent ? 'bg-teal' : 'bg-gray-200'
                  )}
                  style={{ right: '50%', left: index === 0 ? '50%' : undefined, width: '100%', transform: 'translateX(-50%)' }}
                />
              )}

              {/* Step circle */}
              <div className="relative z-10 flex items-center justify-center">
                {isCompleted ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-white">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                ) : isHoldStep ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 border-2 border-amber-400 animate-pulse">
                    <Pause className="h-4 w-4 text-amber-600" />
                  </div>
                ) : isRevisionStep ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 border-2 border-violet-400 animate-pulse">
                    <RefreshCw className="h-4 w-4 text-violet-600" />
                  </div>
                ) : isCurrent ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 border-2 border-blue-400">
                    <Clock className="h-4 w-4 text-blue-600 animate-pulse" />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 border-2 border-gray-200">
                    <Circle className="h-4 w-4 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Label */}
              <span className={cn(
                'mt-2 text-xs font-medium text-center',
                isCompleted ? 'text-teal' :
                isCurrent ? 'text-navy font-semibold' :
                isHoldStep ? 'text-amber-700 font-semibold' :
                isRevisionStep ? 'text-violet-700 font-semibold' :
                'text-gray-400'
              )}>
                {isRevisionStep ? 'Revision in progress' : step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
