import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatMotionType } from '@/config/motion-types'
import { formatDateShort } from '@/lib/utils'
import {
  CheckCircle,
  ArrowRight,
  PlusCircle,
  Calendar,
  FileText,
  Clock,
  Hash,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Order Confirmed',
  description: 'Your order has been confirmed.',
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, motion_type, case_caption, total_price, amount_paid, expected_delivery, filing_deadline, created_at, turnaround, status')
    .eq('id', id)
    .eq('client_id', user.id)
    .single()

  if (error || !order) {
    notFound()
  }

  const displayPrice = order.amount_paid && order.amount_paid > 0
    ? `$${(order.amount_paid / 100).toFixed(2)}`
    : `$${order.total_price.toFixed(2)}`

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      {/* Success header */}
      <div className="text-center mb-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-4">
          <CheckCircle className="h-10 w-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
          Your order is confirmed!
        </h1>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          Payment received. We&apos;re getting started on your motion.
        </p>
      </div>

      {/* Order summary card */}
      <Card className="border-0 shadow-sm overflow-hidden mb-6">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal/10">
                <FileText className="h-6 w-6 text-teal" />
              </div>
              <div>
                <p className="font-semibold text-navy">{formatMotionType(order.motion_type)}</p>
                <p className="text-sm text-gray-500">{order.case_caption}</p>
              </div>
            </div>
            <p className="font-bold text-navy text-xl tabular-nums">{displayPrice}</p>
          </div>

          <div className="border-t border-gray-100 pt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <Hash className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">Order ID:</span>
              <span className="font-mono font-medium text-navy">{order.order_number}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">Turnaround:</span>
              <span className="font-medium text-navy">
                {order.turnaround === 'standard' ? 'Standard' : order.turnaround === 'rush_72' ? 'Rush 72hr' : 'Rush 48hr'}
              </span>
            </div>
            {order.expected_delivery && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500">Expected delivery:</span>
                <span className="font-medium text-navy">{formatDateShort(order.expected_delivery)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">Filing deadline:</span>
              <span className="font-medium text-orange-600">{formatDateShort(order.filing_deadline)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info box */}
      <Card className="border-0 shadow-sm overflow-hidden bg-blue-50 mb-8">
        <CardContent className="p-5">
          <p className="text-sm text-blue-800">
            You will receive a notification when your filing package is ready for your approval.
            You can track progress in your dashboard at any time.
          </p>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button size="lg" className="gap-2" asChild>
          <Link href={`/orders/${order.id}`}>
            View in Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button size="lg" variant="outline" className="gap-2" asChild>
          <Link href="/submit">
            <PlusCircle className="h-4 w-4" />
            Submit Another Matter
          </Link>
        </Button>
      </div>
    </div>
  )
}
