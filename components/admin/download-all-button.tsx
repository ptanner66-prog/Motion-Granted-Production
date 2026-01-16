'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface DownloadAllButtonProps {
  orderId: string
  orderNumber: string
  documentCount: number
}

export function DownloadAllButton({ orderId, orderNumber, documentCount }: DownloadAllButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const { toast } = useToast()

  const handleDownload = async () => {
    if (documentCount === 0) {
      toast({
        title: 'No documents',
        description: 'There are no documents to download.',
        variant: 'destructive',
      })
      return
    }

    setIsDownloading(true)

    try {
      const response = await fetch(`/api/orders/${orderId}/documents/download-all`)

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Download failed' }))
        throw new Error(error.error || 'Download failed')
      }

      // Get the blob from response
      const blob = await response.blob()

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${orderNumber}-documents.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast({
        title: 'Download complete',
        description: `${documentCount} document${documentCount === 1 ? '' : 's'} downloaded.`,
      })
    } catch (error) {
      console.error('Download error:', error)
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'An error occurred during download.',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Button
      onClick={handleDownload}
      variant="outline"
      disabled={isDownloading || documentCount === 0}
      className="gap-2 border-navy text-navy hover:bg-navy hover:text-white"
    >
      {isDownloading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Downloading...
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Download All
        </>
      )}
    </Button>
  )
}
