/**
 * Document Persistence Utility (ST11-ACTION-1)
 *
 * Provides typed helpers for persisting and querying order_documents records.
 * Used by D6 generators to write document metadata after upload.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export type DocumentType =
  | 'MOTION'
  | 'MEMORANDUM'
  | 'DECLARATION'
  | 'PROPOSED_ORDER'
  | 'REQUEST_FOR_JUDICIAL_NOTICE'
  | 'PROOF_OF_SERVICE'
  | 'ATTORNEY_INSTRUCTION_SHEET'
  | 'CITATION_REPORT'
  | 'SEPARATE_STATEMENT'
  | 'EXHIBIT_INDEX'
  | 'NOTICE_OF_MOTION'
  | 'CAPTION_QC_REPORT'
  | 'TABLE_OF_AUTHORITIES'
  | 'CERTIFICATE_OF_SERVICE';

export interface GeneratedDocument {
  orderId: string;
  documentType: string;
  filePath: string;
  fileSizeBytes: number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface OrderDocument {
  id: string;
  order_id: string;
  document_type: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Persist a generated document record to the order_documents table.
 */
export async function persistDocument(
  supabase: SupabaseClient,
  doc: GeneratedDocument
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('order_documents')
    .insert({
      order_id: doc.orderId,
      document_type: doc.documentType,
      file_path: doc.filePath,
      file_size: doc.fileSizeBytes,
      mime_type:
        doc.mimeType ||
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: doc.metadata || {},
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

/**
 * Get all documents for an order, ordered by creation date.
 */
export async function getOrderDocuments(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderDocument[]> {
  const { data, error } = await supabase
    .from('order_documents')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch order documents: ${error.message}`);
  return (data as OrderDocument[]) || [];
}

/**
 * Get a specific document type for an order.
 */
export async function getDocumentByType(
  supabase: SupabaseClient,
  orderId: string,
  documentType: string
): Promise<OrderDocument | null> {
  const { data, error } = await supabase
    .from('order_documents')
    .select('*')
    .eq('order_id', orderId)
    .eq('document_type', documentType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch document: ${error.message}`);
  return data as OrderDocument | null;
}
