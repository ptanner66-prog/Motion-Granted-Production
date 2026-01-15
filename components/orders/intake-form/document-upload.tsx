'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useOrderForm } from '@/hooks/use-order-form'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, FileText, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const DOCUMENT_TYPES = [
  { id: 'complaint', name: 'Complaint/Petition' },
  { id: 'answer', name: 'Answer' },
  { id: 'discovery', name: 'Discovery Documents' },
  { id: 'deposition', name: 'Deposition Transcripts' },
  { id: 'prior_motion', name: 'Prior Motions/Orders' },
  { id: 'exhibit', name: 'Exhibits' },
  { id: 'other', name: 'Other' },
]

export function DocumentUpload() {
  const { documents, addDocument, removeDocument, updateDocumentProgress } = useOrderForm()
  const { toast } = useToast()
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  const uploadFile = async (file: File, docId: string) => {
    setUploading(prev => ({ ...prev, [docId]: true }))

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', 'pending') // Will be updated when user selects type

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await response.json()
      updateDocumentProgress(docId, 100, data.url)

      return data.url
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      })
      // Remove the document on failure
      removeDocument(docId)
      return null
    } finally {
      setUploading(prev => ({ ...prev, [docId]: false }))
    }
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        const docId = `${Date.now()}-${Math.random().toString(36).substring(7)}`

        // Add document to state with 0 progress
        const doc = {
          id: docId,
          file,
          name: file.name,
          type: file.type,
          size: file.size,
          documentType: '',
          uploadProgress: 0,
        }
        addDocument(doc)

        // Start upload
        uploadFile(file, docId)
      }
    },
    [addDocument]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
  })

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const hasComplaint = documents.some((d) => d.documentType === 'complaint')
  const isAnyUploading = Object.values(uploading).some(Boolean)

  const handleDocumentTypeChange = (docId: string, newType: string) => {
    // Find and update the document
    const doc = documents.find(d => d.id === docId)
    if (doc) {
      doc.documentType = newType
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy">Upload Documents</h2>
        <p className="mt-1 text-gray-500">
          Upload relevant case documents for the clerk to review
        </p>
      </div>

      <div className="space-y-4">
        {/* Required document notice */}
        <div
          className={`rounded-lg p-4 ${
            hasComplaint
              ? 'bg-green-50 border border-green-200'
              : 'bg-amber-50 border border-amber-200'
          }`}
        >
          <div className="flex gap-3">
            {hasComplaint ? (
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            )}
            <div className="text-sm">
              <p className={`font-medium ${hasComplaint ? 'text-green-800' : 'text-amber-800'}`}>
                {hasComplaint ? 'Complaint uploaded' : 'Complaint/Petition required'}
              </p>
              <p className={`mt-1 ${hasComplaint ? 'text-green-700' : 'text-amber-700'}`}>
                {hasComplaint
                  ? 'Thank you for uploading the complaint/petition.'
                  : 'Please upload the operative complaint or petition.'}
              </p>
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-teal bg-teal/5'
              : 'border-gray-300 hover:border-gray-400'
          } ${isAnyUploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input {...getInputProps()} />
          <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
          {isDragActive ? (
            <p className="text-teal font-medium">Drop files here...</p>
          ) : (
            <>
              <p className="text-gray-600 font-medium">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-sm text-gray-500 mt-1">
                PDF, DOC, DOCX • Max 50MB per file
              </p>
            </>
          )}
        </div>

        {/* Document List */}
        {documents.length > 0 && (
          <div className="space-y-3">
            <Label>Uploaded Documents</Label>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-start gap-3 rounded-lg border border-gray-200 p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                  {uploading[doc.id] ? (
                    <Loader2 className="h-5 w-5 text-teal animate-spin" />
                  ) : (
                    <FileText className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-navy truncate">{doc.name}</p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(doc.size)}
                    {doc.url && (
                      <span className="ml-2 text-green-600">• Uploaded</span>
                    )}
                  </p>
                  {uploading[doc.id] && (
                    <div className="mt-2">
                      <Progress value={30} className="h-1" />
                      <p className="text-xs text-gray-400 mt-1">Uploading...</p>
                    </div>
                  )}
                  {!uploading[doc.id] && doc.uploadProgress === 100 && (
                    <div className="mt-2">
                      <Select
                        value={doc.documentType}
                        onValueChange={(value) => handleDocumentTypeChange(doc.id, value)}
                      >
                        <SelectTrigger className="w-full sm:w-48 h-8 text-sm">
                          <SelectValue placeholder="Document type" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-gray-400 hover:text-red-500"
                  onClick={() => removeDocument(doc.id)}
                  disabled={uploading[doc.id]}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Tips */}
        <div className="rounded-lg bg-gray-50 p-4">
          <h4 className="font-medium text-navy text-sm">Recommended Documents</h4>
          <ul className="mt-2 text-sm text-gray-600 space-y-1">
            <li>• Operative complaint or petition (required)</li>
            <li>• Answer and any counterclaims</li>
            <li>• Relevant discovery responses</li>
            <li>• Deposition transcripts</li>
            <li>• Prior motions and court orders</li>
            <li>• Any exhibits you want referenced</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
