/**
 * User Pre-Population API (SP-14 Task 6)
 *
 * Returns profile data and last order data for form pre-population.
 * Used by the consolidated intake form to pre-fill returning customers.
 *
 * Pre-fills:
 *   - Jurisdiction (from profile's primary state of licensure)
 *   - Case details from most recent order (case number, court, parties, judge, counsel)
 *
 * Security: Authenticated endpoint — user can only access their own data (RLS enforced).
 *
 * @module api/user/prepopulation
 */

import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user profile for state of licensure
    const { data: profile } = await supabase
      .from('profiles')
      .select('states_licensed, firm_name, firm_address, bar_number')
      .eq('id', user.id)
      .single();

    // Fetch most recent order
    const { data: lastOrder } = await supabase
      .from('orders')
      .select('id, case_number, court_division, case_caption, jurisdiction, related_entities')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Determine primary state from licensure
    const primaryState = profile?.states_licensed?.[0] || null;

    // Extract party names and metadata from related_entities JSON or parties table
    let plaintiffNames = '';
    let defendantNames = '';
    let judgeName = '';
    let opposingCounselName = '';
    let opposingCounselFirm = '';

    if (lastOrder) {
      // Try related_entities JSON first (SP-14 format)
      if (lastOrder.related_entities) {
        try {
          const metadata = typeof lastOrder.related_entities === 'string'
            ? JSON.parse(lastOrder.related_entities)
            : lastOrder.related_entities;
          plaintiffNames = metadata.plaintiff_names || '';
          defendantNames = metadata.defendant_names || '';
          judgeName = metadata.judge_name || '';
          opposingCounselName = metadata.opposing_counsel_name || '';
          opposingCounselFirm = metadata.opposing_counsel_firm || '';
        } catch {
          // related_entities is not JSON — skip
        }
      }

      // Fallback: derive party names from parties table if not in related_entities
      if (!plaintiffNames || !defendantNames) {
        const { data: parties } = await supabase
          .from('parties')
          .select('party_name, party_role')
          .eq('order_id', lastOrder.id);

        if (parties && parties.length > 0) {
          const plaintiffs = parties
            .filter((p: { party_role: string; party_name: string }) => p.party_role === 'Plaintiff')
            .map((p: { party_name: string }) => p.party_name);
          const defendants = parties
            .filter((p: { party_role: string; party_name: string }) => p.party_role === 'Defendant')
            .map((p: { party_name: string }) => p.party_name);

          if (plaintiffs.length > 0 && !plaintiffNames) {
            plaintiffNames = plaintiffs.join('; ');
          }
          if (defendants.length > 0 && !defendantNames) {
            defendantNames = defendants.join('; ');
          }
        }
      }
    }

    return NextResponse.json({
      primaryState,
      firmName: profile?.firm_name || null,
      firmAddress: profile?.firm_address || null,
      barNumber: profile?.bar_number || null,
      lastOrder: lastOrder ? {
        case_number: lastOrder.case_number,
        court_division: lastOrder.court_division,
        plaintiff_names: plaintiffNames,
        defendant_names: defendantNames,
        judge_name: judgeName,
        opposing_counsel_name: opposingCounselName,
        opposing_counsel_firm: opposingCounselFirm,
      } : null,
    });

  } catch (error) {
    console.error('Pre-population error:', error);
    return NextResponse.json({ error: 'Failed to load pre-population' }, { status: 500 });
  }
}
