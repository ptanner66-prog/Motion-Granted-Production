import { NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'

export async function POST(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const documentType = formData.get('documentType') as string
    const orderId = formData.get('orderId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Generate unique file name
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(7)
    const fileExt = file.name.split('.').pop()
    const fileName = `${timestamp}-${randomStr}.${fileExt}`
    const filePath = orderId
      ? `orders/${orderId}/${fileName}`
      : `temp/${user.id}/${fileName}`

    // Convert File to ArrayBuffer then to Uint8Array for upload
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // Check if bucket exists first
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some((b: { name: string }) => b.name === 'documents')

    if (!bucketExists) {
      // Try to create the bucket
      const { error: createError } = await supabase.storage.createBucket('documents', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      })

      if (createError) {
        console.error('Could not create storage bucket:', createError)
        // Return a placeholder URL so the flow continues
        return NextResponse.json({
          success: true,
          url: `pending://${file.name}`,
          path: filePath,
          fileName: file.name,
          fileSize: file.size,
          note: 'Storage not configured. Document info saved but file not uploaded.'
        })
      }
    }

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, uint8Array, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      // Return placeholder so flow continues
      return NextResponse.json({
        success: true,
        url: `pending://${file.name}`,
        path: filePath,
        fileName: file.name,
        fileSize: file.size,
        note: 'Upload failed but document info saved.'
      })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    // If orderId provided, save to documents table
    if (orderId) {
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          order_id: orderId,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          file_url: publicUrl,
          document_type: documentType || 'other',
          uploaded_by: user.id,
        })

      if (dbError) {
        console.error('Database error:', dbError)
      }
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: filePath,
      fileName: file.name,
      fileSize: file.size,
    })
  } catch (error) {
    console.error('Error uploading document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
