import { ORDER_STATUSES, type OrderStatus } from '@/config/motion-types'
import { cn } from '@/lib/utils'

interface OrderStatusBadgeProps {
  status: OrderStatus
  className?: string
  size?: 'sm' | 'default'
  showDot?: boolean
}

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  blue: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-700',
    dot: 'bg-blue-500'
  },
  yellow: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500'
  },
  purple: {
    bg: 'bg-violet-50 border-violet-200',
    text: 'text-violet-700',
    dot: 'bg-violet-500'
  },
  indigo: {
    bg: 'bg-indigo-50 border-indigo-200',
    text: 'text-indigo-700',
    dot: 'bg-indigo-500'
  },
  green: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500'
  },
  orange: {
    bg: 'bg-orange-50 border-orange-200',
    text: 'text-orange-700',
    dot: 'bg-orange-500'
  },
  emerald: {
    bg: 'bg-teal-50 border-teal-200',
    text: 'text-teal-700',
    dot: 'bg-teal'
  },
  red: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500'
  },
  gray: {
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-600',
    dot: 'bg-gray-400'
  },
}

export function OrderStatusBadge({
  status,
  className,
  size = 'default',
  showDot = true
}: OrderStatusBadgeProps) {
  const statusConfig = ORDER_STATUSES[status]
  const styles = statusStyles[statusConfig.color] || statusStyles.gray

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        styles.bg,
        styles.text,
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            'rounded-full animate-pulse-soft',
            styles.dot,
            size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'
          )}
        />
      )}
      {statusConfig.label}
    </span>
  )
}
