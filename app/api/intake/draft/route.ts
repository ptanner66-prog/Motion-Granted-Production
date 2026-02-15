import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/intake/draft
 * Returns the user's active intake draft (if any).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: draft } = await supabase
    .from('intake_drafts')
    .select('id, motion_type, form_data, current_step, total_steps, updated_at')
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json(
    { draft: draft || null },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

/**
 * POST /api/intake/draft
 * Create or update the user's intake draft.
 * Body: { motion_type, form_data, current_step }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { motion_type?: string; form_data?: Record<string, unknown>; current_step?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Check for existing draft
  const { data: existing } = await supabase
    .from('intake_drafts')
    .select('id')
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    // Update existing draft
    const { data: updated, error } = await supabase
      .from('intake_drafts')
      .update({
        motion_type: body.motion_type,
        form_data: body.form_data || {},
        current_step: body.current_step || 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 })
    }
    return NextResponse.json({ success: true, draftId: updated?.id })
  }

  // Create new draft
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { data: created, error } = await supabase
    .from('intake_drafts')
    .insert({
      user_id: user.id,
      motion_type: body.motion_type || '',
      form_data: body.form_data || {},
      current_step: body.current_step || 1,
      total_steps: 6,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
  }

  return NextResponse.json({ success: true, draftId: created?.id }, { status: 201 })
}

/**
 * DELETE /api/intake/draft
 * Delete the user's active draft (e.g., after successful payment).
 */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await supabase
    .from('intake_drafts')
    .delete()
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
