'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DocumentDownloadButton } from '@/components/documents/document-download-button'
import {
  FileCheck,
  FileText,
  Download,
  Clock,
  XCircle,
  RefreshCw,
  Package,
  AlertTriangle,
} from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

interface DeliverableDoc {
  id: string
  file_name: string
  file_url: string
  document_type: string
  created_at: string
}

interface DeliverablesCardProps {
  displayStatus: string
  deliverables: DeliverableDoc[]
  orderId: string
  motionType: string
}

const STANDARD_DELIVERABLES = [
  'Memorandum of Points and Authorities',
  'Declaration',
  'Proposed Order',
  'Proof of Service',
  'AIS (Appendix of Included Statutes)',
]

function isMSJOrMSA(motionType: string): boolean {
  return ['msj', 'msa', 'partial_sj'].includes(motionType)
}

export function DeliverablesCard({
  displayStatus,
  deliverables,
  orderId,
  motionType,
}: DeliverablesCardProps) {
  const showSeparateStatement = isMSJOrMSA(motionType)
  const expectedDocs = showSeparateStatement
    ? [...STANDARD_DELIVERABLES.slice(0, 1), 'Separate Statement', ...STANDARD_DELIVERABLES.slice(1)]
    : STANDARD_DELIVERABLES

  // Status-based rendering
  if (['PAID', 'IN_PROGRESS', 'HOLD_PENDING'].includes(displayStatus)) {
    return (
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-gray-400" />
            Filing Package
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Your filing package will appear here once drafting is complete.</p>
            <p className="text-sm mt-1 text-gray-400">
              Expected deliverables: {expectedDocs.length} documents
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (displayStatus === 'CANCELLED') {
    return (
      <Card className="border-0 shadow-sm overflow-hidden opacity-60">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
          <CardTitle className="text-lg flex items-center gap-2 text-gray-500">
            <XCircle className="h-5 w-5" />
            Filing Package
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            <XCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>This order was cancelled.</p>
            <p className="text-sm mt-1 text-gray-400">No file access available.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (displayStatus === 'REVISION_REQ') {
    return (
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-violet-50 to-transparent border-b border-violet-100">
          <CardTitle className="text-lg flex items-center gap-2 text-violet-800">
            <RefreshCw className="h-5 w-5 text-violet-600" />
            Filing Package
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {deliverables.length > 0 ? (
            <div className="space-y-3">
              {deliverables.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4 opacity-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                      <FileText className="h-5 w-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-500 line-through">{doc.file_name}</p>
                      <p className="text-xs text-gray-400">Previous version</p>
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-center py-4">
                <RefreshCw className="h-8 w-8 mx-auto mb-2 text-violet-400 animate-spin-slow" />
                <p className="text-sm font-medium text-violet-700">Revised version in progress.</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-violet-500">
              <RefreshCw className="h-12 w-12 mx-auto mb-3 text-violet-300 animate-spin-slow" />
              <p>Revised version in progress.</p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // AWAITING_APPROVAL: show files read-only (no downloads)
  if (displayStatus === 'AWAITING_APPROVAL') {
    return (
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-transparent border-b border-emerald-100">
          <CardTitle className="text-lg flex items-center gap-2 text-emerald-800">
            <FileCheck className="h-5 w-5 text-emerald-600" />
            Filing Package — Review
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {deliverables.length > 0 ? (
            <div className="space-y-3">
              {deliverables.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                      <FileCheck className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-navy">{doc.file_name}</p>
                      <p className="text-xs text-gray-500">
                        Ready for review &middot; {formatDateShort(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 italic">Preview only</span>
                </div>
              ))}
              <p className="text-xs text-gray-400 text-center pt-2">
                Downloads will be available after you approve the draft above.
              </p>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileCheck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No draft files attached yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // COMPLETED: Full download access
  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-teal/5 to-transparent border-b border-teal/10">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-teal" />
          Filing Package
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {deliverables.length > 0 ? (
          <div className="space-y-3">
            {deliverables.map((doc) => (
              <div
                key={doc.id}
                className="group flex items-center justify-between rounded-xl border border-teal/20 bg-teal/5 p-4 hover:border-teal/40 hover:bg-teal/10 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/20">
                    <FileCheck className="h-5 w-5 text-teal" />
                  </div>
                  <div>
                    <p className="font-semibold text-navy">{doc.file_name}</p>
                    <p className="text-xs text-gray-500">
                      Delivered &middot; {formatDateShort(doc.created_at)}
                    </p>
                  </div>
                </div>
                <DocumentDownloadButton
                  filePath={doc.file_url}
                  fileName={doc.file_name}
                  variant="outline"
                  className="border-teal/30 hover:bg-teal hover:text-white hover:border-teal"
                />
              </div>
            ))}

            {/* Download All */}
            {deliverables.length > 1 && (
              <div className="pt-2">
                <Button
                  variant="default"
                  className="w-full gap-2"
                  onClick={() => {
                    // Trigger download-all endpoint
                    window.location.href = `/api/orders/${orderId}/documents/download-all`
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download All (.zip)
                </Button>
              </div>
            )}

            {/* ABA 512 notice */}
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  <strong>ABA Model Rule 5.12 Notice:</strong> These documents were drafted with AI assistance and must be reviewed by a licensed attorney before filing. The supervising attorney bears full responsibility for the content of any filed documents.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FileCheck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No deliverables found.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
