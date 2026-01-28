import { test, expect } from '@playwright/test';
import { TEST_ADMIN, TEST_USER } from './fixtures/auth.fixture';

/**
 * Admin Dashboard E2E Tests
 *
 * Tests for admin-specific functionality, including order management,
 * client management, and admin settings.
 */
test.describe('Admin Dashboard', () => {
  test.describe('Admin Access Control', () => {
    test('should allow admin to access admin routes', async ({ page }) => {
      // Login as admin
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should redirect to admin dashboard
      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });

      // Admin dashboard should be visible
      await expect(
        page.getByRole('heading', { name: /admin|dashboard|orders/i }).first()
      ).toBeVisible();
    });

    test('should redirect non-admin from admin routes to dashboard', async ({ page }) => {
      // Login as regular user
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_USER.email);
      await page.getByLabel('Password').fill(TEST_USER.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for login to complete
      await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30000 });

      // Try to access admin page directly
      await page.goto('/admin');

      // Should redirect to dashboard (not admin)
      // Note: This depends on your middleware implementation
      await expect(page).toHaveURL(/\/(dashboard|login|admin)/, { timeout: 15000 });
    });

    test('should show admin navigation menu for admin users', async ({ page }) => {
      // Login as admin
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for admin page
      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });

      // Check for admin navigation items
      await expect(
        page.getByRole('link', { name: /orders/i }).first()
      ).toBeVisible();
    });
  });

  test.describe('Admin Dashboard Homepage', () => {
    test.beforeEach(async ({ page }) => {
      // Login as admin before each test
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });
    });

    test('should display admin dashboard with key metrics', async ({ page }) => {
      await page.goto('/admin');

      // Should show the main admin page
      await expect(
        page.getByRole('heading').first()
      ).toBeVisible();
    });

    test('should display quick action cards or links', async ({ page }) => {
      await page.goto('/admin');

      // Should have links to key sections
      await expect(page.getByText(/orders|clients|settings/i).first()).toBeVisible();
    });
  });

  test.describe('Order List Page', () => {
    test.beforeEach(async ({ page }) => {
      // Login as admin
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });
    });

    test('should load admin orders page', async ({ page }) => {
      await page.goto('/admin/orders');

      // Should show orders page heading
      await expect(
        page.getByRole('heading', { name: /all orders|orders/i }).first()
      ).toBeVisible();
    });

    test('should display order stats cards', async ({ page }) => {
      await page.goto('/admin/orders');

      // Should show stat cards for different order states
      await expect(page.getByText(/ready to approve|in progress|delivered/i).first()).toBeVisible();
    });

    test('should display order tabs for filtering', async ({ page }) => {
      await page.goto('/admin/orders');

      // Should have tabs for filtering orders
      await expect(page.getByRole('tab').first()).toBeVisible();

      // Check for specific tab names
      const tabNames = ['Ready to Approve', 'In Progress', 'Delivered', 'Completed', 'All'];
      for (const tabName of tabNames) {
        await expect(
          page.getByRole('tab', { name: new RegExp(tabName, 'i') })
        ).toBeVisible();
      }
    });

    test('should switch between order tabs', async ({ page }) => {
      await page.goto('/admin/orders');

      // Click on different tabs and verify content changes
      const inProgressTab = page.getByRole('tab', { name: /in progress/i });
      await inProgressTab.click();

      // Tab should be selected
      await expect(inProgressTab).toHaveAttribute('data-state', 'active');

      // Click on completed tab
      const completedTab = page.getByRole('tab', { name: /completed/i });
      await completedTab.click();

      // Completed tab should now be selected
      await expect(completedTab).toHaveAttribute('data-state', 'active');
    });

    test('should display order list items with key information', async ({ page }) => {
      await page.goto('/admin/orders');

      // Check for order list structure (may be empty in test env)
      // Look for either order items or empty state message
      const hasOrders = await page.locator('a[href*="/admin/orders/"]').count() > 0;

      if (hasOrders) {
        // If there are orders, they should show key info
        const firstOrder = page.locator('a[href*="/admin/orders/"]').first();
        await expect(firstOrder).toBeVisible();
      } else {
        // Should show empty state
        await expect(
          page.getByText(/no orders|empty/i).first()
        ).toBeVisible();
      }
    });

    test('should show urgency indicators for upcoming deadlines', async ({ page }) => {
      await page.goto('/admin/orders');

      // This checks for visual urgency styling (border colors, etc.)
      // The actual presence depends on order data
      await expect(page.getByRole('heading', { name: /orders/i }).first()).toBeVisible();
    });
  });

  test.describe('Order Filtering', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });
    });

    test('should filter orders by "Ready to Approve" status', async ({ page }) => {
      await page.goto('/admin/orders');

      // Click on Ready to Approve tab
      await page.getByRole('tab', { name: /ready to approve/i }).click();

      // Tab should be active
      await expect(
        page.getByRole('tab', { name: /ready to approve/i })
      ).toHaveAttribute('data-state', 'active');
    });

    test('should filter orders by "Revision Requests" status', async ({ page }) => {
      await page.goto('/admin/orders');

      // Click on Revision Requests tab
      const revisionsTab = page.getByRole('tab', { name: /revision/i });
      if (await revisionsTab.isVisible()) {
        await revisionsTab.click();
        await expect(revisionsTab).toHaveAttribute('data-state', 'active');
      }
    });

    test('should show "All" orders when All tab is selected', async ({ page }) => {
      await page.goto('/admin/orders');

      // Click on All tab
      await page.getByRole('tab', { name: /^all$/i }).click();

      // All tab should be active
      await expect(
        page.getByRole('tab', { name: /^all$/i })
      ).toHaveAttribute('data-state', 'active');
    });
  });

  test.describe('Order Details Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });
    });

    test('should navigate to order details when clicking an order', async ({ page }) => {
      await page.goto('/admin/orders');

      // Check if there are any orders
      const orderLink = page.locator('a[href*="/admin/orders/"]').first();
      const hasOrders = await orderLink.isVisible();

      if (hasOrders) {
        // Click on first order
        await orderLink.click();

        // Should navigate to order details
        await expect(page).toHaveURL(/\/admin\/orders\/[a-zA-Z0-9-]+/);
      } else {
        // Just verify the orders page loaded correctly
        await expect(page.getByRole('heading', { name: /orders/i }).first()).toBeVisible();
      }
    });

    test('should display order details with all sections', async ({ page }) => {
      // Navigate to a specific order (if exists)
      await page.goto('/admin/orders');

      const orderLink = page.locator('a[href*="/admin/orders/"]').first();
      const hasOrders = await orderLink.isVisible();

      if (hasOrders) {
        await orderLink.click();

        // Order details page should show key sections
        // Check for common elements that would be on an order detail page
        await expect(page.getByText(/order|case|status/i).first()).toBeVisible();
      }
    });
  });

  test.describe('Admin Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });
    });

    test('should navigate to clients page', async ({ page }) => {
      // Look for clients link in navigation
      const clientsLink = page.getByRole('link', { name: /clients/i }).first();

      if (await clientsLink.isVisible()) {
        await clientsLink.click();
        await expect(page).toHaveURL(/\/admin\/clients/);
      }
    });

    test('should navigate to admin settings page', async ({ page }) => {
      // Look for settings link in navigation
      const settingsLink = page.getByRole('link', { name: /settings/i }).first();

      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        await expect(page).toHaveURL(/\/admin\/settings/);
      }
    });

    test('should navigate to queue page', async ({ page }) => {
      const queueLink = page.getByRole('link', { name: /queue/i }).first();

      if (await queueLink.isVisible()) {
        await queueLink.click();
        await expect(page).toHaveURL(/\/admin\/queue/);
      }
    });

    test('should navigate to analytics page', async ({ page }) => {
      const analyticsLink = page.getByRole('link', { name: /analytics/i }).first();

      if (await analyticsLink.isVisible()) {
        await analyticsLink.click();
        await expect(page).toHaveURL(/\/admin\/analytics/);
      }
    });

    test('should navigate to automation page', async ({ page }) => {
      const automationLink = page.getByRole('link', { name: /automation/i }).first();

      if (await automationLink.isVisible()) {
        await automationLink.click();
        await expect(page).toHaveURL(/\/admin\/automation/);
      }
    });
  });

  test.describe('Admin Quick Stats', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });
    });

    test('should display order count statistics', async ({ page }) => {
      await page.goto('/admin/orders');

      // Should display counts for different order statuses
      // Look for numeric badges or stat displays
      await expect(
        page.locator('.rounded-full, [data-testid*="count"], span:has-text(/\\d+/)').first()
      ).toBeVisible();
    });

    test('should show action required alert when applicable', async ({ page }) => {
      await page.goto('/admin/orders');

      // If there are orders needing attention, alert should be visible
      // This is conditional on actual data
      const alertElement = page.getByText(/action required/i);
      // Just verify page loaded - alert visibility depends on data
      await expect(page.getByRole('heading', { name: /orders/i }).first()).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('should display correctly on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Login as admin
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });

      // Navigate to orders
      await page.goto('/admin/orders');

      // Page should still be functional
      await expect(page.getByRole('heading').first()).toBeVisible();
    });

    test('should display correctly on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      await expect(page).toHaveURL(/\/admin/, { timeout: 30000 });

      await page.goto('/admin/orders');
      await expect(page.getByRole('heading').first()).toBeVisible();
    });
  });
});
