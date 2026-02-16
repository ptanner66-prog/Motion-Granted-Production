// ============================================================
// lib/config/required-fields.ts
// Protocol 16 — Motion-specific required fields
// Source: D9 C-9 | SP-13 AO-9
// ============================================================

export interface RequiredField {
  fieldName: string;
  description: string;
  required: boolean;
  applicablePath: 'A' | 'B' | 'BOTH'; // Filing (A) vs Opposing (B)
}

// Motion-specific required fields — top 5 per tier (Decision 4)
// Populated as Clay provides data for top 20 motions
const MOTION_REQUIRED_FIELDS: Record<string, RequiredField[]> = {};

const GENERIC_REQUIRED_FIELDS: RequiredField[] = [
  { fieldName: 'case_name', description: 'Full case name', required: true, applicablePath: 'BOTH' },
  { fieldName: 'case_number', description: 'Case number', required: true, applicablePath: 'BOTH' },
  { fieldName: 'court', description: 'Court name', required: true, applicablePath: 'BOTH' },
  { fieldName: 'moving_party', description: 'Party filing motion', required: true, applicablePath: 'BOTH' },
  { fieldName: 'legal_basis', description: 'Legal basis for motion', required: true, applicablePath: 'BOTH' },
];

export function getRequiredFields(
  motionType: string,
  pathType: 'A' | 'B'
): RequiredField[] {
  if (pathType !== 'A' && pathType !== 'B') {
    throw new TypeError(`Invalid pathType: ${pathType}. Must be 'A' or 'B'.`);
  }

  const normalized = (motionType || '').toUpperCase();
  const specific = MOTION_REQUIRED_FIELDS[normalized];

  if (specific && specific.length > 0) {
    return specific.filter(f => f.applicablePath === pathType || f.applicablePath === 'BOTH');
  }

  return GENERIC_REQUIRED_FIELDS.filter(f => f.applicablePath === pathType || f.applicablePath === 'BOTH');
}
