/**
 * Citation Service
 *
 * Business logic for citation viewer operations.
 * Handles fetching, caching, and managing citations for orders.
 *
 * Citation Viewer Feature — January 30, 2026
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('services-citations-citation-service');
import {
  getCitationDetailsForViewer,
  batchGetCitationDetails,
} from '@/lib/courtlistener/client';
import type {
  OrderCitation,
  CitationDetails,
  StatutoryCitation,
  SaveCitationInput,
  CitationCacheEntry,
} from '@/types/citations';

/**
 * Create a Supabase client using the service-role key.
 *
 * CRITICAL: saveOrderCitations() is called from Inngest background functions
 * (Phase V executor in lib/workflow/phase-executors.ts:1697) where there is
 * NO HTTP request context. The cookie-based createClient() from
 * @/lib/supabase/server calls cookies() which throws outside request context.
 *
 * This service-role client bypasses both cookies and RLS, which is safe because:
 * 1. It's only used for server-side write operations (not exposed to clients)
 * 2. The order_citations table has a service_role policy: FOR ALL TO service_role
 * 3. The caller (Phase V) has already validated the orderId through the workflow
 *
 * Pattern copied from lib/workflow/workflow-state.ts:33-44 (getAdminClient)
 */
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      '[CitationService] Cannot create service client: ' +
      `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl ? 'SET' : 'MISSING'}, ` +
      `SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey ? 'SET' : 'MISSING'}`
    );
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Cache TTL: 30 days
const CACHE_TTL_DAYS = 30;

/**
 * Transform database row to OrderCitation
 */
function transformDbToOrderCitation(row: Record<string, unknown>): OrderCitation {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    citationString: row.citation_string as string,
    caseName: row.case_name as string,
    caseNameShort: (row.case_name_short as string) || '',
    courtlistenerOpinionId: row.courtlistener_opinion_id as string | undefined,
    courtlistenerClusterId: row.courtlistener_cluster_id as string | undefined,
    courtlistenerUrl: row.courtlistener_url as string | undefined,
    court: (row.court as string) || '',
    courtShort: (row.court_short as string) || '',
    dateFiled: row.date_filed as string | undefined,
    dateFiledDisplay: row.date_filed_display as string | undefined,
    citationType: (row.citation_type as 'case' | 'statute' | 'regulation') || 'case',
    proposition: row.proposition as string | undefined,
    locationInMotion: row.location_in_motion as string | undefined,
    authorityLevel: row.authority_level as 'binding' | 'persuasive' | undefined,
    verificationStatus: (row.verification_status as 'verified' | 'unverified' | 'flagged') || 'verified',
    verificationTimestamp: row.verification_timestamp as string | undefined,
    verificationMethod: row.verification_method as string | undefined,
    adminReviewed: row.admin_reviewed as boolean | undefined,
    adminReviewedAt: row.admin_reviewed_at as string | undefined,
    adminReviewedBy: row.admin_reviewed_by as string | undefined,
    adminNotes: row.admin_notes as string | undefined,
    displayOrder: (row.display_order as number) || 0,
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
}

/**
 * Get all citations for an order
 */
