import { NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'

// POST /api/orders/[id]/deliverables
// Upload completed draft (clerk/admin only)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { id: orderId } = await params
    const supabase = await createClient()

    // Get user and verify admin/clerk role
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'clerk'].includes(profile.role)) {
      return NextResponse.json({ error: 'Admin or clerk access required' }, { status: 403 })
    }

    // Verify order exists
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, client_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Parse form data
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size (100MB max)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 100MB.' }, { status: 400 })
    }

    // Create unique file path in deliverables folder
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `deliverables/${orderId}/${timestamp}-${safeName}`

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = new Uint8Array(arrayBuffer)

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
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    // Save to database with is_deliverable = true
    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .insert({
        order_id: orderId,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        file_url: filePath,
        document_type: 'deliverable',
        uploaded_by: user.id,
        is_deliverable: true
      })
      .select('id, file_name')
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)
      // Clean up uploaded file
      await supabase.storage.from('documents').remove([filePath]).catch(() => {})
      return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        fileName: doc.file_name,
        fileUrl: urlData.publicUrl,
        isDeliverable: true
      }
    })

  } catch (error) {
    console.error('Error uploading deliverable:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/orders/[id]/deliverables
// Get deliverables for an order
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ deliverables: [] })
  }

  try {
    const { id: orderId } = await params

    // Validate orderId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID format' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's role to check authorization
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdminOrClerk = profile?.role && ['admin', 'clerk'].includes(profile.role)

    // Verify order exists and user has access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // CRITICAL: Authorization check - user must own the order OR be admin/clerk
    if (!isAdminOrClerk && order.client_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch deliverables for the order
    const { data: deliverables, error } = await supabase
      .from('documents')
      .select('*')
      .eq('order_id', orderId)
      .eq('is_deliverable', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch deliverables error:', error)
      return NextResponse.json({ deliverables: [] })
    }

    // Add public URLs
    const deliverablesWithUrls = (deliverables || []).map((doc: { file_url: string; [key: string]: unknown }) => ({
      ...doc,
      publicUrl: supabase.storage.from('documents').getPublicUrl(doc.file_url).data.publicUrl
    }))

    return NextResponse.json({ deliverables: deliverablesWithUrls })

  } catch (error) {
    console.error('Error fetching deliverables:', error)
    return NextResponse.json({ deliverables: [] })
  }
}
