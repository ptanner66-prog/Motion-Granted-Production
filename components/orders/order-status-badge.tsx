import { ORDER_STATUSES, type OrderStatus } from '@/config/motion-types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface OrderStatusBadgeProps {
  status: OrderStatus
  className?: string
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const statusConfig = ORDER_STATUSES[status]

  const variantMap: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'purple' | 'orange' | 'emerald'> = {
    blue: 'info',
    yellow: 'warning',
    purple: 'purple',
    indigo: 'info',
    green: 'success',
    orange: 'orange',
    emerald: 'emerald',
    red: 'destructive',
    gray: 'secondary',
  }

  return (
    <Badge
      variant={variantMap[statusConfig.color] || 'secondary'}
      className={cn(className)}
    >
      {statusConfig.label}
    </Badge>
  )
}
