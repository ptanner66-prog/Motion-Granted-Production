import { test as base, type Page, type BrowserContext } from '@playwright/test';

/**
 * Test User Credentials
 *
 * These should be configured via environment variables for security.
 * For local testing, you can set these in a .env.test file.
 */
export const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || 'test@example.com',
  password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
  name: 'Test User',
};

export const TEST_ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'admin@motion-granted.com',
  password: process.env.TEST_ADMIN_PASSWORD || 'AdminPassword123!',
  name: 'Test Admin',
};

/**
 * Extended test fixtures with authentication helpers
 */
export interface AuthFixtures {
  /** Authenticated page for regular user */
  authenticatedPage: Page;
  /** Authenticated page for admin user */
  adminPage: Page;
  /** Login helper function */
  login: (page: Page, email: string, password: string) => Promise<void>;
  /** Logout helper function */
  logout: (page: Page) => Promise<void>;
}

/**
 * Helper function to perform login
 */
async function performLogin(page: Page, email: string, password: string): Promise<void> {
  // Navigate to login page
  await page.goto('/login');

  // Wait for the login form to be visible
  await page.waitForSelector('form');

  // Fill in credentials
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);

  // Submit the form
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for navigation to complete (either dashboard or admin)
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 30000 });
}

/**
 * Helper function to perform logout
 */
async function performLogout(page: Page): Promise<void> {
  // Look for user menu/dropdown and click logout
  // This may vary based on your UI implementation
  const userMenuButton = page.getByRole('button', { name: /account|profile|menu/i }).first();

  if (await userMenuButton.isVisible()) {
    await userMenuButton.click();
    await page.getByRole('menuitem', { name: /log\s?out|sign\s?out/i }).click();
  } else {
    // Fallback: try to find a direct logout link/button
    const logoutButton = page.getByRole('button', { name: /log\s?out|sign\s?out/i }).first();
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    } else {
      // Last resort: navigate to a logout endpoint
      await page.goto('/api/auth/signout');
    }
  }

  // Wait for redirect to login page
  await page.waitForURL(/\/(login)?$/, { timeout: 15000 });
}

/**
 * Extended test with authentication fixtures
 */
export const test = base.extend<AuthFixtures>({
  // Login helper function
  login: async ({}, use) => {
    await use(performLogin);
  },

  // Logout helper function
  logout: async ({}, use) => {
    await use(performLogout);
  },

  // Authenticated page for regular user
  authenticatedPage: async ({ browser }, use) => {
    // Create a new context for isolation
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Perform login
      await performLogin(page, TEST_USER.email, TEST_USER.password);

      // Provide the authenticated page to the test
      await use(page);
    } finally {
      // Cleanup
      await context.close();
    }
  },

  // Authenticated page for admin user
  adminPage: async ({ browser }, use) => {
    // Create a new context for isolation
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Perform login as admin
      await performLogin(page, TEST_ADMIN.email, TEST_ADMIN.password);

      // Verify we're on admin page
      await page.waitForURL(/\/admin/, { timeout: 30000 });

      // Provide the authenticated page to the test
      await use(page);
    } finally {
      // Cleanup
      await context.close();
    }
  },
});

export { expect } from '@playwright/test';

/**
 * Storage state file path for authenticated sessions
 * Use this with storageState option for faster test execution
 */
export const AUTH_FILE = 'playwright/.auth/user.json';
export const ADMIN_AUTH_FILE = 'playwright/.auth/admin.json';

/**
 * Create a persistent authenticated session
 * Use this in a setup project to avoid re-authentication
 */
export async function createAuthenticatedSession(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
  storageFile: string
): Promise<void> {
  await performLogin(page, email, password);

  // Save the authenticated state
  await context.storageState({ path: storageFile });
}
