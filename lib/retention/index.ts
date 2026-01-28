// lib/retention/index.ts
// Export all retention functions
// Version 1.0 — January 28, 2026

export {
  getRetentionStatus,
  setInitialRetention,
  extendRetention,
  getOrdersDueForReminder,
  markReminderSent,
  getExpiredOrders,
  type RetentionStatus,
  type RetentionExtendResult,
} from './retention-service';

export {
  deleteOrderData,
  type DeletionType,
  type DeleteResult,
} from './delete-order';

export { anonymizeOrderForAnalytics } from './anonymize';
