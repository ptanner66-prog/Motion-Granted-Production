// app/api/admin/states/[code]/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/security/logger';
import { clearPricingCache } from '@/lib/payments/jurisdiction-pricing';

const log = createLogger('api-admin-states-code');

// Allowed fields for admin update - whitelist for security
const ALLOWED_FIELDS = [
  'enabled',
  'state_courts_enabled',
  'pricing_multiplier',
  'notes',
  'motion_availability',
  'formatting_profile',
  'ai_disclosure_required',
  'ai_disclosure_text',
] as const;

interface UpdatePayload {
  enabled?: boolean;
  state_courts_enabled?: boolean;
  pricing_multiplier?: number;
  notes?: string | null;
  motion_availability?: Record<string, unknown>;
  formatting_profile?: string;
  ai_disclosure_required?: boolean;
  ai_disclosure_text?: string | null;
}

interface PatchResponse {
  success: boolean;
  state?: {
    code: string;
    enabled: boolean;
    updated_at: string;
  };
}

interface PatchError {
  error: string;
  details?: string;
}

/**
 * PATCH /api/admin/states/[code]
 * Updates a state's configuration (enabled flag, pricing, etc.)
 * Requires admin authentication.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse<PatchResponse | PatchError>> {
  try {
    const { code } = await params;
    const stateCode = code.toUpperCase();
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Filter to only allowed fields
    const updateData: UpdatePayload = {};
    let hasValidField = false;

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        const value = body[field];

        // Type validation per field
        switch (field) {
          case 'enabled':
          case 'state_courts_enabled':
            if (typeof value !== 'boolean') {
              return NextResponse.json(
                { error: `Field '${field}' must be a boolean` },
                { status: 400 }
              );
            }
            updateData[field] = value;
            break;

          case 'pricing_multiplier':
            if (typeof value !== 'number' || value < 0.5 || value > 3.0) {
              return NextResponse.json(
                { error: 'pricing_multiplier must be a number between 0.5 and 3.0' },
                { status: 400 }
              );
            }
            updateData[field] = value;
            break;

          case 'notes':
            if (value !== null && typeof value !== 'string') {
              return NextResponse.json(
                { error: 'notes must be a string or null' },
                { status: 400 }
              );
            }
            updateData[field] = value as string | null;
            break;

          case 'motion_availability':
            if (typeof value !== 'object' || value === null) {
              return NextResponse.json(
                { error: 'motion_availability must be an object' },
                { status: 400 }
              );
            }
            updateData[field] = value as Record<string, unknown>;
            break;

          case 'formatting_profile':
            if (typeof value !== 'string' || !['standard', 'california', 'louisiana'].includes(value)) {
              return NextResponse.json(
                { error: "formatting_profile must be 'standard', 'california', or 'louisiana'" },
                { status: 400 }
              );
            }
            updateData[field] = value;
            break;

          case 'ai_disclosure_required':
            if (typeof value !== 'boolean') {
              return NextResponse.json(
                { error: `Field '${field}' must be a boolean` },
                { status: 400 }
              );
            }
            updateData[field] = value;
            break;

          case 'ai_disclosure_text':
            if (value !== null && typeof value !== 'string') {
              return NextResponse.json(
                { error: 'ai_disclosure_text must be a string or null' },
                { status: 400 }
              );
            }
            updateData[field] = value as string | null;
            break;
        }

        hasValidField = true;
      }
    }

    if (!hasValidField) {
      return NextResponse.json(
        { error: 'No valid fields to update', details: `Allowed fields: ${ALLOWED_FIELDS.join(', ')}` },
        { status: 400 }
      );
    }

    // Add audit trail
    const updatePayload = {
      ...updateData,
      updated_by: user.email || user.id,
    };

    // Update the state
    const { data: updatedState, error: updateError } = await supabase
      .from('states')
      .update(updatePayload)
      .eq('code', stateCode)
      .select('code, enabled, updated_at')
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: `State '${stateCode}' not found` },
          { status: 404 }
        );
      }
      log.error('Update error', { error: updateError.message, stateCode });
      return NextResponse.json(
        { error: 'Failed to update state' },
        { status: 500 }
      );
    }

    // Clear pricing cache if multiplier was updated
    if ('pricing_multiplier' in updateData) {
      clearPricingCache();
    }

    log.info(`State ${stateCode} updated by ${user.email}`, { stateCode, updateData });

    return NextResponse.json({
      success: true,
      state: updatedState,
    });
  } catch (err) {
    log.error('Unexpected error', { error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
