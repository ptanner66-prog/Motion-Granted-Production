// Vercel serverless function configuration
export const maxDuration = 120; // 2 minutes for large file uploads
export const dynamic = 'force-dynamic';

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

    // Validate file size (100MB max for large legal briefs)
    const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 100MB limit' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif'
    ]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only PDF, DOC, DOCX, and images are allowed' }, { status: 400 })
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
        public: false,
        fileSizeLimit: 104857600, // 100MB
        allowedMimeTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg',
          'image/png',
          'image/gif'
        ]
      })

      if (createError) {
        return NextResponse.json({ error: 'Storage configuration error' }, { status: 503 })
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
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Create signed URL for private access (valid for 1 hour)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 3600)

    if (urlError || !signedUrlData) {
      return NextResponse.json({ error: 'Failed to generate access URL' }, { status: 500 })
    }

    const signedUrl = signedUrlData.signedUrl

    // If orderId provided, save to documents table
    if (orderId) {
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          order_id: orderId,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          file_url: filePath, // Store file path, not signed URL
          document_type: documentType || 'other',
          uploaded_by: user.id,
        })

      if (dbError) {
        return NextResponse.json({ error: 'Failed to save document metadata' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      url: signedUrl,
      path: filePath,
      fileName: file.name,
      fileSize: file.size,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
