import Link from 'next/link'
import {
  Clock,
  Loader2,
  AlertTriangle,
  CheckCircle,
  FileCheck,
  RefreshCw,
  XCircle,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateShort } from '@/lib/utils'
import { TOTAL_WORKFLOW_PHASES } from '@/types/workflow'

type CardStatus =
  | 'submitted'
  | 'processing'
  | 'held'
  | 'review'
  | 'in_revision'
  | 'completed'
  | 'cancelled'
  | 'pending_conflict_review'

interface OrderStatusCardProps {
  orderId: string
  orderNumber: string
  motionType: string
  jurisdiction: string
  status: CardStatus
  currentPhase?: number
  filingDeadline?: string
  completedAt?: string
  className?: string
}

const STATUS_CONFIG: Record<
  CardStatus,
  {
    label: string
    icon: typeof Clock
    dotColor: string
    bgColor: string
    textColor: string
    borderColor: string
    animate?: boolean
  }
> = {
  submitted: {
    label: 'Order Received',
    icon: Clock,
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  processing: {
    label: 'In Progress',
    icon: Loader2,
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    animate: true,
  },
  held: {
    label: 'On Hold \u2014 Action Required',
    icon: AlertTriangle,
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
  },
  review: {
    label: 'Ready for Review',
    icon: FileCheck,
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
  },
  in_revision: {
    label: 'Revision In Progress',
    icon: RefreshCw,
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
  },
  cancelled: {
    label: 'Cancelled \u2014 Refund Issued',
    icon: XCircle,
    dotColor: 'bg-gray-400',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-600',
    borderColor: 'border-gray-200',
  },
  pending_conflict_review: {
    label: 'Under Review',
    icon: AlertTriangle,
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
  },
}

export function OrderStatusCard({
  orderId,
  orderNumber,
  motionType,
  jurisdiction,
  status,
  currentPhase,
  filingDeadline,
  completedAt,
  className,
}: OrderStatusCardProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <Card className={cn('transition-shadow hover:shadow-md overflow-hidden', className)}>
      {/* Status accent bar */}
      <div className={cn('h-1', config.dotColor)} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-500">{orderNumber}</p>
            <h3 className="mt-0.5 truncate text-sm font-semibold text-navy">
              {motionType}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">{jurisdiction}</p>
          </div>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              config.bgColor,
              config.textColor,
              config.borderColor
            )}
          >
            <Icon
              className={cn(
                'h-3.5 w-3.5',
                config.animate && 'animate-spin'
              )}
            />
            <span className="hidden sm:inline">{config.label}</span>
          </div>
        </div>

        {/* Conflict review notice */}
        {status === 'pending_conflict_review' && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3">
            <p className="text-amber-800 text-xs font-medium">Your order is under review.</p>
            <p className="text-amber-700 text-xs mt-1">
              You have not been charged. We will notify you when review is complete.
            </p>
          </div>
        )}

        {/* Phase progress for processing status */}
        {status === 'processing' && currentPhase != null && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Phase {currentPhase} of {TOTAL_WORKFLOW_PHASES}</span>
              <span>
                {Math.round(((currentPhase - 1) / TOTAL_WORKFLOW_PHASES) * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-teal transition-all duration-500"
                style={{
                  width: `${Math.round(((currentPhase - 1) / TOTAL_WORKFLOW_PHASES) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Filing deadline */}
        {filingDeadline && status !== 'completed' && status !== 'cancelled' && (
          <p className="mt-3 text-xs text-gray-500">
            Filing deadline: {formatDateShort(filingDeadline)}
          </p>
        )}

        {/* Completed date */}
        {completedAt && status === 'completed' && (
          <p className="mt-3 text-xs text-gray-500">
            Completed {formatDateShort(completedAt)}
          </p>
        )}

        {/* Action buttons */}
        {(status === 'review' || status === 'held' || status === 'completed') && (
          <div className="mt-3">
            {status === 'review' && (
              <Button size="sm" asChild className="w-full gap-2">
                <Link href={`/orders/${orderId}/review`}>
                  Review Documents
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            {status === 'held' && (
              <Button size="sm" variant="outline" asChild className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800">
                <Link href={`/orders/${orderId}`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Respond to Hold
                </Link>
              </Button>
            )}
            {status === 'completed' && (
              <Button size="sm" variant="outline" asChild className="w-full gap-2">
                <Link href={`/orders/${orderId}`}>
                  View Documents
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