export async function getOrderCitations(orderId: string): Promise<{
  success: boolean;
  data?: {
    caseCitations: OrderCitation[];
    statutoryCitations: StatutoryCitation[];
    totalCitations: number;
  };
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('order_citations')
      .select('*')
      .eq('order_id', orderId)
      .order('display_order', { ascending: true });

    if (error) {
      log.error('[CitationService] Error fetching order citations:', error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        data: {
          caseCitations: [],
          statutoryCitations: [],
          totalCitations: 0,
        },
      };
    }

    // Split into case and statutory citations
    const caseCitations: OrderCitation[] = [];
    const statutoryCitations: StatutoryCitation[] = [];

    for (const row of data) {
      if (row.citation_type === 'statute' || row.citation_type === 'regulation') {
        statutoryCitations.push({
          id: row.id,
          citation: row.citation_string,
          name: row.case_name,
          purpose: row.proposition,
          relevantText: undefined,
        });
      } else {
        caseCitations.push(transformDbToOrderCitation(row));
      }
    }

    return {
      success: true,
      data: {
        caseCitations,
        statutoryCitations,
        totalCitations: data.length,
      },
    };
  } catch (error) {
    log.error('[CitationService] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get citation details by CourtListener opinion ID
 * Checks cache first, fetches from CourtListener if cache miss
 */
export async function getCitationDetails(
  opinionId: string,
  options?: { includeText?: boolean; forceRefresh?: boolean }
): Promise<{
  success: boolean;
  data?: CitationDetails;
  error?: string;
}> {
  const includeText = options?.includeText ?? false;
  const forceRefresh = options?.forceRefresh ?? false;

  try {
    const supabase = await createClient();

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('citation_cache')
        .select('*')
        .eq('courtlistener_opinion_id', opinionId)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cached) {
        log.info(`[CitationService] Cache hit for opinion ${opinionId}`);

        // Transform cached data to CitationDetails
        const details: CitationDetails = {
          opinionId: cached.courtlistener_opinion_id,
          clusterId: cached.courtlistener_cluster_id || opinionId,
          caseName: cached.case_name || 'Unknown Case',
          caseNameShort: cached.case_name_short || '',
          citation: cached.citation_string || '',
          court: cached.court || '',
          courtShort: cached.court_short || '',
          dateFiled: cached.date_filed || '',
          dateFiledDisplay: cached.date_filed_display || '',
          syllabus: cached.syllabus || undefined,
          headnotes: cached.headnotes ? [cached.headnotes] : undefined,
          courtlistenerUrl: `https://www.courtlistener.com/opinion/${opinionId}/`,
          citedByCount: cached.cited_by_count || 0,
          treatment: {
            isGoodLaw: true,
            overruledBy: [],
            distinguishedBy: [],
            followedBy: [],
            citedBy: [],
            ...(cached.treatment_history as object || {}),
          },
          cachedAt: cached.fetched_at,
          source: 'cache',
        };

        // Include text if requested and available
        if (includeText && cached.opinion_text) {
          details.opinionText = cached.opinion_text;
          details.opinionTextType = (cached.opinion_text_type as 'html' | 'plain') || 'plain';
        }

        return { success: true, data: details };
      }
    }

    // Cache miss - fetch from CourtListener
    log.info(`[CitationService] Cache miss for opinion ${opinionId}, fetching from CourtListener`);
    const result = await getCitationDetailsForViewer(opinionId, { includeText });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to fetch from CourtListener' };
    }

    // Cache the result
    const cacheData: Partial<CitationCacheEntry> = {
      courtlistenerOpinionId: result.data.opinionId,
      courtlistenerClusterId: result.data.clusterId,
      caseName: result.data.caseName,
      caseNameShort: result.data.caseNameShort,
      citationString: result.data.citation,
      court: result.data.court,
      courtShort: result.data.courtShort,
      dateFiled: result.data.dateFiled,
      dateFiledDisplay: result.data.dateFiledDisplay,
      syllabus: result.data.syllabus,
      headnotes: result.data.headnotes?.join('\n\n'),
      citedByCount: result.data.citedByCount,
      treatmentHistory: result.data.treatment as unknown as Record<string, unknown>,
      fetchSource: 'opinion_endpoint',
    };

    if (includeText && result.data.opinionText) {
      cacheData.opinionText = result.data.opinionText;
      cacheData.opinionTextType = result.data.opinionTextType;
    }

    // Upsert cache entry
    const { error: cacheError } = await supabase
      .from('citation_cache')
      .upsert(
        {
          courtlistener_opinion_id: cacheData.courtlistenerOpinionId,
          courtlistener_cluster_id: cacheData.courtlistenerClusterId,
          case_name: cacheData.caseName,
          case_name_short: cacheData.caseNameShort,
          citation_string: cacheData.citationString,
          court: cacheData.court,
          court_short: cacheData.courtShort,
          date_filed: cacheData.dateFiled,
          date_filed_display: cacheData.dateFiledDisplay,
          syllabus: cacheData.syllabus,
          headnotes: cacheData.headnotes,
          opinion_text: cacheData.opinionText,
          opinion_text_type: cacheData.opinionTextType,
          cited_by_count: cacheData.citedByCount,
          treatment_history: cacheData.treatmentHistory,
          fetch_source: cacheData.fetchSource,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'courtlistener_opinion_id' }
      );

    if (cacheError) {
      log.warn('[CitationService] Failed to cache citation:', cacheError);
      // Don't fail the request if caching fails
    }

    return { success: true, data: result.data };
  } catch (error) {
    log.error('[CitationService] Error getting citation details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch get citation details for multiple opinions
 * Uses cache aggressively, only fetches cache misses from CourtListener
 */
export async function batchGetCitationDetailsService(
  opinionIds: string[]
): Promise<{
  success: boolean;
  data?: {
    citations: CitationDetails[];
    cacheHits: number;
    cacheMisses: number;
    errors: string[];
  };
  error?: string;
}> {
  if (opinionIds.length === 0) {
    return {
      success: true,
      data: { citations: [], cacheHits: 0, cacheMisses: 0, errors: [] },
    };
  }

  // Rate limit: max 20 citations per request
  if (opinionIds.length > 20) {
    return {
      success: false,
      error: 'Maximum 20 citations per batch request',
    };
  }

  try {
    const supabase = await createClient();
    const results: CitationDetails[] = [];
    const errors: string[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    // Check cache for all IDs
    const { data: cached } = await supabase
      .from('citation_cache')
      .select('*')
      .in('courtlistener_opinion_id', opinionIds)
      .gt('expires_at', new Date().toISOString());

    const cachedIds = new Set(cached?.map((c: { courtlistener_opinion_id: string }) => c.courtlistener_opinion_id) || []);

    // Process cached entries
    for (const entry of cached || []) {
      cacheHits++;
      results.push({
        opinionId: entry.courtlistener_opinion_id,
        clusterId: entry.courtlistener_cluster_id || entry.courtlistener_opinion_id,
        caseName: entry.case_name || 'Unknown Case',
        caseNameShort: entry.case_name_short || '',
        citation: entry.citation_string || '',
        court: entry.court || '',
        courtShort: entry.court_short || '',
        dateFiled: entry.date_filed || '',
        dateFiledDisplay: entry.date_filed_display || '',
        syllabus: entry.syllabus || undefined,
        headnotes: entry.headnotes ? [entry.headnotes] : undefined,
        courtlistenerUrl: `https://www.courtlistener.com/opinion/${entry.courtlistener_opinion_id}/`,
        citedByCount: entry.cited_by_count || 0,
        treatment: {
          isGoodLaw: true,
          ...(entry.treatment_history as object || {}),
        },
        cachedAt: entry.fetched_at,
        source: 'cache',
      });
    }

    // Fetch missing from CourtListener
    const missingIds = opinionIds.filter(id => !cachedIds.has(id));
    if (missingIds.length > 0) {
      cacheMisses = missingIds.length;
      const batchResult = await batchGetCitationDetails(missingIds);

      if (batchResult.data) {
        for (const [id, details] of batchResult.data) {
          results.push(details);

          // Cache each result (fire and forget)
          Promise.resolve(
            supabase
              .from('citation_cache')
              .upsert({
                courtlistener_opinion_id: details.opinionId,
                courtlistener_cluster_id: details.clusterId,
                case_name: details.caseName,
                case_name_short: details.caseNameShort,
                citation_string: details.citation,
                court: details.court,
                court_short: details.courtShort,
                date_filed: details.dateFiled,
                date_filed_display: details.dateFiledDisplay,
                syllabus: details.syllabus,
                cited_by_count: details.citedByCount,
                treatment_history: details.treatment,
                fetch_source: 'batch_endpoint',
                fetched_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
              }, { onConflict: 'courtlistener_opinion_id' })
          ).catch((err: unknown) => log.warn('[CitationService] Failed to cache:', err));
        }
      }

      if (batchResult.errors) {
        errors.push(...batchResult.errors);
      }
    }

    return {
      success: true,
      data: {
        citations: results,
        cacheHits,
        cacheMisses,
        errors,
      },
    };
  } catch (error) {
    log.error('[CitationService] Batch error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Save citations for an order
 * Called by workflow after Phase V to persist citations
 */
export async function saveOrderCitations(
  orderId: string,
  citations: SaveCitationInput[]
): Promise<{
  success: boolean;
  data?: {
    savedCitations: number;
    caseCitations: number;
    statutoryCitations: number;
  };
  error?: string;
}> {
  if (citations.length === 0) {
    return {
      success: true,
      data: { savedCitations: 0, caseCitations: 0, statutoryCitations: 0 },
    };
  }

  try {
    // SERVICE-ROLE CLIENT: This function is called from Inngest background context
    // (Phase V executor) where cookies() is unavailable. The cookie-based createClient
    // from @/lib/supabase/server throws when called outside HTTP request context.
    // See getServiceClient() JSDoc for full explanation.
    const supabase = getServiceClient();

    // Transform to database format
    const dbRows = citations.map((citation, index) => ({
      order_id: orderId,
      citation_string: citation.citationString,
      case_name: citation.caseName,
      case_name_short: citation.caseNameShort || null,
      courtlistener_opinion_id: citation.courtlistenerOpinionId || null,
      courtlistener_cluster_id: citation.courtlistenerClusterId || null,
      courtlistener_url: citation.courtlistenerUrl || null,
      court: citation.court || null,
      court_short: citation.courtShort || null,
      date_filed: citation.dateFiled || null,
      date_filed_display: citation.dateFiledDisplay || null,
      citation_type: citation.citationType,
      proposition: citation.proposition || null,
      location_in_motion: citation.locationInMotion || null,
      authority_level: citation.authorityLevel || null,
      verification_status: citation.verificationStatus || 'verified',
      verification_timestamp: new Date().toISOString(),
      verification_method: citation.verificationMethod || 'courtlistener_search',
      display_order: citation.displayOrder ?? index,
    }));

    // Upsert citations (handles duplicates by citation_string per order)
    const { error } = await supabase
      .from('order_citations')
      .upsert(dbRows, {
        onConflict: 'order_id,citation_string',
        ignoreDuplicates: false,
      });

    if (error) {
      log.error('[CitationService] Error saving citations:', error);
      return { success: false, error: error.message };
    }

    // Count types
    const caseCitations = citations.filter(c => c.citationType === 'case').length;
    const statutoryCitations = citations.filter(
      c => c.citationType === 'statute' || c.citationType === 'regulation'
    ).length;

    log.info(`[CitationService] Saved ${citations.length} citations for order ${orderId}`);

    return {
      success: true,
      data: {
        savedCitations: citations.length,
        caseCitations,
        statutoryCitations,
      },
    };
  } catch (error) {
    log.error('[CitationService] Error saving citations:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Flag a citation for review
 * Admin only operation
 */
export async function flagCitation(
  citationId: string,
  reason: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('order_citations')
      .update({
        verification_status: 'flagged',
        admin_reviewed: true,
        admin_reviewed_at: new Date().toISOString(),
        admin_reviewed_by: adminId,
        admin_notes: reason,
      })
      .eq('id', citationId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log audit entry
    await supabase.from('automation_logs').insert({
      order_id: null, // Would need to look up the order_id
      action: 'citation_flagged',
      details: { citationId, reason, adminId },
      created_at: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    log.error('[CitationService] Error flagging citation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Mark a citation as verified by admin
 * Admin only operation
 */
export async function verifyCitation(
  citationId: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('order_citations')
      .update({
        verification_status: 'verified',
        admin_reviewed: true,
        admin_reviewed_at: new Date().toISOString(),
        admin_reviewed_by: adminId,
      })
      .eq('id', citationId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    log.error('[CitationService] Error verifying citation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get citation count for an order
 * Useful for admin order list display
 */
export async function getCitationCount(orderId: string): Promise<{
  success: boolean;
  data?: {
    total: number;
    verified: number;
    flagged: number;
  };
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('order_citations')
      .select('verification_status')
      .eq('order_id', orderId);

    if (error) {
      return { success: false, error: error.message };
    }

    const total = data?.length || 0;
    const verified = data?.filter((c: { verification_status: string }) => c.verification_status === 'verified').length || 0;
    const flagged = data?.filter((c: { verification_status: string }) => c.verification_status === 'flagged').length || 0;

    return {
      success: true,
      data: { total, verified, flagged },
    };
  } catch (error) {
    log.error('[CitationService] Error getting citation count:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
