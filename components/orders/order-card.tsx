import Link from 'next/link'
import { Order } from '@/types'
import { getMotionById } from '@/config/motion-types'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { OrderStatusBadge } from './order-status-badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Calendar, FileText } from 'lucide-react'

interface OrderCardProps {
  order: Order
}

export function OrderCard({ order }: OrderCardProps) {
  const motion = getMotionById(order.motion_type)

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-500">{order.order_number}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <h3 className="mt-1 font-semibold text-navy">
              {motion?.name || order.motion_type}
            </h3>
          </div>
          <span className="font-semibold text-navy">
            {formatCurrency(order.total_price)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-400" />
            <span>{order.case_caption}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span>Filed by: {formatDateShort(order.filing_deadline)}</span>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/orders/${order.id}`}>
              View Details
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
