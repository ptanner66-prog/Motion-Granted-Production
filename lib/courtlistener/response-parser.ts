/**
 * CourtListener V4 Response Parser
 *
 * Parses and validates V4 API response shapes. V4 uses cursor-based
 * pagination (next/previous contain URLs with cursor params) instead
 * of V3's offset-based pagination.
 *
 * @version BATCH_13 — ST-010
 */

// ============================================================================
// V4 RESPONSE TYPES
// ============================================================================

/**
 * Standard V4 paginated response shape.
 * V4 uses cursor-based pagination:
 *   - next: URL with ?cursor=<opaque> (or null if last page)
 *   - previous: URL with ?cursor=<opaque> (or null if first page)
 * V3 used offset-based pagination:
 *   - next: URL with ?offset=<number> (DEPRECATED)
 */
export interface V4Response<T> {
  count: number;
  next: string | null;      // URL with cursor parameter
  previous: string | null;  // URL with cursor parameter
  results: T[];
}

// ============================================================================
// PARSING
// ============================================================================

/**
 * Parse and validate a V4 paginated response.
 *
 * Safely coerces unknown API responses into the V4Response shape,
 * with fallbacks for missing or malformed fields.
 *
 * @param response - Raw API response (unknown shape)
 * @returns Typed V4Response with safe defaults
 */
export function parseV4Response<T>(response: unknown): V4Response<T> {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid V4 response: not an object');
  }

  const obj = response as Record<string, unknown>;

  return {
    count: typeof obj.count === 'number' ? obj.count : 0,
    next: typeof obj.next === 'string' ? obj.next : null,
    previous: typeof obj.previous === 'string' ? obj.previous : null,
    results: Array.isArray(obj.results) ? obj.results : [],
  };
}

/**
 * Check whether a response uses V3 offset-based pagination.
 * Useful for detecting stale code paths that haven't migrated to V4.
 *
 * @param nextUrl - The `next` URL from the response
 * @returns true if the URL contains offset= (V3 pattern)
 */
export function isV3OffsetPagination(nextUrl: string | null): boolean {
  if (!nextUrl) return false;

  try {
    const url = new URL(nextUrl);
    return url.searchParams.has('offset');
  } catch {
    return false;
  }
}

/**
 * Extract the cursor value from a V4 next/previous URL.
 *
 * @param url - Full URL string from response next/previous field
 * @returns cursor string, or null if not present
 */
export function extractCursor(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('cursor');
  } catch {
    return null;
  }
}
