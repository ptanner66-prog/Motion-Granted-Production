/**
 * POST /api/admin/orders/[orderId]/citations/save
 *
 * Called by workflow after Phase V to persist citations.
 *
 * Request body:
 * {
 *   caseCitations: [...],      // From Phase IV output
 *   statutoryCitations: [...], // From Phase IV output
 *   citationsUsed: [...],      // From Phase V output (which citations were actually used)
 * }
 *
 * Auth: Internal/admin only
 *
 * Citation Viewer Feature — January 30, 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { saveOrderCitations } from '@/lib/services/citations/citation-service';
import type { SaveCitationInput } from '@/types/citations';

interface CaseCitationInput {
  citation?: string;
  caseName?: string;
  case_name?: string;
  court?: string;
  date_filed?: string;
  dateFiled?: string;
  courtlistener_id?: number | string;
  courtlistenerId?: number | string;
  courtlistener_cluster_id?: number | string;
  courtlistenerClusterId?: number | string;
  proposition?: string;
  relevantHolding?: string;
  authorityLevel?: 'binding' | 'persuasive';
  authority_level?: 'binding' | 'persuasive';
  forElement?: string;
  for_element?: string;
  verification_method?: string;
}

interface StatutoryCitationInput {
  citation?: string;
  name?: string;
  purpose?: string;
  relevantText?: string;
}

interface SaveCitationsRequestBody {
  caseCitations?: CaseCitationInput[];
  statutoryCitations?: StatutoryCitationInput[];
  citationsUsed?: string[]; // Array of citation strings that were actually used in the motion
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Verify user is authenticated and is admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user is admin/clerk
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'clerk')) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Verify order exists
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('id', orderId)
      .single();

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    // Parse request body
    let body: SaveCitationsRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const caseCitations = body.caseCitations || [];
    const statutoryCitations = body.statutoryCitations || [];
    const citationsUsed = new Set(body.citationsUsed || []);

    // Transform citations to SaveCitationInput format
    const citations: SaveCitationInput[] = [];

    // Process case citations
    for (let i = 0; i < caseCitations.length; i++) {
      const c = caseCitations[i];
      const citationString = c.citation || '';

      // Skip if citationsUsed is provided and this citation wasn't used
      if (citationsUsed.size > 0 && !citationsUsed.has(citationString)) {
        continue;
      }

      citations.push({
        citationString,
        caseName: c.caseName || c.case_name || 'Unknown Case',
        caseNameShort: extractShortName(c.caseName || c.case_name || ''),
        courtlistenerOpinionId: c.courtlistener_id?.toString() || c.courtlistenerId?.toString(),
        courtlistenerClusterId: c.courtlistener_cluster_id?.toString() || c.courtlistenerClusterId?.toString(),
        courtlistenerUrl: c.courtlistener_id
          ? `https://www.courtlistener.com/opinion/${c.courtlistener_id}/`
          : undefined,
        court: c.court,
        dateFiled: c.date_filed || c.dateFiled,
        dateFiledDisplay: formatYear(c.date_filed || c.dateFiled),
        citationType: 'case',
        proposition: c.proposition || c.relevantHolding,
        locationInMotion: c.forElement || c.for_element,
        authorityLevel: c.authorityLevel || c.authority_level,
        verificationStatus: 'verified',
        verificationMethod: c.verification_method || 'courtlistener_search',
        displayOrder: i,
      });
    }

    // Process statutory citations
    for (let i = 0; i < statutoryCitations.length; i++) {
      const s = statutoryCitations[i];
      const citationString = s.citation || '';

      // Skip if citationsUsed is provided and this citation wasn't used
      if (citationsUsed.size > 0 && !citationsUsed.has(citationString)) {
        continue;
      }

      citations.push({
        citationString,
        caseName: s.name || citationString,
        citationType: 'statute',
        proposition: s.purpose,
        verificationStatus: 'verified',
        verificationMethod: 'manual',
        displayOrder: caseCitations.length + i,
      });
    }

    // Save citations
    const result = await saveOrderCitations(orderId, citations);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to save citations' },
        { status: 500 }
      );
    }

    // Log the save operation
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action: 'citations_saved',
      details: {
        totalSaved: result.data?.savedCitations,
        caseCitations: result.data?.caseCitations,
        statutoryCitations: result.data?.statutoryCitations,
        savedBy: user.id,
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('[API] Error saving citations:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Extract short case name from full case name
 */
function extractShortName(caseName: string): string {
  if (!caseName) return '';
  const match = caseName.match(/^([^v]+?)(?:\s+v\.?\s+|\s+vs\.?\s+)/i);
  if (match) {
    return match[1].trim().split(/[,\s]/)[0];
  }
  return caseName.split(/[,\s]/)[0] || caseName;
}

/**
 * Extract year from date string
 */
function formatYear(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/(\d{4})/);
  return match ? match[1] : undefined;
}
