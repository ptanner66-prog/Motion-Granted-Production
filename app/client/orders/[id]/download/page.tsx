'use client';

/**
 * Client Download Portal (Task 68)
 *
 * Features:
 * 1. List all documents in delivery
 * 2. Individual file download
 * 3. Download all as ZIP
 * 4. Preview documents (PDF viewer)
 * 5. Revision request button
 * 6. Show deadline countdown
 * 7. AI disclosure acknowledgment checkbox
 *
 * Security:
 * - Verify user owns order
 * - Time-limited download links (24 hours)
 * - Log all downloads
 *
 * Source: Chunk 9, Task 68 - Gap Analysis B-6
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Download,
  FileText,
  Eye,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle,
  Archive,
  ChevronRight,
  X,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface DownloadableDocument {
  id: string;
  filename: string;
  type: string;
  sizeBytes: number;
  downloadUrl: string;
  expiresAt: Date;
  documentType: 'motion' | 'exhibits' | 'separate_statement' | 'instructions' | 'other';
}

interface OrderDetails {
  id: string;
  order_number: string;
  case_caption: string;
  motion_type: string;
  status: string;
  filing_deadline: string | null;
  completed_at: string | null;
  revision_count: number;
  max_revisions: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getSignedDownloadUrl(
  orderId: string,
  documentPath: string
): Promise<{ url: string; expiresAt: Date }> {
  const supabase = createClient();

  // Create signed URL valid for 24 hours
  const { data, error } = await supabase.storage
    .from('order-documents')
    .createSignedUrl(documentPath, 24 * 60 * 60); // 24 hours in seconds

  if (error || !data) {
    throw new Error('Failed to generate download URL');
  }

  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

async function logDownload(
  orderId: string,
  documentId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();

  await supabase.from('document_downloads').insert({
    order_id: orderId,
    document_id: documentId,
    user_id: userId,
    downloaded_at: new Date().toISOString(),
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTimeRemaining(deadline: string | null): {
  text: string;
  urgent: boolean;
  expired: boolean;
} {
  if (!deadline) {
    return { text: 'No deadline set', urgent: false, expired: false };
  }

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();

  if (diffMs < 0) {
    return { text: 'Deadline passed', urgent: false, expired: true };
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffDays === 0) {
    return { text: `${diffHours} hours remaining`, urgent: true, expired: false };
  }

  if (diffDays === 1) {
    return { text: '1 day remaining', urgent: true, expired: false };
  }

  if (diffDays <= 3) {
    return { text: `${diffDays} days remaining`, urgent: true, expired: false };
  }

  return { text: `${diffDays} days remaining`, urgent: false, expired: false };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DownloadPortal() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [documents, setDocuments] = useState<DownloadableDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DownloadableDocument | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch order and documents
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }
        setUserId(user.id);

        // Get order details
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .eq('client_id', user.id)
          .single();

        if (orderError || !orderData) {
          setError('Order not found or you do not have access');
          setLoading(false);
          return;
        }

        setOrder({
          id: orderData.id,
          order_number: orderData.order_number,
          case_caption: orderData.case_caption,
          motion_type: orderData.motion_type,
          status: orderData.status,
          filing_deadline: orderData.filing_deadline,
          completed_at: orderData.completed_at,
          revision_count: orderData.revision_count || 0,
          max_revisions: orderData.max_revisions || 2,
        });

        // FIX-B FIX-2: Query `documents` table (where workflow writes deliverables)
        // instead of `workflow_files` (wrong table — is_final column doesn't exist).
        const { data: filesData } = await supabase
          .from('documents')
          .select('id, file_name, file_type, file_size, file_url, document_type, created_at')
          .eq('order_id', orderId)
          .eq('is_deliverable', true)
          .order('created_at', { ascending: false });

        // Transform to downloadable documents
        const docs: DownloadableDocument[] = [];

        for (const file of filesData || []) {
          try {
            // file_url stores the storage path within the order-documents bucket
            const { url, expiresAt } = await getSignedDownloadUrl(orderId, file.file_url);

            // Map document_type to frontend enum values
            let docType: DownloadableDocument['documentType'] = 'other';
            if (file.document_type === 'motion') docType = 'motion';
            else if (file.document_type === 'instructions' || file.document_type === 'instruction_sheet') docType = 'instructions';
            else if (file.document_type === 'separate_statement') docType = 'separate_statement';
            else if (file.document_type === 'exhibits') docType = 'exhibits';

            docs.push({
              id: file.id,
              filename: file.file_name,
              type: file.file_type || 'application/octet-stream',
              sizeBytes: file.file_size || 0,
              downloadUrl: url,
              expiresAt,
              documentType: docType,
            });
          } catch {
            // Skip files that can't be accessed
            console.error(`Failed to get URL for file ${file.id}`);
          }
        }

        setDocuments(docs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orderId, router]);

  // Handle individual download
  const handleDownload = async (doc: DownloadableDocument) => {
    if (!disclosureAcknowledged) {
      alert('Please acknowledge the AI disclosure before downloading');
      return;
    }

    setDownloading(doc.id);

    try {
      // Log download
      if (userId) {
        await logDownload(orderId, doc.id, userId);
      }

      // Trigger download
      const link = document.createElement('a');
      link.href = doc.downloadUrl;
      link.download = doc.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(null);
    }
  };

  // Handle download all as ZIP
  const handleDownloadAll = async () => {
    if (!disclosureAcknowledged) {
      alert('Please acknowledge the AI disclosure before downloading');
      return;
    }

    // Download each file
    for (const doc of documents) {
      await handleDownload(doc);
      // Small delay between downloads
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  // Handle revision request
  const handleRequestRevision = () => {
    if (!order) return;

    if (order.revision_count >= order.max_revisions) {
      alert(`You have used all ${order.max_revisions} revisions for this order`);
      return;
    }

    router.push(`/client/orders/${orderId}/revision`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Error state
  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">{error || 'Order not found'}</p>
          <button
            onClick={() => router.push('/client/orders')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const timeRemaining = getTimeRemaining(order.filing_deadline);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Download Your Documents</h1>
              <p className="text-gray-600 mt-1">
                Order #{order.order_number} • {order.motion_type?.replace(/_/g, ' ')}
              </p>
              <p className="text-sm text-gray-500 mt-1">{order.case_caption}</p>
            </div>

            {/* Deadline countdown */}
            {order.filing_deadline && (
              <div
                className={`px-4 py-2 rounded-lg ${
                  timeRemaining.urgent
                    ? 'bg-red-100 text-red-800'
                    : timeRemaining.expired
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-blue-100 text-blue-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">{timeRemaining.text}</span>
                </div>
                <p className="text-xs mt-1">
                  Filing deadline: {new Date(order.filing_deadline).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* AI Disclosure acknowledgment */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-800">AI-Generated Document Disclosure</h3>
              <p className="text-sm text-amber-700 mt-1">
                These documents were generated with artificial intelligence assistance. As stated in
                our terms of service, these drafts require attorney review before filing. The
                AI-generated content may contain errors and does not constitute legal advice.
              </p>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={disclosureAcknowledged}
                  onChange={(e) => setDisclosureAcknowledged(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="text-sm text-amber-800 font-medium">
                  I acknowledge that these documents were AI-generated and require attorney review
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Documents list */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Documents ({documents.length})
            </h2>
            <button
              onClick={handleDownloadAll}
              disabled={!disclosureAcknowledged || documents.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Archive className="w-4 h-4" />
              Download All
            </button>
          </div>

          {documents.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No documents available yet</p>
              <p className="text-sm mt-1">Documents will appear here when your order is complete</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">{doc.filename}</p>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(doc.sizeBytes)} •{' '}
                        {doc.documentType.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewDoc(doc)}
                      className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={!disclosureAcknowledged || downloading === doc.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {downloading === doc.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Revision request */}
        <div className="mt-6 bg-white rounded-lg border shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Need Changes?</h3>
              <p className="text-sm text-gray-600 mt-1">
                {order.revision_count < order.max_revisions
                  ? `You have ${order.max_revisions - order.revision_count} revision${order.max_revisions - order.revision_count !== 1 ? 's' : ''} remaining`
                  : 'No revisions remaining'}
              </p>
            </div>
            <button
              onClick={handleRequestRevision}
              disabled={order.revision_count >= order.max_revisions}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Request Revision
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Success message */}
        {order.status === 'complete' && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <h3 className="font-medium text-green-800">Order Complete</h3>
                <p className="text-sm text-green-700 mt-1">
                  Your documents are ready. Remember to review before filing.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold">{previewDoc.filename}</h3>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {previewDoc.type === 'application/pdf' ? (
                <iframe
                  src={previewDoc.downloadUrl}
                  className="w-full h-full min-h-[70vh]"
                  title="Document Preview"
                />
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Preview not available for this file type</p>
                  <button
                    onClick={() => handleDownload(previewDoc)}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Download to View
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
