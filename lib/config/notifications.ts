/**
 * Notification Configuration
 *
 * Centralized configuration for notification settings.
 * Override via environment variables in production.
 */

// Admin notification email - override with ADMIN_EMAIL env var
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@motion-granted.com';

// Alert email for system failures - override with ALERT_EMAIL env var
export const ALERT_EMAIL = process.env.ALERT_EMAIL || ADMIN_EMAIL;

// From addresses for different email types
export const EMAIL_FROM = {
  notifications: 'Motion Granted <noreply@motion-granted.com>',
  alerts: 'Motion Granted Alerts <alerts@motion-granted.com>',
  support: 'Motion Granted Support <support@motion-granted.com>',
};

// Notification priorities
export const NOTIFICATION_PRIORITY = {
  critical: 10,
  high: 8,
  normal: 5,
  low: 2,
} as const;
