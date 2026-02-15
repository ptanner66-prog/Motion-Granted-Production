/**
 * CCPA/CPRA Data Export Endpoint (SP-15, Task 14)
 *
 * GET /api/account/export
 *
 * Returns all personal data Motion Granted stores about the authenticated user
 * as a downloadable JSON file. Required by CCPA/CPRA for California residents.
 *
 * Data included:
 *   - Profile (name, email, role, created_at)
 *   - Orders (metadata only — no draft content)
 *   - Citations (verified citations for user's orders)
 *   - Documents (metadata only — file content excluded to protect third-party PII)
 *   - Conversations (metadata only — generated motion text excluded)
 *
 * File content is NOT included because documents may contain opposing parties' PII.
 * Users can download individual files through the dashboard.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-account-export');

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;
    log.info('CCPA data export requested', { userId });

    // Gather all user data in parallel
    const [
      profileResult,
      ordersResult,
      documentsResult,
      conversationsResult,
      partiesResult,
      feedbackResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, role, phone, bar_number, firm_name, created_at, updated_at')
        .eq('id', userId)
        .single(),
      supabase
        .from('orders')
        .select('id, order_number, motion_type, status, jurisdiction, court_name, case_number, rush_level, created_at, updated_at, completed_at')
        .eq('client_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('documents')
        .select('id, name, type, mime_type, size_bytes, created_at, order_id')
        .eq('uploaded_by', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('conversations')
        .select('id, order_id, status, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('parties')
        .select('id, name, role, order_id, created_at')
        .in('order_id', (
          await supabase
            .from('orders')
            .select('id')
            .eq('client_id', userId)
        ).data?.map((o: { id: string }) => o.id) || []),
      supabase
        .from('customer_feedback')
        .select('id, rating, feedback_text, created_at, order_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    // Get citation data for user's orders
    const orderIds = (ordersResult.data || []).map((o: { id: string }) => o.id);
    let citationsData: unknown[] = [];
    if (orderIds.length > 0) {
      const { data: citations } = await supabase
        .from('verified_citations')
        .select('id, citation_text, verification_status, court, year, created_at, order_id')
        .in('order_id', orderIds);
      citationsData = citations || [];
    }

    const exportData = {
      _meta: {
        export_date: new Date().toISOString(),
        format_version: '1.0',
        description: 'Motion Granted personal data export per CCPA/CPRA',
        note: 'Document file content is not included. Download files individually from your dashboard.',
      },
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
      profile: profileResult.data || null,
      orders: ordersResult.data || [],
      documents: (documentsResult.data || []).map((d: Record<string, unknown>) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        mime_type: d.mime_type,
        size_bytes: d.size_bytes,
        created_at: d.created_at,
        order_id: d.order_id,
        // File content NOT included — may contain third-party PII
      })),
      parties: partiesResult.data || [],
      citations: citationsData,
      conversations: (conversationsResult.data || []).map((c: Record<string, unknown>) => ({
        id: c.id,
        order_id: c.order_id,
        status: c.status,
        created_at: c.created_at,
        updated_at: c.updated_at,
        // Generated motion text NOT included — contains attorney-client privileged content
      })),
      feedback: feedbackResult.data || [],
    };

    const dateStr = new Date().toISOString().split('T')[0];

    log.info('CCPA data export completed', {
      userId,
      orders: (ordersResult.data || []).length,
      documents: (documentsResult.data || []).length,
      citations: citationsData.length,
    });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="motion-granted-data-export-${dateStr}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    log.error('CCPA data export failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to generate data export' },
      { status: 500 }
    );
  }
}
