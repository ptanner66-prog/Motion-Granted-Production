// /app/api/orders/conflict-check/route.ts
// Pre-payment conflict check endpoint
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runPrePaymentConflictCheck, validateParties, parsePartyInput } from '@/lib/intake/conflict-integration';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-orders-conflict-check');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      orderId,
      caseNumber,
      jurisdiction,
      plaintiffs,      // Can be string (comma-separated) or array
      defendants,      // Can be string (comma-separated) or array
      attorneySide,
    } = body;

    // Validate required fields
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    if (!caseNumber) {
      return NextResponse.json({ error: 'Case number required' }, { status: 400 });
    }

    // Verify user owns this order
    const { data: order } = await supabase
      .from('orders')
      .select('user_id, status')
      .eq('id', orderId)
      .single();

    if (!order || order.user_id !== user.id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Parse parties (handle both string and array inputs)
    const parsedPlaintiffs = Array.isArray(plaintiffs) ? plaintiffs : parsePartyInput(plaintiffs || '');
    const parsedDefendants = Array.isArray(defendants) ? defendants : parsePartyInput(defendants || '');

    const parties = {
      plaintiffs: parsedPlaintiffs,
      defendants: parsedDefendants,
      attorneySide: attorneySide as 'PLAINTIFF' | 'DEFENDANT',
    };

    // Validate parties
    const validation = validateParties(parties);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Run conflict check
    const result = await runPrePaymentConflictCheck(
      orderId,
      caseNumber,
      jurisdiction || '',
      parties,
      user.id
    );

    return NextResponse.json({
      success: true,
      canProceed: result.canProceed,
      requiresReview: result.requiresReview || false,
      message: result.blockReason,
      conflictSeverity: result.conflictResult?.severity,
      matchCount: result.conflictResult?.matches?.length || 0,
    });
  } catch (error) {
    log.error('Conflict check error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Conflict check failed' }, { status: 500 });
  }
}
