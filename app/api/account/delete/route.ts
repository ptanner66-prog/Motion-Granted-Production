/**
 * Account Deletion API Route (GDPR/CCPA compliance)
 *
 * DELETE /api/account/delete
 *
 * Deletes the authenticated user's account and all associated data.
 * Requires confirmation string in request body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require explicit confirmation
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Must include confirmDelete: "DELETE MY ACCOUNT"' },
        { status: 400 }
      );
    }
    if (!body.confirmDelete || body.confirmDelete !== 'DELETE MY ACCOUNT') {
      return NextResponse.json(
        { error: 'Must include confirmDelete: "DELETE MY ACCOUNT" in request body' },
        { status: 400 }
      );
    }

    const userId = user.id;
    const userEmail = user.email;
    console.log('[account/delete] Starting account deletion for user:', userId);

    // Use service role client for cascade deletion (bypasses RLS)
    const adminSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Get user's orders for cascading deletion
    const { data: orders } = await adminSupabase
      .from('orders')
      .select('id')
      .eq('client_id', userId);

    const orderIds = (orders || []).map(o => o.id);

    // 2. Delete user's documents from storage
    if (orderIds.length > 0) {
      const { data: docs } = await adminSupabase
        .from('documents')
        .select('storage_path')
        .in('order_id', orderIds);

      if (docs && docs.length > 0) {
        const paths = docs.map(d => d.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await adminSupabase.storage
            .from('documents')
            .remove(paths as string[])
            .catch(err => console.warn('[account/delete] Storage cleanup partial:', err));
        }
      }
    }

    // 3. Delete data from tables (order matters for FK constraints)
    // Tables with direct user_id references to auth.users
    const directUserTables: Array<{ table: string; column: string }> = [
      { table: 'login_attempts', column: 'user_id' },
      { table: 'user_sessions', column: 'user_id' },
      { table: 'security_events', column: 'user_id' },
      { table: 'activity_logs', column: 'user_id' },
      { table: 'email_log', column: 'user_id' },
      { table: 'document_downloads', column: 'user_id' },
      { table: 'customer_feedback', column: 'user_id' },
      { table: 'feedback_requests', column: 'user_id' },
      { table: 'ai_disclosure_acceptances', column: 'user_id' },
      { table: 'email_action_tokens', column: 'user_id' },
      { table: 'download_events', column: 'user_id' },
    ];

    for (const { table, column } of directUserTables) {
      const { error } = await adminSupabase
        .from(table)
        .delete()
        .eq(column, userId);

      if (error && !error.message.includes('does not exist') && !error.code?.includes('42P01')) {
        console.warn(`[account/delete] Error deleting from ${table}:`, error.message);
      }
    }

    // 4. Delete order-dependent data (child records first)
    if (orderIds.length > 0) {
      const orderChildTables = [
        'conversation_messages',
        'conversations',
        'notification_queue',
        'revision_requests',
        'order_citations',
        'order_notes',
        'order_feedback',
        'automation_logs',
        'automation_tasks',
        'checkpoint_events',
        'workflow_events',
        'workflow_phase_executions',
        'order_workflows',
        'documents',
        'parties',
        'change_orders',
        'messages',
        'conflict_matches',
        'approval_queue',
      ];

      for (const table of orderChildTables) {
        const { error } = await adminSupabase
          .from(table)
          .delete()
          .in('order_id', orderIds);

        if (error && !error.message.includes('does not exist') && !error.code?.includes('42P01')) {
          console.warn(`[account/delete] Error deleting from ${table}:`, error.message);
        }
      }

      // Delete refunds (references order_id)
      await adminSupabase
        .from('refunds')
        .delete()
        .in('order_id', orderIds)
        .then(({ error }) => {
          if (error && !error.code?.includes('42P01')) {
            console.warn('[account/delete] Error deleting refunds:', error.message);
          }
        });

      // Delete orders themselves
      const { error: ordersError } = await adminSupabase
        .from('orders')
        .delete()
        .eq('client_id', userId);

      if (ordersError) {
        console.warn('[account/delete] Error deleting orders:', ordersError.message);
      }
    }

    // 5. Delete the user profile
    const { error: profileError } = await adminSupabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.warn('[account/delete] Error deleting profile:', profileError.message);
    }

    // 6. Delete the auth user
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('[account/delete] Failed to delete auth user:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete account. Please contact support.' },
        { status: 500 }
      );
    }

    console.log('[account/delete] Account deleted successfully:', userId);

    // 7. Send confirmation email (best effort)
    if (userEmail && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Motion Granted <noreply@motiongranted.com>',
          to: userEmail,
          subject: 'Account Deleted — Motion Granted',
          html: `<p>Your Motion Granted account has been deleted. All your data has been removed from our systems.</p>
                 <p>If you did not request this, please contact support immediately at support@motiongranted.com.</p>`,
        });
      } catch (emailErr) {
        console.warn('[account/delete] Confirmation email failed:', emailErr);
      }
    }

    return NextResponse.json({ success: true, message: 'Account and all associated data deleted' });
  } catch (err) {
    console.error('[account/delete] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
