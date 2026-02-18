// /app/api/email-actions/[token]/route.ts
// Handle one-click actions from email links
// Per Task 78 — PORTER_TASK_LIST_ADDENDUM_SIGNED_URLS_01282026.md
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { validateActionToken, type ActionType } from '@/lib/email/action-tokens';
import { resumeFromHold } from '@/lib/workflow/hold-service';
import { submitConflictDecision } from '@/lib/services/conflict/conflict-admin-service';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-email-actions');

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://motion-granted.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.redirect(`${BASE_URL}/error?message=Missing%20token`);
  }

  const result = await validateActionToken(token);

  if (!result.valid) {
    const encodedError = encodeURIComponent(result.error);
    return NextResponse.redirect(`${BASE_URL}/error?message=${encodedError}`);
  }

  const { data } = result;

  try {
    const redirectUrl = await handleAction(data.action, data.orderId, data.userId, data.metadata);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    log.error('Error handling email action', { error: error instanceof Error ? error.message : error });
    const encodedError = encodeURIComponent('Action failed. Please try again or contact support.');
    return NextResponse.redirect(`${BASE_URL}/error?message=${encodedError}`);
  }
}

async function handleAction(
  action: ActionType,
  orderId: string,
  userId: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  switch (action) {
    case 'resume_hold': {
      const result = await resumeFromHold(orderId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to resume order');
      }
      return `${BASE_URL}/orders/${orderId}?resumed=true`;
    }

    case 'approve_conflict': {
      const checkId = metadata?.checkId as string;
      if (!checkId) throw new Error('Missing conflict check ID');

      await submitConflictDecision({
        checkId,
        decision: 'APPROVE',
        reviewedBy: userId,
        reviewedAt: new Date(),
        notes: 'Approved via email link',
      });
      return `${BASE_URL}/orders/${orderId}?conflict=approved`;
    }

    case 'reject_conflict': {
      const checkId = metadata?.checkId as string;
      if (!checkId) throw new Error('Missing conflict check ID');

      await submitConflictDecision({
        checkId,
        decision: 'REJECT',
        reviewedBy: userId,
        reviewedAt: new Date(),
        notes: 'Rejected via email link',
      });
      return `${BASE_URL}/orders/${orderId}?conflict=rejected`;
    }

    case 'download': {
      return `${BASE_URL}/orders/${orderId}/download`;
    }

    case 'extend_retention': {
      // Redirect to retention management page
      return `${BASE_URL}/orders/${orderId}/retention?extend=true`;
    }

    case 'confirm_deletion': {
      // Redirect to deletion confirmation page
      return `${BASE_URL}/orders/${orderId}/retention?confirm_delete=true`;
    }

    default:
      return `${BASE_URL}/orders/${orderId}`;
  }
}
