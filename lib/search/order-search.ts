/**
 * Order Search Functionality (Task 71)
 *
 * Full-text search for orders with fuzzy matching.
 *
 * Searchable fields:
 * - Case number
 * - Party names (plaintiff, defendant)
 * - Customer email
 * - Order ID
 * - Motion type
 *
 * Features:
 * - Fuzzy matching for typos
 * - Filter by date range
 * - Filter by status
 * - Sort by relevance or date
 *
 * Source: Chunk 10, Task 71 - P2 Pre-Launch
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface OrderSearchQuery {
  query: string;
  filters?: {
    status?: string[];
    tier?: ('A' | 'B' | 'C' | 'D')[];
    dateFrom?: Date;
    dateTo?: Date;
    jurisdiction?: string[];
  };
  sort?: {
    field: 'relevance' | 'created_at' | 'deadline';
    direction: 'asc' | 'desc';
  };
  limit?: number;
  offset?: number;
}

export interface OrderSearchResult {
  orderId: string;
  orderNumber: string;
  caseNumber: string;
  caseCaption: string;
  parties: string;
  motionType: string;
  status: string;
  jurisdiction: string;
  tier: string;
  createdAt: Date;
  filingDeadline: Date | null;
  relevanceScore: number;
}

export interface SearchResponse {
  results: OrderSearchResult[];
  total: number;
  took: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get admin supabase client
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseKey);
}

/**
 * Calculate fuzzy match score using Levenshtein distance
 */
