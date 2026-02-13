'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DeleteDeliverableButtonProps {
  orderId: string
  documentId: string
  fileName: string
}

export function DeleteDeliverableButton({ orderId, documentId, fileName }: DeleteDeliverableButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) {
      return
    }

    setIsDeleting(true)

    try {
      const response = await fetch(`/api/orders/${orderId}/deliverables`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Failed to delete deliverable')
        return
      }

      // Refresh the page to reflect the deletion
      router.refresh()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete deliverable. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-gray-400 hover:text-red-500 hover:bg-red-50 h-9 w-9 p-0"
      title={`Delete ${fileName}`}
    >
      {isDeleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  )
}
