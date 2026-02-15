import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/notifications/read-all
 *
 * Mark all notifications as read for the authenticated user.
 * This is a stub — we don't have a dedicated notifications table yet,
 * so we simply return success. When a notifications table is added,
 * this endpoint will update the `read` flag for all user notifications.
 */
export async function PATCH() {
  try {
    const supabase = await createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Stub: return success immediately
    // In the future, this would update a notifications table:
    //   await supabase
    //     .from('notifications')
    //     .update({ read: true })
    //     .eq('user_id', user.id)
    //     .eq('read', false);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
