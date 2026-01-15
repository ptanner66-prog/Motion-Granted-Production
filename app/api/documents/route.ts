import { NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'

export async function POST(req: Request) {
  // Return early if Supabase is not configured
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Storage configuration error: Database not configured' }, { status: 503 })
  }

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const orderId = formData.get('orderId') as string | null
    const documentType = formData.get('documentType') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    // Check file size (50MB max)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 })
    }

    // Check file type - be more lenient
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain'
    ]

    // Also check by extension if MIME type detection fails
    const fileName = file.name.toLowerCase()
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.txt']
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext))

    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
      return NextResponse.json({
        error: 'Invalid file type. Allowed: PDF, DOC, DOCX, JPG, PNG, GIF, TXT'
      }, { status: 400 })
    }

    // Create unique file path - use 'orders/' prefix to match storage policy
    const timestamp = Date.now()
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `orders/${orderId}/${timestamp}-${sanitizedFileName}`

    // Convert File to ArrayBuffer then to Uint8Array for upload
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // First, check if the bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()

    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError)
    }

    const bucketExists = buckets?.some((b: { name: string }) => b.name === 'documents')

    if (!bucketExists) {
      // Try to create the bucket
      const { error: createBucketError } = await supabase.storage.createBucket('documents', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
      })

      if (createBucketError && !createBucketError.message.includes('already exists')) {
        console.error('Error creating bucket:', createBucketError)
        return NextResponse.json({
          error: 'Storage not configured. Please run the storage setup SQL in Supabase.',
          details: createBucketError.message
        }, { status: 503 })
      }
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, uint8Array, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)

      // Provide helpful error messages
      if (uploadError.message.includes('Bucket not found')) {
        return NextResponse.json({
          error: 'Storage bucket not found. Please create the "documents" bucket in Supabase Storage.'
        }, { status: 503 })
      }
      if (uploadError.message.includes('row-level security') || uploadError.message.includes('policy')) {
        return NextResponse.json({
          error: 'Storage permission denied. Please run the storage setup SQL to configure policies.'
        }, { status: 403 })
      }

      return NextResponse.json({
        error: `Upload failed: ${uploadError.message}`
      }, { status: 500 })
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    // Save document record to database
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        order_id: orderId,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        file_url: filePath, // Store the path, not the full URL (for flexibility)
        document_type: documentType || 'other',
        uploaded_by: user.id,
        is_deliverable: false
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // Try to clean up the uploaded file
      await supabase.storage.from('documents').remove([filePath])

      // Check for specific errors
      if (dbError.message.includes('violates row-level security')) {
        return NextResponse.json({
          error: 'Permission denied. Please check database RLS policies for the documents table.'
        }, { status: 403 })
      }

      return NextResponse.json({
        error: `Failed to save document record: ${dbError.message}`
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        fileName: document.file_name,
        fileUrl: urlData.publicUrl,
        filePath: filePath,
        documentType: document.document_type
      }
    })

  } catch (error) {
    console.error('Error uploading document:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint to fetch documents for an order
export async function GET(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured', documents: [] }, { status: 503 })
  }

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ documents })

  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
