// lib/workflow/order-status.ts
// D4 v5 Task A-4 — OrderStatus state machine definition
// D4 owns: TypeScript type, STATUS_DISPLAY_MAP, toDbStatus(), isTerminalState()
// D6 owns: VALID_TRANSITIONS, updateOrderStatus() (imported from lib/orders/status-machine.ts)

import type { OrderStatus } from '@/lib/types/shared-interfaces';

// Re-export for D4 consumers
export type { OrderStatus } from '@/lib/types/shared-interfaces';
export { isTerminalState, isCancelledStatus } from '@/lib/types/shared-interfaces';

// Import from D6 canonical (SP-3). DO NOT create local copy.
export { updateOrderStatus } from '@/lib/orders/status-machine';
export { VALID_TRANSITIONS } from '@/lib/config/status-transitions';

// Customer-facing status mapping (internal → dashboard display)
// DB stores compact names; TypeScript uses verbose names; dashboard uses display names
export const STATUS_DISPLAY_MAP: Record<OrderStatus, string> = {
  'INTAKE': 'PAID',
  'PROCESSING': 'IN_PROGRESS',
  'AWAITING_OPUS': 'IN_PROGRESS',        // Customer sees no difference
  'HOLD_PENDING': 'HOLD_PENDING',
  'PROTOCOL_10_EXIT': 'IN_PROGRESS',     // Transient
  'UPGRADE_PENDING': 'UPGRADE_PENDING',  // Amber badge (v5-XDC-012)
  'PENDING_CONFLICT_REVIEW': 'PENDING_CONFLICT_REVIEW', // Amber badge (DELTA-001)
  'AWAITING_APPROVAL': 'AWAITING_APPROVAL',
  'REVISION_REQUESTED': 'REVISION_REQ',  // Purple badge
  'COMPLETED': 'COMPLETED',
  'CANCELLED_USER': 'CANCELLED',
  'CANCELLED_SYSTEM': 'CANCELLED',
  'CANCELLED_CONFLICT': 'CANCELLED',
  'DISPUTED': 'DISPUTED',               // Red badge (DELTA-003)
  'REFUNDED': 'REFUNDED',               // Gray badge (DELTA-003)
  'FAILED': 'FAILED',
};

// DB value helper: converts TypeScript status to DB-safe value
// DB uses compact names for CHECK constraint compatibility
export function toDbStatus(status: OrderStatus): string {
  switch (status) {
    case 'REVISION_REQUESTED': return 'REVISION_REQ';
    case 'CANCELLED_USER':
    case 'CANCELLED_SYSTEM':
    case 'CANCELLED_CONFLICT':
      return 'CANCELLED';
    default:
      return status;
  }
}

// Which cancellation variant to use (D7-CORR-004 reference):
// CANCELLED_USER: customer-initiated (CP3 cancel, self-service cancel)
// CANCELLED_SYSTEM: system-initiated (timeout, cost cap exit, upgrade timeout)
// CANCELLED_CONFLICT: conflict check cancellation (7-day auto-cancel)
export type CancellationType = 'CANCELLED_USER' | 'CANCELLED_SYSTEM' | 'CANCELLED_CONFLICT';
