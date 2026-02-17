export const maxDuration = 120; // 2 minutes for ZIP generation and download

import { NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import archiver from 'archiver'
import { createLogger } from '@/lib/security/logger'
import { STORAGE_BUCKETS } from '@/lib/config/storage'

const log = createLogger('api-orders-download-all')

// GET /api/orders/[id]/documents/download-all
// Download all documents for an order as a ZIP file
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { id: orderId } = await params
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Fetch order to verify access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, client_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Check access: must be admin/clerk OR the order owner
    const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk'
    const isOwner = order.client_id === user.id
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch all documents for the order
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, file_name, file_url, document_type')
      .eq('order_id', orderId)

    if (docsError) {
      log.error('Error fetching documents', { error: docsError })
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No documents found' }, { status: 404 })
    }

    // Create archive and collect data using a promise
    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []

      const archive = archiver('zip', {
        zlib: { level: 5 }
      })

      archive.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      archive.on('end', () => {
        resolve(Buffer.concat(chunks))
      })

      archive.on('error', (err) => {
        reject(err)
      })

      // Process documents sequentially
      const processDocuments = async () => {
        for (const doc of documents) {
          try {
            const { data: fileData, error: downloadError } = await supabase.storage
              .from(STORAGE_BUCKETS.ORDER_DOCUMENTS)
              .download(doc.file_url)

            if (downloadError || !fileData) {
              log.error('Failed to download document', { fileName: doc.file_name, error: downloadError })
              continue
            }

            const buffer = Buffer.from(await fileData.arrayBuffer())
            const folder = doc.document_type === 'deliverable' ? 'deliverables' : 'uploads'
            archive.append(buffer, { name: `${folder}/${doc.file_name}` })
          } catch (err) {
            log.error('Error processing document', { fileName: doc.file_name, error: err instanceof Error ? err.message : err })
          }
        }

        archive.finalize()
      }

      processDocuments().catch(reject)
    })

    const filename = `${order.order_number}-documents.zip`

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    })

  } catch (error) {
    log.error('Error creating document archive', { error: error instanceof Error ? error.message : error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
