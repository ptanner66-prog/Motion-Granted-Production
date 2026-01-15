'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Download, Loader2, ExternalLink } from 'lucide-react'

interface DocumentDownloadButtonProps {
  filePath: string
  fileName: string
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  showText?: boolean
  className?: string
}

export function DocumentDownloadButton({
  filePath,
  fileName,
  variant = 'ghost',
  size = 'sm',
  showText = true,
  className = '',
}: DocumentDownloadButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const handleDownload = async () => {
    setIsLoading(true)

    try {
      // Generate a signed URL (valid for 1 hour)
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600)

      if (error) {
        throw error
      }

      if (!data?.signedUrl) {
        throw new Error('Failed to generate download URL')
      }

      // Open in new tab or trigger download
      window.open(data.signedUrl, '_blank')

      toast({
        title: 'Download started',
        description: `Downloading ${fileName}`,
      })
    } catch (error) {
      console.error('Download error:', error)
      toast({
        title: 'Download failed',
        description: 'Unable to download the file. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleDownload}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {showText && <span className="ml-2">Loading...</span>}
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          {showText && <span className="ml-2">Download</span>}
        </>
      )}
    </Button>
  )
}

interface DocumentViewButtonProps {
  filePath: string
  fileName: string
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  showText?: boolean
  className?: string
}

export function DocumentViewButton({
  filePath,
  fileName,
  variant = 'outline',
  size = 'sm',
  showText = true,
  className = '',
}: DocumentViewButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const handleView = async () => {
    setIsLoading(true)

    try {
      // Generate a signed URL (valid for 1 hour)
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600)

      if (error) {
        throw error
      }

      if (!data?.signedUrl) {
        throw new Error('Failed to generate view URL')
      }

      // Open in new tab
      window.open(data.signedUrl, '_blank')
    } catch (error) {
      console.error('View error:', error)
      toast({
        title: 'Unable to open file',
        description: 'Please try downloading the file instead.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleView}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {showText && <span className="ml-2">Loading...</span>}
        </>
      ) : (
        <>
          <ExternalLink className="h-4 w-4" />
          {showText && <span className="ml-2">View</span>}
        </>
      )}
    </Button>
  )
}
