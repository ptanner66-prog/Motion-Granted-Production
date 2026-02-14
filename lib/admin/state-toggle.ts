/**
 * 50-State Toggle System
 *
 * Manages which jurisdictions are enabled for accepting orders.
 * TypeScript is SOURCE OF TRUTH for static state metadata (name, circuit, districts).
 * Database stores ONLY toggle flags and audit trail.
 *
 * Default: Only Louisiana is enabled.
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('admin-state-toggle');
export interface StateToggleConfig {
  stateCode: string;
  stateName: string;
  enabled: boolean;
  acceptingOrders: boolean;
  enabledAt?: string;
  disabledAt?: string;
  enabledBy?: string;
  supportedMotionTypes: string[];
  notes?: string;
}

const STATE_METADATA: Record<string, { name: string; circuit: string; districts: string[] }> = {
  AL: { name: 'Alabama', circuit: '11th', districts: ['N.D. Ala.', 'M.D. Ala.', 'S.D. Ala.'] },
  AK: { name: 'Alaska', circuit: '9th', districts: ['D. Alaska'] },
  AZ: { name: 'Arizona', circuit: '9th', districts: ['D. Ariz.'] },
  AR: { name: 'Arkansas', circuit: '8th', districts: ['E.D. Ark.', 'W.D. Ark.'] },
  CA: { name: 'California', circuit: '9th', districts: ['N.D. Cal.', 'E.D. Cal.', 'C.D. Cal.', 'S.D. Cal.'] },
  CO: { name: 'Colorado', circuit: '10th', districts: ['D. Colo.'] },
  CT: { name: 'Connecticut', circuit: '2nd', districts: ['D. Conn.'] },
  DE: { name: 'Delaware', circuit: '3rd', districts: ['D. Del.'] },
  DC: { name: 'District of Columbia', circuit: 'D.C.', districts: ['D.D.C.'] },
  FL: { name: 'Florida', circuit: '11th', districts: ['N.D. Fla.', 'M.D. Fla.', 'S.D. Fla.'] },
  GA: { name: 'Georgia', circuit: '11th', districts: ['N.D. Ga.', 'M.D. Ga.', 'S.D. Ga.'] },
  HI: { name: 'Hawaii', circuit: '9th', districts: ['D. Haw.'] },
  ID: { name: 'Idaho', circuit: '9th', districts: ['D. Idaho'] },
  IL: { name: 'Illinois', circuit: '7th', districts: ['N.D. Ill.', 'C.D. Ill.', 'S.D. Ill.'] },
  IN: { name: 'Indiana', circuit: '7th', districts: ['N.D. Ind.', 'S.D. Ind.'] },
  IA: { name: 'Iowa', circuit: '8th', districts: ['N.D. Iowa', 'S.D. Iowa'] },
  KS: { name: 'Kansas', circuit: '10th', districts: ['D. Kan.'] },
  KY: { name: 'Kentucky', circuit: '6th', districts: ['E.D. Ky.', 'W.D. Ky.'] },
  LA: { name: 'Louisiana', circuit: '5th', districts: ['E.D. La.', 'M.D. La.', 'W.D. La.'] },
  ME: { name: 'Maine', circuit: '1st', districts: ['D. Me.'] },
  MD: { name: 'Maryland', circuit: '4th', districts: ['D. Md.'] },
  MA: { name: 'Massachusetts', circuit: '1st', districts: ['D. Mass.'] },
  MI: { name: 'Michigan', circuit: '6th', districts: ['E.D. Mich.', 'W.D. Mich.'] },
  MN: { name: 'Minnesota', circuit: '8th', districts: ['D. Minn.'] },
  MS: { name: 'Mississippi', circuit: '5th', districts: ['N.D. Miss.', 'S.D. Miss.'] },
  MO: { name: 'Missouri', circuit: '8th', districts: ['E.D. Mo.', 'W.D. Mo.'] },
  MT: { name: 'Montana', circuit: '9th', districts: ['D. Mont.'] },
  NE: { name: 'Nebraska', circuit: '8th', districts: ['D. Neb.'] },
  NV: { name: 'Nevada', circuit: '9th', districts: ['D. Nev.'] },
  NH: { name: 'New Hampshire', circuit: '1st', districts: ['D.N.H.'] },
  NJ: { name: 'New Jersey', circuit: '3rd', districts: ['D.N.J.'] },
  NM: { name: 'New Mexico', circuit: '10th', districts: ['D.N.M.'] },
  NY: { name: 'New York', circuit: '2nd', districts: ['N.D.N.Y.', 'S.D.N.Y.', 'E.D.N.Y.', 'W.D.N.Y.'] },
  NC: { name: 'North Carolina', circuit: '4th', districts: ['E.D.N.C.', 'M.D.N.C.', 'W.D.N.C.'] },
  ND: { name: 'North Dakota', circuit: '8th', districts: ['D.N.D.'] },
  OH: { name: 'Ohio', circuit: '6th', districts: ['N.D. Ohio', 'S.D. Ohio'] },
  OK: { name: 'Oklahoma', circuit: '10th', districts: ['N.D. Okla.', 'E.D. Okla.', 'W.D. Okla.'] },
  OR: { name: 'Oregon', circuit: '9th', districts: ['D. Or.'] },
  PA: { name: 'Pennsylvania', circuit: '3rd', districts: ['E.D. Pa.', 'M.D. Pa.', 'W.D. Pa.'] },
  RI: { name: 'Rhode Island', circuit: '1st', districts: ['D.R.I.'] },
  SC: { name: 'South Carolina', circuit: '4th', districts: ['D.S.C.'] },
  SD: { name: 'South Dakota', circuit: '8th', districts: ['D.S.D.'] },
  TN: { name: 'Tennessee', circuit: '6th', districts: ['E.D. Tenn.', 'M.D. Tenn.', 'W.D. Tenn.'] },
  TX: { name: 'Texas', circuit: '5th', districts: ['N.D. Tex.', 'S.D. Tex.', 'E.D. Tex.', 'W.D. Tex.'] },
  UT: { name: 'Utah', circuit: '10th', districts: ['D. Utah'] },
  VT: { name: 'Vermont', circuit: '2nd', districts: ['D. Vt.'] },
  VA: { name: 'Virginia', circuit: '4th', districts: ['E.D. Va.', 'W.D. Va.'] },
  WA: { name: 'Washington', circuit: '9th', districts: ['E.D. Wash.', 'W.D. Wash.'] },
  WV: { name: 'West Virginia', circuit: '4th', districts: ['N.D.W. Va.', 'S.D.W. Va.'] },
  WI: { name: 'Wisconsin', circuit: '7th', districts: ['E.D. Wis.', 'W.D. Wis.'] },
  WY: { name: 'Wyoming', circuit: '10th', districts: ['D. Wyo.'] },
};

export function getStateMetadata(stateCode: string) {
  return STATE_METADATA[stateCode.toUpperCase()] || null;
}

export function getAllStateMetadata() {
  return STATE_METADATA;
}

export async function getStateToggles(
  supabase: SupabaseClient
): Promise<StateToggleConfig[]> {
  const { data: toggles, error } = await supabase
    .from('jurisdiction_toggles')
    .select('*')
    .order('state_code');

  if (error) {
    log.error('[state-toggle] Failed to fetch toggles:', error);
    return Object.entries(STATE_METADATA).map(([code, meta]) => ({
      stateCode: code,
      stateName: meta.name,
      enabled: code === 'LA',
      acceptingOrders: code === 'LA',
      supportedMotionTypes: code === 'LA'
        ? ['MCOMPEL', 'MTD_12B6', 'MTC', 'MSJ', 'MIL', 'MTL', 'MSEAL']
        : [],
    }));
  }

  return Object.entries(STATE_METADATA).map(([code, meta]) => {
    const dbToggle = toggles?.find((t: Record<string, unknown>) => t.state_code === code);
    return {
      stateCode: code,
      stateName: meta.name,
      enabled: (dbToggle?.enabled as boolean) ?? (code === 'LA'),
      acceptingOrders: (dbToggle?.accepting_orders as boolean) ?? (code === 'LA'),
      enabledAt: dbToggle?.enabled_at as string | undefined,
      disabledAt: dbToggle?.disabled_at as string | undefined,
      enabledBy: dbToggle?.enabled_by as string | undefined,
      supportedMotionTypes: (dbToggle?.supported_motion_types as string[]) ?? [],
      notes: dbToggle?.notes as string | undefined,
    };
  });
}

export async function toggleState(
  supabase: SupabaseClient,
  stateCode: string,
  enabled: boolean,
  userId: string,
  motionTypes?: string[]
): Promise<{ success: boolean; error?: string }> {
  const meta = STATE_METADATA[stateCode.toUpperCase()];
  if (!meta) {
    return { success: false, error: `Unknown state code: ${stateCode}` };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('jurisdiction_toggles')
    .upsert({
      state_code: stateCode.toUpperCase(),
      state_name: meta.name,
      enabled,
      accepting_orders: enabled,
      enabled_at: enabled ? now : null,
      disabled_at: enabled ? null : now,
      enabled_by: userId,
      supported_motion_types: motionTypes || [],
      updated_at: now,
    }, {
      onConflict: 'state_code',
    });

  if (error) {
    log.error('[state-toggle] Toggle failed:', { stateCode, enabled, error });
    return { success: false, error: error.message };
  }

  const auditResult = await supabase.from('audit_log').insert({
    action: enabled ? 'state_enabled' : 'state_disabled',
    actor_id: userId,
    entity_type: 'jurisdiction',
    entity_id: stateCode.toUpperCase(),
    metadata: { stateCode, enabled, motionTypes },
    created_at: now,
  });
  if (auditResult.error) {
    log.warn('[state-toggle] Audit log insert failed:', auditResult.error.message);
  }

  log.info(`[state-toggle] ${stateCode} ${enabled ? 'ENABLED' : 'DISABLED'} by ${userId}`);
  return { success: true };
}

export async function isStateAcceptingOrders(
  supabase: SupabaseClient,
  stateCode: string,
  motionType?: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('jurisdiction_toggles')
    .select('enabled, accepting_orders, supported_motion_types')
    .eq('state_code', stateCode.toUpperCase())
    .single();

  if (error || !data) {
    return stateCode.toUpperCase() === 'LA';
  }

  if (!data.enabled || !data.accepting_orders) return false;

  if (motionType && data.supported_motion_types?.length > 0) {
    return (data.supported_motion_types as string[]).includes(motionType);
  }

  return true;
}
