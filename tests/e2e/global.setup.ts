import { test as setup, expect } from '@playwright/test';
import { TEST_USER, TEST_ADMIN, AUTH_FILE, ADMIN_AUTH_FILE } from './fixtures/auth.fixture';
import fs from 'fs';
import path from 'path';

/**
 * Global Setup for Playwright Tests
 *
 * This setup runs before all tests and creates authenticated sessions
 * that can be reused across test files for faster execution.
 */

// Ensure auth directory exists
const authDir = path.join(process.cwd(), 'playwright', '.auth');

setup.beforeAll(async () => {
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
});

/**
 * Setup: Authenticate as regular user
 */
setup('authenticate as user', async ({ page }) => {
  // Skip if credentials are not configured
  if (!TEST_USER.email || TEST_USER.email === 'test@example.com') {
    console.log('Skipping user auth setup - TEST_USER credentials not configured');
    return;
  }

  try {
    // Navigate to login page
    await page.goto('/login');

    // Fill in credentials
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);

    // Submit the form
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for successful navigation
    await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30000 });

    // Save the authenticated state
    await page.context().storageState({ path: AUTH_FILE });

    console.log('User authentication state saved to', AUTH_FILE);
  } catch (error) {
    console.error('Failed to authenticate as user:', error);
    // Don't throw - allow tests to handle auth themselves
  }
});

/**
 * Setup: Authenticate as admin user
 */
setup('authenticate as admin', async ({ page }) => {
  // Skip if credentials are not configured
  if (!TEST_ADMIN.email || TEST_ADMIN.email === 'admin@motion-granted.com') {
    console.log('Skipping admin auth setup - TEST_ADMIN credentials not configured');
    return;
  }

  try {
    // Navigate to login page
    await page.goto('/login');

    // Fill in credentials
    await page.getByLabel('Email').fill(TEST_ADMIN.email);
    await page.getByLabel('Password').fill(TEST_ADMIN.password);

    // Submit the form
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for successful navigation to admin
    await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });

    // Save the authenticated state
    await page.context().storageState({ path: ADMIN_AUTH_FILE });

    console.log('Admin authentication state saved to', ADMIN_AUTH_FILE);
  } catch (error) {
    console.error('Failed to authenticate as admin:', error);
    // Don't throw - allow tests to handle auth themselves
  }
});
