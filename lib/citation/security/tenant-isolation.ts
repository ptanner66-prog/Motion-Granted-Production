/**
 * Citation Tenant Isolation (D3-004, SP-19 Block 1)
 *
 * Ensures verification results are scoped to the requesting order.
 * Prevents citation data from Order A leaking into Order B's results.
 */
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/logging/logger';

const logger = createLogger('citation-tenant-isolation');

/**
 * Validate that a citation belongs to the specified order.
 * Returns false (and logs an error) on ownership mismatch or lookup failure.
 */
export async function validateCitationOwnership(
  citationId: string,
  orderId: string
): Promise<boolean> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('citation_verifications')
    .select('order_id')
    .eq('id', citationId)
    .single();

  if (error || !data) {
    logger.warn('Citation ownership lookup failed', {
      citationId,
      orderId,
      error: error?.message,
    });
    return false;
  }

  if (data.order_id !== orderId) {
    logger.error('Citation tenant isolation violation', {
      citationId,
      requestingOrder: orderId,
      owningOrder: data.order_id,
    });
    return false;
  }

  return true;
}

/**
 * Returns a filter object that scopes any citation query to a single order.
 * Use this when building Supabase queries to enforce tenant boundaries.
 */
export function scopeCitationQuery(orderId: string): { order_id: string } {
  return { order_id: orderId };
}
