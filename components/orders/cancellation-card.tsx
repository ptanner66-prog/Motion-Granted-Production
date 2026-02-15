import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { XCircle, DollarSign, Clock, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface CancellationCardProps {
  cancelReason?: string | null
  cancelledAt?: string | null
  refundAmount?: number | null
  refundStatus?: string | null
  amountPaid?: number | null
}

export function CancellationCard({
  cancelReason,
  cancelledAt,
  refundAmount,
  refundStatus,
  amountPaid,
}: CancellationCardProps) {
  const displayRefund = refundAmount
    ? `$${(refundAmount / 100).toFixed(2)}`
    : amountPaid
      ? `$${(amountPaid / 100).toFixed(2)}`
      : '$0.00'

  return (
    <Card className="border-0 shadow-sm overflow-hidden border-l-4 border-l-red-400">
      <CardHeader className="bg-gradient-to-r from-red-50 to-transparent border-b border-red-100">
        <CardTitle className="text-lg flex items-center gap-2 text-red-800">
          <XCircle className="h-5 w-5 text-red-500" />
          Cancellation Details
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {cancelReason && (
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Reason</p>
              <p className="text-gray-700">{cancelReason}</p>
            </div>
          </div>
        )}

        {cancelledAt && (
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cancelled On</p>
              <p className="text-gray-700">{formatDate(cancelledAt)}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <DollarSign className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Refund Amount</p>
            <p className="text-gray-700 font-semibold">{displayRefund}</p>
          </div>
        </div>

        {refundStatus && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-700">
              <strong>Refund status:</strong>{' '}
              {refundStatus === 'pending'
                ? 'Processing — expect 5-10 business days.'
                : refundStatus === 'completed'
                  ? 'Refund completed.'
                  : refundStatus}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
