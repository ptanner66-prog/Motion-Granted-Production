import {
  FileText,
  File,
  FileCheck,
  ScrollText,
  Download,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface DocumentCardProps {
  type: string
  filename: string
  pageCount?: number
  wordCount?: number
  fileSizeBytes?: number
  status?: 'draft' | 'final' | 'needs_review'
  downloadUrlDocx?: string
  downloadUrlPdf?: string
  onPreview?: () => void
  isPrivileged?: boolean
  className?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const DOCUMENT_ICONS: Record<string, typeof FileText> = {
  motion: FileText,
  memorandum: FileText,
  memo: FileText,
  declaration: File,
  affidavit: File,
  proposed_order: FileCheck,
  order: FileCheck,
  proof_of_service: ScrollText,
  instructions: ScrollText,
  separate_statement: FileText,
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', variant: 'warning' as const },
  final: { label: 'Final', variant: 'success' as const },
  needs_review: { label: 'Needs Review', variant: 'orange' as const },
} as const

export function DocumentCard({
  type,
  filename,
  pageCount,
  wordCount,
  fileSizeBytes,
  status = 'final',
  downloadUrlDocx,
  downloadUrlPdf,
  onPreview,
  isPrivileged = false,
  className,
}: DocumentCardProps) {
  const Icon = DOCUMENT_ICONS[type.toLowerCase()] ?? FileText
  const statusInfo = STATUS_CONFIG[status]

  return (
    <Card className={cn('transition-shadow hover:shadow-md', className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50">
            <Icon className="h-5 w-5 text-navy" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-sm font-semibold text-navy">
                {filename}
              </h4>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              {pageCount != null && (
                <span>
                  {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                </span>
              )}
              {wordCount != null && (
                <span>{wordCount.toLocaleString()} words</span>
              )}
              {fileSizeBytes != null && (
                <span>{formatFileSize(fileSizeBytes)}</span>
              )}
              {isPrivileged && (
                <span className="flex items-center gap-1 font-medium text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  Privileged &amp; Confidential
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {onPreview && (
                <Button variant="ghost" size="sm" onClick={onPreview}>
                  Preview
                </Button>
              )}
              {downloadUrlDocx && (
                <Button variant="outline" size="sm" asChild>
                  <a href={downloadUrlDocx} download>
                    <Download className="h-3.5 w-3.5" />
                    DOCX
                  </a>
                </Button>
              )}
              {downloadUrlPdf && (
                <Button variant="outline" size="sm" asChild>
                  <a href={downloadUrlPdf} download>
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </a>
                </Button>
              )}
              {!downloadUrlDocx && !downloadUrlPdf && (
                <Button variant="outline" size="sm" disabled>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
