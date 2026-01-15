import { NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'

export async function POST(req: Request) {
  // Return early if Supabase is not configured
  if (!isSupabaseConfigured) {
    console.error('Supabase not configured')
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const supabase = await createClient()

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error('Auth error:', userError)
      return NextResponse.json({ error: 'Please log in to upload documents' }, { status: 401 })
    }

    // Parse form data
    let formData: FormData
    try {
      formData = await req.formData()
    } catch (e) {
      console.error('FormData parse error:', e)
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    const orderId = formData.get('orderId') as string | null
    const documentType = formData.get('documentType') as string || 'other'

    // Validate inputs
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 400 })
    }

    // Validate file size is not 0
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    console.log('Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type)

    // Create unique file path
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `orders/${orderId}/${timestamp}-${safeName}`

    // Convert file to buffer
    let fileBuffer: Uint8Array
    try {
      const arrayBuffer = await file.arrayBuffer()
      fileBuffer = new Uint8Array(arrayBuffer)
    } catch (e) {
      console.error('File read error:', e)
      return NextResponse.json({ error: 'Failed to read file' }, { status: 500 })
    }

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)

      // Return user-friendly error based on error type
      const errorMessage = uploadError.message || 'Unknown storage error'

      if (errorMessage.includes('Bucket not found') || errorMessage.includes('bucket')) {
        return NextResponse.json({
          error: 'Storage not set up. Please contact support.'
        }, { status: 503 })
      }

      if (errorMessage.includes('security') || errorMessage.includes('policy') || errorMessage.includes('permission')) {
        return NextResponse.json({
          error: 'Upload permission denied. Please contact support.'
        }, { status: 403 })
      }

      if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        // Try with upsert
        const { error: retryError } = await supabase.storage
          .from('documents')
          .upload(filePath, fileBuffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: true
          })

        if (retryError) {
          return NextResponse.json({ error: 'File already exists' }, { status: 409 })
        }
      } else {
        return NextResponse.json({ error: `Upload failed: ${errorMessage}` }, { status: 500 })
      }
    }

    console.log('File uploaded successfully to:', filePath)

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    // Save to database
    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .insert({
        order_id: orderId,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        file_url: filePath,
        document_type: documentType,
        uploaded_by: user.id,
        is_deliverable: false
      })
      .select('id, file_name, document_type')
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)

      // Clean up uploaded file
      await supabase.storage.from('documents').remove([filePath]).catch(() => {})

      if (dbError.message?.includes('security') || dbError.message?.includes('policy')) {
        return NextResponse.json({
          error: 'Database permission denied. Please contact support.'
        }, { status: 403 })
      }

      return NextResponse.json({
        error: 'Failed to save document record'
      }, { status: 500 })
    }

    console.log('Document record saved:', doc.id)

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        fileName: doc.file_name,
        fileUrl: urlData.publicUrl,
        documentType: doc.document_type
      }
    })

  } catch (error) {
    console.error('Unexpected error in document upload:', error)
    return NextResponse.json({
      error: 'An unexpected error occurred. Please try again.'
    }, { status: 500 })
  }
}

// GET endpoint to fetch documents for an order
export async function GET(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ documents: [] })
  }

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', documents: [] }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required', documents: [] }, { status: 400 })
    }

    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch documents error:', error)
      return NextResponse.json({ documents: [] })
    }

    return NextResponse.json({ documents: documents || [] })

  } catch (error) {
    console.error('Unexpected error fetching documents:', error)
    return NextResponse.json({ documents: [] })
  }
}
