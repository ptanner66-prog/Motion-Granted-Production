// /app/api/conflicts/check/route.ts
// API route for running conflict checks
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runConflictCheck, getConflictCheckResult } from '@/lib/services/conflict/conflict-check-service';
import { ConflictCheckRequest, PartyInfo } from '@/types/conflict';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-conflicts-check');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, parties, caseNumber, courtName } = body;

    // Validate required fields
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    if (!parties || !Array.isArray(parties) || parties.length === 0) {
      return NextResponse.json({ error: 'parties array is required' }, { status: 400 });
    }

    // Validate party structure
    for (const party of parties) {
      if (!party.name || !party.role) {
        return NextResponse.json(
          { error: 'Each party must have name and role' },
          { status: 400 }
        );
      }
    }

    // Get client ID from order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('client_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verify user has access to this order
    const { data: client } = await supabase
      .from('clients')
      .select('user_id')
      .eq('id', order.client_id)
      .single();

    const isAdmin = await checkAdminRole(supabase, user.id);
    if (!isAdmin && client?.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build conflict check request
    const checkRequest: ConflictCheckRequest = {
      orderId,
      clientId: order.client_id,
      parties: parties.map((p: { name: string; role: string; aliases?: string[] }) => ({
        name: p.name,
        normalizedName: '', // Will be calculated by service
        role: p.role as PartyInfo['role'],
        aliases: p.aliases,
      })),
      caseNumber,
      courtName,
    };

    // Run conflict check
    const result = await runConflictCheck(checkRequest);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      conflictId: result.conflictId,
      result: result.result,
    });
  } catch (error) {
    log.error('Conflict check error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('client_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('user_id')
      .eq('id', order.client_id)
      .single();

    const isAdmin = await checkAdminRole(supabase, user.id);
    if (!isAdmin && client?.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get conflict check result
    const result = await getConflictCheckResult(orderId);

    if (!result) {
      return NextResponse.json({ result: null, message: 'No conflict check found' });
    }

    return NextResponse.json({ result });
  } catch (error) {
    log.error('Conflict check error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function checkAdminRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  return data?.role === 'admin' || data?.role === 'super_admin';
}
