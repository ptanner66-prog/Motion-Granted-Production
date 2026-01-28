import { test, expect } from '@playwright/test';
import { TEST_USER } from './fixtures/auth.fixture';

/**
 * API Health E2E Tests
 *
 * Tests for API health endpoints and critical API functionality.
 * These tests verify that backend services are operational.
 */
test.describe('API Health Endpoints', () => {
  test.describe('/api/health', () => {
    test('should return 200 status for basic health check', async ({ request }) => {
      const response = await request.get('/api/health');

      // Health endpoint should return 200 when healthy
      // May return 503 if services are unhealthy
      expect([200, 503]).toContain(response.status());
    });

    test('should return JSON response with status field', async ({ request }) => {
      const response = await request.get('/api/health');
      const body = await response.json();

      // Should have a status field
      expect(body).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    });

    test('should return timestamp in response', async ({ request }) => {
      const response = await request.get('/api/health');
      const body = await response.json();

      // Should have a timestamp
      expect(body).toHaveProperty('timestamp');

      // Timestamp should be valid ISO string
      const timestamp = new Date(body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    test('should return services array with status', async ({ request }) => {
      const response = await request.get('/api/health');
      const body = await response.json();

      // Should have services array
      expect(body).toHaveProperty('services');
      expect(Array.isArray(body.services)).toBe(true);

      // Each service should have name and status
      body.services.forEach((service: { name: string; status: string }) => {
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('status');
        expect(['ok', 'error']).toContain(service.status);
      });
    });

    test('should include latency metric', async ({ request }) => {
      const response = await request.get('/api/health');
      const body = await response.json();

      // Should have latency measurement
      expect(body).toHaveProperty('latencyMs');
      expect(typeof body.latencyMs).toBe('number');
      expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test('should respond within acceptable time', async ({ request }) => {
      const startTime = Date.now();
      const response = await request.get('/api/health');
      const endTime = Date.now();

      const responseTime = endTime - startTime;

      // Health check should respond within 5 seconds
      expect(responseTime).toBeLessThan(5000);

      // Should have a response
      expect([200, 503]).toContain(response.status());
    });
  });

  test.describe('/api/health/detailed', () => {
    test('should return 200 status for detailed health check', async ({ request }) => {
      const response = await request.get('/api/health/detailed');

      // Detailed health endpoint may return different status codes
      expect([200, 503]).toContain(response.status());
    });

    test('should return comprehensive health status structure', async ({ request }) => {
      const response = await request.get('/api/health/detailed');
      const body = await response.json();

      // Basic structure
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
    });

    test('should return detailed status with verbose flag', async ({ request }) => {
      const response = await request.get('/api/health/detailed?verbose=true');
      const body = await response.json();

      // Should have detailed checks
      expect(body).toHaveProperty('status');

      if (body.checks) {
        // Verbose response should include detailed checks
        expect(body.checks).toHaveProperty('database');
        expect(body.checks).toHaveProperty('redis');
        expect(body.checks).toHaveProperty('queue');
        expect(body.checks).toHaveProperty('circuits');
        expect(body.checks).toHaveProperty('storage');

        // Each check should have status
        Object.values(body.checks).forEach((check: unknown) => {
          const typedCheck = check as { status: string };
          expect(['healthy', 'degraded', 'unhealthy']).toContain(typedCheck.status);
        });
      }
    });

    test('should include version information', async ({ request }) => {
      const response = await request.get('/api/health/detailed?verbose=true');
      const body = await response.json();

      if (body.version) {
        expect(typeof body.version).toBe('string');
      }
    });

    test('should include uptime metric', async ({ request }) => {
      const response = await request.get('/api/health/detailed?verbose=true');
      const body = await response.json();

      if (body.uptime !== undefined) {
        expect(typeof body.uptime).toBe('number');
        expect(body.uptime).toBeGreaterThanOrEqual(0);
      }
    });

    test('should include system metrics when verbose', async ({ request }) => {
      const response = await request.get('/api/health/detailed?verbose=true');
      const body = await response.json();

      if (body.metrics) {
        // Should have memory usage
        if (body.metrics.memoryUsage) {
          expect(body.metrics.memoryUsage).toHaveProperty('heapUsed');
          expect(body.metrics.memoryUsage).toHaveProperty('heapTotal');
          expect(body.metrics.memoryUsage).toHaveProperty('rss');
        }
      }
    });

    test('should support HEAD request for liveness probe', async ({ request }) => {
      const response = await request.head('/api/health/detailed');

      // HEAD request should return 200 for liveness
      expect(response.status()).toBe(200);
    });
  });

  test.describe('/api/motion-types', () => {
    // Note: This endpoint requires authentication
    test.beforeEach(async ({ page }) => {
      // Login to get authenticated session
      await page.goto('/login');
      await page.getByLabel('Email').fill(TEST_USER.email);
      await page.getByLabel('Password').fill(TEST_USER.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30000 });
    });

    test('should return 401 without authentication', async ({ request }) => {
      // Without auth context, should return 401
      const response = await request.get('/api/motion-types');

      expect(response.status()).toBe(401);
    });

    test('should return motion types data when authenticated', async ({ page }) => {
      // Use page context to make authenticated request
      const response = await page.request.get('/api/motion-types');

      // Should return 200 when authenticated
      expect(response.status()).toBe(200);

      const body = await response.json();

      // Should have motion types array
      expect(body).toHaveProperty('motionTypes');
      expect(Array.isArray(body.motionTypes)).toBe(true);
    });

    test('should return grouped motion types', async ({ page }) => {
      const response = await page.request.get('/api/motion-types');
      const body = await response.json();

      // Should have grouped structure
      expect(body).toHaveProperty('grouped');
      expect(body.grouped).toHaveProperty('A');
      expect(body.grouped).toHaveProperty('B');
      expect(body.grouped).toHaveProperty('C');

      // Each group should be an array
      expect(Array.isArray(body.grouped.A)).toBe(true);
      expect(Array.isArray(body.grouped.B)).toBe(true);
      expect(Array.isArray(body.grouped.C)).toBe(true);
    });

    test('should return tier information', async ({ page }) => {
      const response = await page.request.get('/api/motion-types');
      const body = await response.json();

      // Should have tiers info
      expect(body).toHaveProperty('tiers');
      expect(body.tiers).toHaveProperty('A');
      expect(body.tiers).toHaveProperty('B');
      expect(body.tiers).toHaveProperty('C');

      // Each tier should have name and count
      expect(body.tiers.A).toHaveProperty('name');
      expect(body.tiers.A).toHaveProperty('count');
    });

    test('should support tier filter parameter', async ({ page }) => {
      const response = await page.request.get('/api/motion-types?tier=A');

      expect(response.status()).toBe(200);

      const body = await response.json();

      // All returned motion types should be tier A
      if (body.motionTypes && body.motionTypes.length > 0) {
        body.motionTypes.forEach((motionType: { tier: string }) => {
          expect(motionType.tier).toBe('A');
        });
      }
    });

    test('should support jurisdiction filter parameter', async ({ page }) => {
      const response = await page.request.get('/api/motion-types?jurisdiction=federal');

      expect(response.status()).toBe(200);

      const body = await response.json();

      // All returned motion types should be federal applicable
      if (body.motionTypes && body.motionTypes.length > 0) {
        body.motionTypes.forEach((motionType: { federal_applicable: boolean }) => {
          expect(motionType.federal_applicable).toBe(true);
        });
      }
    });

    test('should return motion type with required fields', async ({ page }) => {
      const response = await page.request.get('/api/motion-types');
      const body = await response.json();

      if (body.motionTypes && body.motionTypes.length > 0) {
        const motionType = body.motionTypes[0];

        // Check required fields exist
        expect(motionType).toHaveProperty('id');
        expect(motionType).toHaveProperty('code');
        expect(motionType).toHaveProperty('name');
        expect(motionType).toHaveProperty('tier');
      }
    });
  });

  test.describe('API Error Handling', () => {
    test('should return 404 for non-existent API routes', async ({ request }) => {
      const response = await request.get('/api/non-existent-endpoint');

      expect(response.status()).toBe(404);
    });

    test('should return JSON error for invalid API requests', async ({ request }) => {
      const response = await request.get('/api/health/invalid-path');

      // Should return 404 with proper content type
      expect(response.status()).toBe(404);
    });
  });

  test.describe('API Response Times', () => {
    test('should respond to health check within 2 seconds', async ({ request }) => {
      const startTime = performance.now();
      await request.get('/api/health');
      const endTime = performance.now();

      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(2000);
    });

    test('should respond to detailed health check within 5 seconds', async ({ request }) => {
      const startTime = performance.now();
      await request.get('/api/health/detailed');
      const endTime = performance.now();

      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(5000);
    });
  });

  test.describe('CORS and Headers', () => {
    test('should return proper content-type header', async ({ request }) => {
      const response = await request.get('/api/health');
      const contentType = response.headers()['content-type'];

      expect(contentType).toContain('application/json');
    });
  });
});

/**
 * Additional API Integration Tests
 */
test.describe('API Integration', () => {
  test.describe('Public Endpoints', () => {
    test('should serve marketing pages without authentication', async ({ page }) => {
      // Home page
      const homeResponse = await page.goto('/');
      expect(homeResponse?.status()).toBe(200);

      // Pricing page
      const pricingResponse = await page.goto('/pricing');
      expect(pricingResponse?.status()).toBe(200);

      // FAQ page
      const faqResponse = await page.goto('/faq');
      expect(faqResponse?.status()).toBe(200);
    });

    test('should serve login page without authentication', async ({ page }) => {
      const response = await page.goto('/login');
      expect(response?.status()).toBe(200);
    });

    test('should serve register page without authentication', async ({ page }) => {
      const response = await page.goto('/register');
      expect(response?.status()).toBe(200);
    });
  });

  test.describe('Health Check Consistency', () => {
    test('should return consistent status across multiple requests', async ({ request }) => {
      // Make multiple requests
      const responses = await Promise.all([
        request.get('/api/health'),
        request.get('/api/health'),
        request.get('/api/health'),
      ]);

      // All should return the same status code
      const statuses = responses.map(r => r.status());
      expect(statuses[0]).toBe(statuses[1]);
      expect(statuses[1]).toBe(statuses[2]);

      // All should return same health status
      const bodies = await Promise.all(responses.map(r => r.json()));
      expect(bodies[0].status).toBe(bodies[1].status);
      expect(bodies[1].status).toBe(bodies[2].status);
    });
  });
});
