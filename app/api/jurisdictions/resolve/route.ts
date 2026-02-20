/**
 * POST /api/jurisdictions/resolve
 *
 * Canonical jurisdiction resolver.
 * Takes state + court type and returns a normalized display string
 * for use in captions, filings, and workflow context.
 *
 * Public endpoint — no authentication required (intake form).
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface ResolveRequest {
  stateCode: string;
  courtType: 'STATE' | 'FEDERAL';
  federalDistrict?: string;
  parish?: string;
  county?: string;
}

interface ResolvedJurisdiction {
  display: string;
  stateCode: string;
  stateName: string;
  courtType: 'STATE' | 'FEDERAL';
  federalDistrict: string | null;
  circuit: string | null;
  pricingMultiplier: number;
  aiDisclosureRequired: boolean;
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export async function POST(request: NextRequest) {
  try {
    let body: ResolveRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { stateCode, courtType, federalDistrict, parish, county } = body;

    if (!stateCode || !/^[A-Z]{2}$/.test(stateCode)) {
      return NextResponse.json(
        { error: 'stateCode is required (2 uppercase letters)' },
        { status: 400 }
      );
    }

    if (!courtType || !['STATE', 'FEDERAL'].includes(courtType)) {
      return NextResponse.json(
        { error: 'courtType is required (STATE or FEDERAL)' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch state data
    const { data: state } = await supabase
      .from('states')
      .select('code, name, pricing_multiplier, ai_disclosure_required, federal_circuits')
      .eq('code', stateCode)
      .single();

    const stateName = state?.name || STATE_NAMES[stateCode] || stateCode;
    const pricingMultiplier = state?.pricing_multiplier ?? 1.0;
    const aiDisclosureRequired = state?.ai_disclosure_required ?? false;

    // Resolve circuit from federal_circuits table
    let circuit: string | null = null;
    if (courtType === 'FEDERAL') {
      const { data: circuits } = await supabase
        .from('federal_circuits')
        .select('name, circuit_number')
        .contains('states', [stateCode]);

      if (circuits && circuits.length > 0) {
        circuit = circuits[0].name;
      }
    }

    // Build display string
    let display: string;
    if (courtType === 'FEDERAL') {
      if (federalDistrict) {
        display = `United States District Court, ${federalDistrict}`;
      } else {
        display = `United States District Court (${stateName})`;
      }
    } else {
      // State court
      if (stateCode === 'LA' && parish) {
        display = `${parish} Parish, Louisiana`;
      } else if (county) {
        display = `${county} County, ${stateName}`;
      } else {
        display = `${stateName} State Court`;
      }
    }

    const resolved: ResolvedJurisdiction = {
      display,
      stateCode,
      stateName,
      courtType,
      federalDistrict: federalDistrict || null,
      circuit,
      pricingMultiplier,
      aiDisclosureRequired,
    };

    return NextResponse.json(resolved);
  } catch (err) {
    console.error('[API /api/jurisdictions/resolve] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
