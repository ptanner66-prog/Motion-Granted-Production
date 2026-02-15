'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ORDER_STATUSES = [
  { value: 'submitted', label: 'Submitted', description: 'New order awaiting processing' },
  { value: 'under_review', label: 'Under Review', description: 'Queued for generation' },
  { value: 'in_progress', label: 'In Progress', description: 'Being drafted by AI' },
  { value: 'pending_review', label: 'Pending Review', description: 'Draft ready for admin review' },
  { value: 'draft_delivered', label: 'Draft Delivered', description: 'Sent to client for review' },
  { value: 'revision_requested', label: 'Revision Requested', description: 'Client requested changes' },
  { value: 'revision_delivered', label: 'Revision Delivered', description: 'Revised draft ready' },
  { value: 'completed', label: 'Completed', description: 'Order finalized' },
  { value: 'generation_failed', label: 'Generation Failed', description: 'AI generation failed - retry needed' },
  { value: 'blocked', label: 'Blocked', description: 'Requires manual intervention' },
  { value: 'pending_conflict_review', label: 'Conflict Review', description: 'Under review for scheduling conflict' },
  { value: 'cancelled', label: 'Cancelled', description: 'Order cancelled' },
]

interface StatusUpdateFormProps {
  orderId: string
  currentStatus: string
}

export function StatusUpdateForm({ orderId, currentStatus }: StatusUpdateFormProps) {
  const [status, setStatus] = useState(currentStatus)
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const handleStatusUpdate = async () => {
    if (status === currentStatus) {
      toast({
        title: 'No change',
        description: 'Status is already set to this value.',
      })
      return
    }

    setIsUpdating(true)
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId)

      if (error) throw error

      toast({
        title: 'Status updated',
        description: `Order status changed to "${ORDER_STATUSES.find(s => s.value === status)?.label}".`,
      })

      router.refresh()
    } catch (error) {
      toast({
        title: 'Error updating status',
        description: 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Card className="bg-white border-gray-200">
      <CardHeader className="border-b border-gray-200 bg-teal/5">
        <CardTitle className="text-lg text-navy flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-teal" />
          Update Status
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div className="space-y-2">
          <Label className="text-gray-500">Current Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="bg-gray-100 border-gray-300 text-navy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-300">
              {ORDER_STATUSES.map((s) => (
                <SelectItem
                  key={s.value}
                  value={s.value}
                  className="text-navy focus:bg-gray-100 focus:text-navy"
                >
                  <div>
                    <p className="font-medium">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.description}</p>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleStatusUpdate}
          disabled={isUpdating || status === currentStatus}
          className="w-full bg-teal hover:bg-teal-dark text-white"
        >
          {isUpdating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            'Update Status'
          )}
        </Button>

        {status !== currentStatus && (
          <p className="text-xs text-teal text-center">
            Status will change from &quot;{ORDER_STATUSES.find(s => s.value === currentStatus)?.label}&quot; to &quot;{ORDER_STATUSES.find(s => s.value === status)?.label}&quot;
          </p>
        )}
      </CardContent>
    </Card>
  )
}
