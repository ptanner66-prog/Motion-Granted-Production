/**
 * CP3 Timeout Auto-Cancel Stub — SP-6 Email Hardening
 *
 * Handles the 21-day CP3 timeout: auto-cancels the order
 * and issues a 50% refund. Stub implementation to unblock
 * build while full logic is wired in SP-6.
 *
 * @module lib/payments/cp3-timeout
 */

import { createLogger } from '@/lib/security/logger';

const log = createLogger('payments-cp3-timeout');

/**
 * Execute 21-day CP3 timeout: cancel order + 50% refund.
 * TODO: Wire to refund-service and email notification once SP-6 is merged.
 */
export async function executeCP3Timeout(orderId: string): Promise<void> {
  log.info('[CP3] 21d auto-cancel/refund stub called', { orderId });
}
