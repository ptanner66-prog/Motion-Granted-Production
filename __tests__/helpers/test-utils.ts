// /__tests__/helpers/test-utils.ts
// Test utilities for Motion Granted integration tests
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export { supabase };

/**
 * Generate a unique test ID
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Create a test user for integration tests
 */
export async function createTestUser(email?: string): Promise<string> {
  const testEmail = email || `test-${Date.now()}@motiongranted.test`;

  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'TestPassword123!',
    email_confirm: true,
  });

  if (error) throw error;
  return data.user.id;
}

/**
 * Clean up test user
 */
export async function deleteTestUser(userId: string): Promise<void> {
  await supabase.auth.admin.deleteUser(userId);
}

/**
 * Assert that a value is defined
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to be defined');
  }
}

/**
 * Create a mock order for testing
 */
export interface MockOrderOptions {
  motion_type?: string;
  filing_posture?: 'INITIATING' | 'RESPONDING';
  path?: 'A' | 'B';
  jurisdiction?: string;
  case_number?: string;
  status?: string;
  user_id?: string;
}

export async function createMockOrder(options: MockOrderOptions = {}) {
  const orderId = generateTestId('order');

  const order = {
    id: orderId,
    user_id: options.user_id || generateTestId('user'),
    motion_type: options.motion_type || 'motion_to_continue',
    filing_posture: options.filing_posture || 'INITIATING',
    path: options.path || 'A',
    jurisdiction: options.jurisdiction || 'CA_STATE_LA',
    case_number: options.case_number || '24STCV' + Date.now(),
    status: options.status || 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single();

  if (error) throw new Error(`Failed to create mock order: ${error.message}`);
  return data;
}

/**
 * Clean up mock orders by prefix
 */
export async function cleanupMockOrders(prefix: string = 'order-'): Promise<void> {
  await supabase
    .from('orders')
    .delete()
    .like('id', `${prefix}%`);
}

/**
 * Delay execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries - 1) {
        await delay(initialDelay * Math.pow(2, i));
      }
    }
  }

  throw lastError;
}
