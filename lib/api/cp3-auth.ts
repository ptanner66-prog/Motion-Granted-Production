// lib/api/cp3-auth.ts
// D6 Directive 1 v2 — Shared CP3 authentication pattern
// All three CP3 routes (approve/cancel/request-changes) use this
// Resolves: C-001 (no phantom table), C-003 (workflowId from DB), ownership via client_id

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';

export interface CP3AuthContext {
  orderId: string;
  userId: string;
  order: {
    id: string;
    status: string;
    status_version: number;
    workflow_id: string;
    client_id: string;
    tier: string;
    amount_paid_cents: number;
    current_phase: string | null;
    attorney_email: string;
  };
  package: {
    id: string;
    status_version: number;
  };
  supabase: ReturnType<typeof getServiceSupabase>;
}

export async function authenticateCP3Request(
  req: NextRequest,
  orderId: string
): Promise<CP3AuthContext | NextResponse> {
  // Step 1: Authenticate via Supabase (NOT Clerk — Clerk is dead per R4-02)
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Fetch order + verify ownership (service client for elevated access)
  // [C-001] Query orders table directly — order_workflows does NOT exist
  // [C-003] workflowId comes from orders.workflow_id in DB, NEVER from client
  const serviceClient = getServiceSupabase();
  const { data: order, error: orderErr } = await serviceClient
    .from('orders')
    .select('id, status, status_version, workflow_id, client_id, tier, amount_paid_cents, current_phase, attorney_email')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Ownership check: client_id must match authenticated user
  if (order.client_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Step 3: Verify order is in AWAITING_APPROVAL
  if (order.status !== 'AWAITING_APPROVAL') {
    return NextResponse.json(
      { error: 'Order is not awaiting approval', currentStatus: order.status },
      { status: 409 }
    );
  }

  // Step 4: Fetch latest delivery_packages for status_version
  const { data: pkg, error: pkgErr } = await serviceClient
    .from('delivery_packages')
    .select('id, status_version')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (pkgErr || !pkg) {
    return NextResponse.json({ error: 'No delivery package found' }, { status: 404 });
  }

  return { orderId, userId: user.id, order, package: pkg, supabase: serviceClient };
}