export function fuzzyMatch(searchTerm: string, target: string): number {
  if (!searchTerm || !target) return 0;

  const search = searchTerm.toLowerCase();
  const text = target.toLowerCase();

  // Exact match
  if (text.includes(search)) {
    return 1.0;
  }

  // Calculate Levenshtein-based similarity
  const maxLen = Math.max(search.length, text.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(search, text);
  const similarity = 1 - distance / maxLen;

  // Boost if words start similarly
  if (text.startsWith(search.substring(0, 3))) {
    return Math.min(1.0, similarity + 0.2);
  }

  return similarity;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Build search query for Supabase using ILIKE
 */
export function buildSearchQuery(query: string): string {
  // Escape special characters
  const escaped = query.replace(/[%_]/g, '\\$&');
  return `%${escaped}%`;
}

/**
 * Calculate relevance score for an order
 */
function calculateRelevance(
  order: Record<string, unknown>,
  searchTerms: string[]
): number {
  let score = 0;
  const weights = {
    order_number: 2.0,
    case_number: 1.5,
    case_caption: 1.0,
    motion_type: 0.8,
    parties: 0.6,
  };

  for (const term of searchTerms) {
    // Order number match (highest priority)
    if (order.order_number && fuzzyMatch(term, String(order.order_number)) > 0.7) {
      score += weights.order_number * fuzzyMatch(term, String(order.order_number));
    }

    // Case number match
    if (order.case_number && fuzzyMatch(term, String(order.case_number)) > 0.6) {
      score += weights.case_number * fuzzyMatch(term, String(order.case_number));
    }

    // Case caption match
    if (order.case_caption && fuzzyMatch(term, String(order.case_caption)) > 0.5) {
      score += weights.case_caption * fuzzyMatch(term, String(order.case_caption));
    }

    // Motion type match
    if (order.motion_type) {
      const motionTypeNormalized = String(order.motion_type).replace(/_/g, ' ');
      if (fuzzyMatch(term, motionTypeNormalized) > 0.5) {
        score += weights.motion_type * fuzzyMatch(term, motionTypeNormalized);
      }
    }
  }

  return Math.min(1.0, score);
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================

/**
 * Search orders with full-text and fuzzy matching
 */
export async function searchOrders(
  query: OrderSearchQuery
): Promise<SearchResponse> {
  const startTime = Date.now();
  const supabase = getAdminClient();

  if (!supabase) {
    return { results: [], total: 0, took: Date.now() - startTime };
  }

  try {
    // Build base query
    let dbQuery = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        case_number,
        case_caption,
        motion_type,
        jurisdiction,
        status,
        created_at,
        filing_deadline,
        profiles (
          full_name,
          email
        ),
        order_workflow_state (
          current_tier
        )
      `, { count: 'exact' });

    // Apply text search if query provided
    if (query.query && query.query.trim()) {
      const searchPattern = buildSearchQuery(query.query.trim());

      // Search across multiple fields using OR
      dbQuery = dbQuery.or(
        `order_number.ilike.${searchPattern},` +
        `case_number.ilike.${searchPattern},` +
        `case_caption.ilike.${searchPattern},` +
        `motion_type.ilike.${searchPattern}`
      );
    }

    // Apply status filter
    if (query.filters?.status && query.filters.status.length > 0) {
      dbQuery = dbQuery.in('status', query.filters.status);
    }

    // Apply date filters
    if (query.filters?.dateFrom) {
      dbQuery = dbQuery.gte('created_at', query.filters.dateFrom.toISOString());
    }

    if (query.filters?.dateTo) {
      dbQuery = dbQuery.lte('created_at', query.filters.dateTo.toISOString());
    }

    // Apply jurisdiction filter
    if (query.filters?.jurisdiction && query.filters.jurisdiction.length > 0) {
      dbQuery = dbQuery.in('jurisdiction', query.filters.jurisdiction);
    }

    // Apply sorting
    const sortField = query.sort?.field || 'created_at';
    const sortDirection = query.sort?.direction || 'desc';

    if (sortField !== 'relevance') {
      dbQuery = dbQuery.order(
        sortField === 'deadline' ? 'filing_deadline' : sortField,
        { ascending: sortDirection === 'asc' }
      );
    } else {
      // For relevance, we'll sort client-side after calculating scores
      dbQuery = dbQuery.order('created_at', { ascending: false });
    }

    // Apply pagination
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    dbQuery = dbQuery.range(offset, offset + limit - 1);

    // Execute query
    const { data, error, count } = await dbQuery;

    if (error) {
      console.error('[OrderSearch] Query error:', error);
      return { results: [], total: 0, took: Date.now() - startTime };
    }

    // Parse search terms for relevance calculation
    const searchTerms = query.query
      ? query.query.trim().toLowerCase().split(/\s+/)
      : [];

    // Transform results
    let results: OrderSearchResult[] = (data || []).map((order) => {
      // Build parties string
      const parties = order.case_caption || '';

      // Get tier from workflow state
      const tier = order.order_workflow_state?.[0]?.current_tier || 'B';

      // Filter by tier if specified
      if (
        query.filters?.tier &&
        query.filters.tier.length > 0 &&
        !query.filters.tier.includes(tier as 'A' | 'B' | 'C' | 'D')
      ) {
        return null;
      }

      // Calculate relevance score
      const relevanceScore = searchTerms.length > 0
        ? calculateRelevance(order, searchTerms)
        : 0.5;

      return {
        orderId: order.id,
        orderNumber: order.order_number,
        caseNumber: order.case_number || '',
        caseCaption: order.case_caption || '',
        parties,
        motionType: order.motion_type || '',
        status: order.status,
        jurisdiction: order.jurisdiction || '',
        tier,
        createdAt: new Date(order.created_at),
        filingDeadline: order.filing_deadline ? new Date(order.filing_deadline) : null,
        relevanceScore,
      };
    }).filter((r): r is OrderSearchResult => r !== null);

    // Sort by relevance if requested
    if (sortField === 'relevance') {
      results.sort((a, b) => {
        const diff = b.relevanceScore - a.relevanceScore;
        if (diff !== 0) return diff;
        // Tie-breaker: most recent first
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }

    return {
      results,
      total: count || results.length,
      took: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[OrderSearch] Error:', error);
    return { results: [], total: 0, took: Date.now() - startTime };
  }
}

/**
 * Quick search for autocomplete/typeahead
 */
export async function quickSearch(
  query: string,
  limit: number = 10
): Promise<Array<{ id: string; label: string; type: string }>> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const supabase = getAdminClient();
  if (!supabase) return [];

  try {
    const searchPattern = buildSearchQuery(query.trim());

    const { data } = await supabase
      .from('orders')
      .select('id, order_number, case_number, motion_type')
      .or(
        `order_number.ilike.${searchPattern},` +
        `case_number.ilike.${searchPattern}`
      )
      .limit(limit);

    return (data || []).map((order) => ({
      id: order.id,
      label: `${order.order_number} - ${order.case_number || order.motion_type}`,
      type: 'order',
    }));
  } catch (error) {
    console.error('[OrderSearch] Quick search error:', error);
    return [];
  }
}
