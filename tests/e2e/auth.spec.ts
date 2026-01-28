import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_ADMIN } from './fixtures/auth.fixture';

/**
 * Authentication E2E Tests
 *
 * Tests for login, logout, and route protection functionality.
 */
test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should load the login page correctly', async ({ page }) => {
      await page.goto('/login');

      // Check page title
      await expect(page).toHaveTitle(/sign in/i);

      // Check main heading
      await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

      // Check form elements are present
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

      // Check links
      await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /create one/i })).toBeVisible();
    });

    test('should show validation errors for empty form submission', async ({ page }) => {
      await page.goto('/login');

      // Click submit without filling the form
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for validation messages
      await expect(page.getByText(/email|required/i).first()).toBeVisible();
    });

    test('should show error for invalid email format', async ({ page }) => {
      await page.goto('/login');

      // Enter invalid email
      await page.getByLabel('Email').fill('notanemail');
      await page.getByLabel('Password').fill('somepassword');

      // Submit the form
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should show email validation error
      await expect(page.getByText(/valid email|invalid email/i)).toBeVisible();
    });
  });

  test.describe('Login with Credentials', () => {
    test('should login successfully with valid credentials', async ({ page }) => {
      await page.goto('/login');

      // Fill in valid credentials
      await page.getByLabel('Email').fill(TEST_USER.email);
      await page.getByLabel('Password').fill(TEST_USER.password);

      // Submit the form
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for successful login - should redirect to dashboard
      await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30000 });

      // Should show success toast or welcome message
      await expect(
        page.getByText(/welcome|logged in|success/i).first()
      ).toBeVisible({ timeout: 10000 });
    });

    test('should show error with invalid credentials', async ({ page }) => {
      await page.goto('/login');

      // Fill in invalid credentials
      await page.getByLabel('Email').fill('wrong@email.com');
      await page.getByLabel('Password').fill('wrongpassword');

      // Submit the form
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should show error toast/message
      await expect(
        page.getByText(/error|invalid|incorrect|failed/i).first()
      ).toBeVisible({ timeout: 10000 });

      // Should stay on login page
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show error with correct email but wrong password', async ({ page }) => {
      await page.goto('/login');

      // Fill in correct email but wrong password
      await page.getByLabel('Email').fill(TEST_USER.email);
      await page.getByLabel('Password').fill('WrongPassword123!');

      // Submit the form
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should show error
      await expect(
        page.getByText(/error|invalid|incorrect|credentials/i).first()
      ).toBeVisible({ timeout: 10000 });

      // Should stay on login page
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show loading state while signing in', async ({ page }) => {
      await page.goto('/login');

      // Fill in credentials
      await page.getByLabel('Email').fill(TEST_USER.email);
      await page.getByLabel('Password').fill(TEST_USER.password);

      // Submit and immediately check for loading state
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should show loading indicator
      await expect(
        page.getByRole('button', { name: /signing in/i })
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Logout', () => {
    test('should logout successfully', async ({ page }) => {
      // First, login
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_USER.email);
      await page.getByLabel('Password').fill(TEST_USER.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for login to complete
      await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30000 });

      // Find and click logout
      // Try different common patterns for logout button
      const userMenuButton = page.locator('[data-testid="user-menu"], [aria-label*="menu"], button:has-text("Account")').first();

      if (await userMenuButton.isVisible()) {
        await userMenuButton.click();
        await page.getByRole('menuitem', { name: /log\s?out|sign\s?out/i }).click();
      } else {
        // Try direct logout link/button
        const logoutLink = page.getByRole('link', { name: /log\s?out|sign\s?out/i }).first();
        const logoutButton = page.getByRole('button', { name: /log\s?out|sign\s?out/i }).first();

        if (await logoutLink.isVisible()) {
          await logoutLink.click();
        } else if (await logoutButton.isVisible()) {
          await logoutButton.click();
        }
      }

      // Should redirect to login or home page
      await expect(page).toHaveURL(/\/(login)?$/, { timeout: 15000 });
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated user from /dashboard to /login', async ({ page }) => {
      // Try to access protected route without authentication
      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });

    test('should redirect unauthenticated user from /orders to /login', async ({ page }) => {
      // Try to access protected route without authentication
      await page.goto('/orders');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });

    test('should redirect unauthenticated user from /orders/new to /login', async ({ page }) => {
      // Try to access protected route without authentication
      await page.goto('/orders/new');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });

    test('should redirect unauthenticated user from /admin to /login', async ({ page }) => {
      // Try to access admin route without authentication
      await page.goto('/admin');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });

    test('should redirect unauthenticated user from /settings to /login', async ({ page }) => {
      // Try to access settings without authentication
      await page.goto('/settings');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });
  });

  test.describe('Remember Me', () => {
    test('should have remember me checkbox on login page', async ({ page }) => {
      await page.goto('/login');

      // Check remember me checkbox exists
      await expect(page.getByLabel(/remember me/i)).toBeVisible();
    });

    test('should be able to check remember me checkbox', async ({ page }) => {
      await page.goto('/login');

      const rememberMeCheckbox = page.getByLabel(/remember me/i);

      // Initially unchecked
      await expect(rememberMeCheckbox).not.toBeChecked();

      // Check it
      await rememberMeCheckbox.check();

      // Should be checked
      await expect(rememberMeCheckbox).toBeChecked();
    });
  });

  test.describe('Password Reset Link', () => {
    test('should navigate to forgot password page', async ({ page }) => {
      await page.goto('/login');

      // Click forgot password link
      await page.getByRole('link', { name: /forgot password/i }).click();

      // Should navigate to forgot password page
      await expect(page).toHaveURL(/\/forgot-password/);
    });
  });

  test.describe('Registration Link', () => {
    test('should navigate to registration page', async ({ page }) => {
      await page.goto('/login');

      // Click create account link
      await page.getByRole('link', { name: /create one/i }).click();

      // Should navigate to register page
      await expect(page).toHaveURL(/\/register/);
    });
  });
});
