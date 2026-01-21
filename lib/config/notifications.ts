/**
 * Notification Configuration
 *
 * Centralized configuration for notification settings.
 * Override via environment variables in production.
 */

// Admin notification email - override with ADMIN_EMAIL env var
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@motiongranted.com';

// Alert email for system failures - override with ALERT_EMAIL env var
export const ALERT_EMAIL = process.env.ALERT_EMAIL || ADMIN_EMAIL;

// From addresses for different email types
export const EMAIL_FROM = {
  notifications: 'Motion Granted <noreply@motiongranted.com>',
  alerts: 'Motion Granted Alerts <alerts@motiongranted.com>',
  support: 'Motion Granted Support <support@motiongranted.com>',
};

// Notification priorities
export const NOTIFICATION_PRIORITY = {
  critical: 10,
  high: 8,
  normal: 5,
  low: 2,
} as const;
