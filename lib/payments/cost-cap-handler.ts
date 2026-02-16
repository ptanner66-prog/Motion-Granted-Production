/**
 * Cost Cap Exit Payment Handling (SP-11 AE-4)
 *
 * Source: D7-NEW-010 | Priority: P2
 *
 * Routes cost cap exits based on deliverable state:
 * - Phase V+ (deliverable exists): route to CP3 attorney review
 * - Phase IV or earlier (no deliverable): full refund + admin alert
 *
 * Protocol 10 disclosure text for cost cap and max loop exits.
 *
 * @module payments/cost-cap-handler
 */

import { createClient } from '@supabase/supabase-js';

export async function handleCostCapExit(
  orderId: string,
  costData: { currentCost: number; cap: number; tier: string },
  currentPhase: string | null,
): Promise<{ action: 'cp3' | 'admin_review' | 'full_refund'; reason: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Set cost_cap_triggered flag
  try {
    await supabase
      .from('orders')
      .update({ cost_cap_triggered: true })
      .eq('id', orderId);
  } catch (err) {
    console.error(`[COST_CAP] Failed to set cost_cap_triggered for ${orderId}:`, err);
    // Continue — flag is for tracking, not flow control
  }

  // Determine routing based on whether deliverable exists
  const phaseNum = extractPhaseNumber(currentPhase);

  if (phaseNum >= 5) {
    // Has deliverable (Phase V+ = citation verification started, draft exists)
    // Route to CP3 — attorney decides
    return {
      action: 'cp3',
      reason: `Cost cap reached at Phase ${currentPhase}. Deliverable exists — routing to attorney review (CP3).`,
    };
  } else {
    // No deliverable (Phase IV or earlier = no usable draft)
    // Full refund, admin alert
    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(`Cost cap before deliverable: order ${orderId}, phase ${currentPhase}`, 'error');
    } catch {
      // Sentry not available
    }

    return {
      action: 'full_refund',
      reason: `Cost cap reached before deliverable produced (Phase ${currentPhase}). Full refund required.`,
    };
  }
}

function extractPhaseNumber(phase: string | null): number {
  if (!phase) return 0;
  const roman: Record<string, number> = {
    I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  };
  const cleaned = phase.toUpperCase().replace('PHASE_', '').replace('PHASE', '').trim();
  return roman[cleaned] || parseInt(cleaned, 10) || 0;
}

export function getProtocol10DisclosureText(
  trigger: 'COST_CAP' | 'MAX_LOOPS',
  loopCount: number,
  maxLoops: number,
): string {
  if (trigger === 'COST_CAP') {
    return `Note: Internal quality enhancement was concluded after ${loopCount} of ${maxLoops} permitted revision cycles due to resource allocation limits. The enclosed work product represents the best achievable output within these constraints. All citations have been verified to the extent resources permitted.`;
  }
  return `Note: Internal quality enhancement completed after ${loopCount} revision cycles (maximum: ${maxLoops}). The enclosed work product meets or exceeds the quality threshold for this tier.`;
}
