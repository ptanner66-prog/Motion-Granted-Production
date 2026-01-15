/**
 * Application Constants
 * Centralized location for all magic numbers, strings, and configuration values
 */

// Order Statuses
export const ORDER_STATUS = {
  SUBMITTED: 'submitted',
  IN_PROGRESS: 'in_progress',
  UNDER_REVIEW: 'under_review',
  REQUIRES_REVISION: 'requires_revision',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS]

// Order Status Display Configuration
export const ORDER_STATUS_CONFIG = {
  [ORDER_STATUS.SUBMITTED]: { label: 'Submitted', color: 'blue' },
  [ORDER_STATUS.IN_PROGRESS]: { label: 'In Progress', color: 'yellow' },
  [ORDER_STATUS.UNDER_REVIEW]: { label: 'Under Review', color: 'purple' },
  [ORDER_STATUS.REQUIRES_REVISION]: { label: 'Requires Revision', color: 'orange' },
  [ORDER_STATUS.APPROVED]: { label: 'Approved', color: 'green' },
  [ORDER_STATUS.COMPLETED]: { label: 'Completed', color: 'green' },
  [ORDER_STATUS.CANCELLED]: { label: 'Cancelled', color: 'red' },
} as const

// File Upload Configuration
export const FILE_UPLOAD = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB in bytes
  MAX_SIZE_MB: 50,
  ALLOWED_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
  ],
  ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif'],
} as const

// Contact Information
export const CONTACT = {
  EMAIL: 'support@motiongranted.com',
  PHONE: '(555) 123-4567',
} as const

// Retry Configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 500,
  BACKOFF_MULTIPLIER: 2,
} as const

// Validation Rules
export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 8,
  MIN_STATEMENT_LENGTH: 100,
  MIN_PROCEDURAL_HISTORY_LENGTH: 50,
  MIN_INSTRUCTIONS_LENGTH: 50,
} as const

// URL Configuration
export const APP_ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  ADMIN: '/admin',
  ORDERS: '/orders',
  SETTINGS: '/settings',
} as const

// Turnaround Options
export const TURNAROUND = {
  STANDARD_5: 'standard_5',
  RUSH_72: 'rush_72',
  RUSH_48: 'rush_48',
} as const

export const TURNAROUND_DAYS = {
  [TURNAROUND.STANDARD_5]: 5,
  [TURNAROUND.RUSH_72]: 3,
  [TURNAROUND.RUSH_48]: 2,
} as const

// Motion Types
export const MOTION_TYPE = {
  SUMMARY_JUDGMENT: 'summary_judgment',
  DISMISS: 'dismiss',
  COMPEL: 'compel',
  PROTECTIVE_ORDER: 'protective_order',
  SANCTIONS: 'sanctions',
  RECONSIDERATION: 'reconsideration',
  IN_LIMINE: 'in_limine',
  CONTINUANCE: 'continuance',
  OTHER: 'other',
} as const

// Document Types
export const DOCUMENT_TYPE = {
  COMPLAINT: 'complaint',
  ANSWER: 'answer',
  DISCOVERY: 'discovery',
  DEPOSITION: 'deposition',
  PRIOR_MOTION: 'prior_motion',
  EXHIBIT: 'exhibit',
  OTHER: 'other',
} as const

// User Roles
export const USER_ROLE = {
  CLIENT: 'client',
  ADMIN: 'admin',
  CLERK: 'clerk',
} as const

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE]
