/**
 * Jurisdiction Registry — ST-038
 * Maps jurisdictions to bar admission states for attorney profile validation.
 * Absorbs D6-007.
 */

export interface JurisdictionConfig {
  stateCode: string;
  stateName: string;
  barAdmissionState: string;
  federalCircuits: string[];
  courtLevels: string[];
  isEnabled: boolean;
}

const REGISTRY: Map<string, JurisdictionConfig> = new Map([
  ['LA', {
    stateCode: 'LA', stateName: 'Louisiana',
    barAdmissionState: 'LA',
    federalCircuits: ['5th'],
    courtLevels: ['district', 'circuit', 'supreme', 'federal'],
    isEnabled: true,
  }],
  ['CA', {
    stateCode: 'CA', stateName: 'California',
    barAdmissionState: 'CA',
    federalCircuits: ['9th'],
    courtLevels: ['superior', 'appellate', 'supreme', 'federal'],
    isEnabled: true,
  }],
  ['TX', {
    stateCode: 'TX', stateName: 'Texas',
    barAdmissionState: 'TX',
    federalCircuits: ['5th'],
    courtLevels: ['district', 'appellate', 'supreme', 'federal'],
    isEnabled: false,
  }],
  ['NY', {
    stateCode: 'NY', stateName: 'New York',
    barAdmissionState: 'NY',
    federalCircuits: ['2nd'],
    courtLevels: ['supreme', 'appellate', 'court_of_appeals', 'federal'],
    isEnabled: false,
  }],
  ['FL', {
    stateCode: 'FL', stateName: 'Florida',
    barAdmissionState: 'FL',
    federalCircuits: ['11th'],
    courtLevels: ['circuit', 'district_appeal', 'supreme', 'federal'],
    isEnabled: false,
  }],
]);

/**
 * Resolve the bar admission state for a jurisdiction.
 * Throws if jurisdiction is unknown or not enabled.
 */
export function resolveBarState(jurisdiction: string): string {
  const config = REGISTRY.get(jurisdiction.toUpperCase());
  if (!config) {
    throw new Error(`Unknown jurisdiction: ${jurisdiction}. Check jurisdiction_toggles.`);
  }
  if (!config.isEnabled) {
    throw new Error(`Jurisdiction ${jurisdiction} is not enabled.`);
  }
  return config.barAdmissionState;
}

/**
 * Get full configuration for a jurisdiction (enabled or not).
 */
export function getJurisdictionConfig(jurisdiction: string): JurisdictionConfig | undefined {
  return REGISTRY.get(jurisdiction.toUpperCase());
}

/**
 * Get all enabled jurisdictions.
 */
export function getEnabledJurisdictions(): JurisdictionConfig[] {
  return [...REGISTRY.values()].filter(j => j.isEnabled);
}
