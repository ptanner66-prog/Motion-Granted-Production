/**
 * Dev Timeout Simulation Endpoint (SP-11 AG-2)
 *
 * Source: D7-NEW-013 | Priority: ADVISORY
 *
 * Simulates various timeout scenarios for testing:
 * - 48h, 72h, 14d CP3 reminders
 * - 21d CP3 auto-cancel with 50% refund
 * - conflict_7d auto-cancel
 *
 * Production guard: returns 404 (not 403) to avoid revealing endpoint exists.
 *
 * @module api/dev/simulate-timeout
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Production guard — return 404 (not 403) to avoid revealing endpoint exists
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({}, { status: 404 });
  }

  let body: { orderId?: string; timeoutType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { orderId, timeoutType } = body;

  if (!orderId || !timeoutType) {
    return NextResponse.json(
      { error: 'orderId and timeoutType required' },
      { status: 400 },
    );
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: order } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const validStates: Record<string, string[]> = {
    '48h': ['awaiting_approval'],
    '72h': ['awaiting_approval'],
    '14d': ['awaiting_approval'],
    '21d': ['awaiting_approval'],
    'conflict_7d': ['pending_conflict_review'],
  };

  const expected = validStates[timeoutType];
  if (!expected || !expected.includes(order.status)) {
    return NextResponse.json(
      { error: `Order is in ${order.status} status. Expected: ${expected?.join(' or ') || 'unknown timeoutType'}` },
      { status: 400 },
    );
  }

  try {
    switch (timeoutType) {
      case '48h':
        await import('@/lib/email/cp3-reminders').then(m => m.send48hReminder(orderId));
        break;
      case '72h':
        await import('@/lib/email/cp3-reminders').then(m => m.send72hReminder(orderId));
        break;
      case '14d':
        await import('@/lib/email/cp3-reminders').then(m => m.sendFinalNotice(orderId));
        break;
      case '21d':
        await import('@/lib/payments/cp3-timeout').then(m => m.executeCP3Timeout(orderId));
        break;
      case 'conflict_7d':
        // Simulate the conflict auto-cancel directly
        await supabase.from('orders').update({
          status: 'CANCELLED',
          conflict_notes: `${order.status} | Simulated 7-day timeout via dev endpoint.`,
          updated_at: new Date().toISOString(),
        }).eq('id', orderId);
        break;
    }

    return NextResponse.json({ success: true, timeoutType, orderId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
