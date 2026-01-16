'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface UploadDeliverableButtonProps {
  orderId: string
  onUploadComplete?: () => void
}

export function UploadDeliverableButton({ orderId, onUploadComplete }: UploadDeliverableButtonProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF or Word document.',
        variant: 'destructive',
      })
      return
    }

    // Validate file size (100MB max)
    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 100MB.',
        variant: 'destructive',
      })
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)

      // Use XMLHttpRequest for progress tracking
      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(percent)
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ ok: true })
          } else {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve({ ok: false, error: response.error || `Upload failed (${xhr.status})` })
            } catch {
              resolve({ ok: false, error: `Upload failed (${xhr.status})` })
            }
          }
        })

        xhr.addEventListener('error', () => {
          resolve({ ok: false, error: 'Network error during upload' })
        })

        xhr.timeout = 300000 // 5 minute timeout
        xhr.open('POST', `/api/orders/${orderId}/deliverables`)
        xhr.send(formData)
      })

      if (result.ok) {
        toast({
          title: 'Deliverable uploaded',
          description: `${file.name} has been uploaded successfully.`,
        })
        onUploadComplete?.()
        // Refresh the page to show the new document
        window.location.reload()
      } else {
        toast({
          title: 'Upload failed',
          description: result.error || 'An error occurred during upload.',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast({
        title: 'Upload failed',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
      />

      {isUploading ? (
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-[120px]">
            <Progress value={uploadProgress} className="h-2" />
          </div>
          <span className="text-sm text-gray-500 tabular-nums">{uploadProgress}%</span>
        </div>
      ) : (
        <Button
          onClick={handleClick}
          variant="outline"
          className="gap-2 border-teal text-teal hover:bg-teal hover:text-white"
        >
          <Upload className="h-4 w-4" />
          Upload Deliverable
        </Button>
      )}
    </div>
  )
}
