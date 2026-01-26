/**
 * Case.law API Client
 *
 * @deprecated Case.law (Harvard Law School) API was SUNSET on September 5, 2024.
 * DO NOT USE - This file is kept for historical reference only.
 *
 * The citation verification flow has been updated to:
 * CourtListener (PRIMARY) → PACER (FALLBACK for unpublished federal only)
 *
 * See: lib/pacer/client.ts for PACER implementation
 */

// ============================================================================
// ALL FUNCTIONS DEPRECATED - API NO LONGER AVAILABLE
// ============================================================================

/**
 * @deprecated Case.law API sunset September 5, 2024
 */
export interface CaseLawCase {
  id: number;
  url: string;
  name: string;
  name_abbreviation: string;
  decision_date: string;
  docket_number: string;
  first_page: string;
  last_page: string;
  citations: Array<{
    cite: string;
    type: string;
  }>;
  volume: {
    url: string;
    volume_number: string;
    barcode: string;
  };
  reporter: {
    url: string;
    full_name: string;
    id: number;
  };
  court: {
    url: string;
    id: number;
    slug: string;
    name: string;
    name_abbreviation: string;
  };
  jurisdiction: {
    url: string;
    id: number;
    slug: string;
    name: string;
    name_long: string;
    whitelisted: boolean;
  };
  cites_to?: Array<{
    cite: string;
    case_ids: number[];
  }>;
  frontend_url?: string;
  preview?: string[];
}

/**
 * @deprecated Case.law API sunset September 5, 2024
 */
export interface CaseLawSearchResult {
  found: boolean;
  cases: CaseLawCase[];
  count: number;
}

/**
 * @deprecated Case.law API sunset September 5, 2024
 * @throws Error - API no longer available
 */
export async function searchByCitation(
  _citation: string
): Promise<{ success: boolean; data?: CaseLawSearchResult; error?: string }> {
  console.error('[Case.law] API was sunset on September 5, 2024. Use CourtListener instead.');
  return {
    success: false,
    error: 'Case.law API sunset September 5, 2024 - use CourtListener or PACER',
  };
}

/**
 * @deprecated Case.law API sunset September 5, 2024
 * @throws Error - API no longer available
 */
export async function searchByCaseName(
  _caseName: string
): Promise<{ success: boolean; data?: CaseLawSearchResult; error?: string }> {
  console.error('[Case.law] API was sunset on September 5, 2024. Use CourtListener instead.');
  return {
    success: false,
    error: 'Case.law API sunset September 5, 2024 - use CourtListener or PACER',
  };
}

/**
 * @deprecated Case.law API sunset September 5, 2024
 * @throws Error - API no longer available
 */
export async function verifyCitationExists(
  _citation: string,
  _caseName?: string
): Promise<{
  success: boolean;
  data?: {
    exists: boolean;
    caselawId?: string;
    caselawUrl?: string;
    caseName?: string;
    court?: string;
    jurisdiction?: string;
    year?: number;
    dateDecided?: string;
  };
  error?: string;
}> {
  console.error('[Case.law] API was sunset on September 5, 2024. Use CourtListener instead.');
  return {
    success: false,
    error: 'Case.law API sunset September 5, 2024 - use CourtListener or PACER',
  };
}

/**
 * @deprecated Case.law API sunset September 5, 2024
 */
export const JURISDICTION_SLUGS: Record<string, string> = {};
