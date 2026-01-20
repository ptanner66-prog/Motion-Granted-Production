/**
 * Jurisdictions Configuration
 *
 * v6.3: Jurisdictions and courts for intake form.
 */

export interface Court {
  code: string;
  name: string;
  shortName: string;
}

export interface Jurisdiction {
  code: string;
  name: string;
  type: 'federal' | 'state';
  courts: Court[];
}

export const JURISDICTIONS: Jurisdiction[] = [
  {
    code: 'FED_5TH',
    name: 'Federal — 5th Circuit',
    type: 'federal',
    courts: [
      { code: 'EDLA', name: 'Eastern District of Louisiana', shortName: 'E.D. La.' },
      { code: 'MDLA', name: 'Middle District of Louisiana', shortName: 'M.D. La.' },
      { code: 'WDLA', name: 'Western District of Louisiana', shortName: 'W.D. La.' },
      { code: 'NDTX', name: 'Northern District of Texas', shortName: 'N.D. Tex.' },
      { code: 'SDTX', name: 'Southern District of Texas', shortName: 'S.D. Tex.' },
      { code: 'EDTX', name: 'Eastern District of Texas', shortName: 'E.D. Tex.' },
      { code: 'WDTX', name: 'Western District of Texas', shortName: 'W.D. Tex.' },
      { code: 'NDMS', name: 'Northern District of Mississippi', shortName: 'N.D. Miss.' },
      { code: 'SDMS', name: 'Southern District of Mississippi', shortName: 'S.D. Miss.' },
    ],
  },
  {
    code: 'FED_9TH',
    name: 'Federal — 9th Circuit',
    type: 'federal',
    courts: [
      { code: 'CDCA', name: 'Central District of California', shortName: 'C.D. Cal.' },
      { code: 'NDCA', name: 'Northern District of California', shortName: 'N.D. Cal.' },
      { code: 'SDCA', name: 'Southern District of California', shortName: 'S.D. Cal.' },
      { code: 'EDCA', name: 'Eastern District of California', shortName: 'E.D. Cal.' },
      { code: 'DAZ', name: 'District of Arizona', shortName: 'D. Ariz.' },
      { code: 'DNV', name: 'District of Nevada', shortName: 'D. Nev.' },
      { code: 'DOR', name: 'District of Oregon', shortName: 'D. Or.' },
      { code: 'WDWA', name: 'Western District of Washington', shortName: 'W.D. Wash.' },
      { code: 'EDWA', name: 'Eastern District of Washington', shortName: 'E.D. Wash.' },
    ],
  },
  {
    code: 'CA_STATE',
    name: 'California State Court',
    type: 'state',
    courts: [
      { code: 'CA_LA', name: 'Los Angeles County Superior Court', shortName: 'L.A. Super. Ct.' },
      { code: 'CA_OC', name: 'Orange County Superior Court', shortName: 'Orange Super. Ct.' },
      { code: 'CA_SD', name: 'San Diego County Superior Court', shortName: 'S.D. Super. Ct.' },
      { code: 'CA_SF', name: 'San Francisco County Superior Court', shortName: 'S.F. Super. Ct.' },
      { code: 'CA_ALAMEDA', name: 'Alameda County Superior Court', shortName: 'Alameda Super. Ct.' },
      { code: 'CA_SAC', name: 'Sacramento County Superior Court', shortName: 'Sac. Super. Ct.' },
      { code: 'CA_SANTA_CLARA', name: 'Santa Clara County Superior Court', shortName: 'Santa Clara Super. Ct.' },
      { code: 'CA_RIVERSIDE', name: 'Riverside County Superior Court', shortName: 'Riverside Super. Ct.' },
      { code: 'CA_SB', name: 'San Bernardino County Superior Court', shortName: 'S.B. Super. Ct.' },
      { code: 'CA_OTHER', name: 'Other California Superior Court', shortName: 'CA Super. Ct.' },
    ],
  },
  {
    code: 'LA_STATE',
    name: 'Louisiana State Court',
    type: 'state',
    courts: [
      { code: 'LA_ORLEANS', name: 'Orleans Parish (Civil District Court)', shortName: 'Orleans CDC' },
      { code: 'LA_EBR', name: 'East Baton Rouge Parish (19th JDC)', shortName: '19th JDC' },
      { code: 'LA_JEFFERSON', name: 'Jefferson Parish (24th JDC)', shortName: '24th JDC' },
      { code: 'LA_CADDO', name: 'Caddo Parish (1st JDC)', shortName: '1st JDC' },
      { code: 'LA_CALCASIEU', name: 'Calcasieu Parish (14th JDC)', shortName: '14th JDC' },
      { code: 'LA_LAFAYETTE', name: 'Lafayette Parish (15th JDC)', shortName: '15th JDC' },
      { code: 'LA_ST_TAMMANY', name: 'St. Tammany Parish (22nd JDC)', shortName: '22nd JDC' },
      { code: 'LA_OUACHITA', name: 'Ouachita Parish (4th JDC)', shortName: '4th JDC' },
      { code: 'LA_RAPIDES', name: 'Rapides Parish (9th JDC)', shortName: '9th JDC' },
      { code: 'LA_OTHER', name: 'Other Louisiana Parish', shortName: 'LA JDC' },
    ],
  },
  {
    code: 'TX_STATE',
    name: 'Texas State Court',
    type: 'state',
    courts: [
      { code: 'TX_HARRIS', name: 'Harris County District Court', shortName: 'Harris Dist. Ct.' },
      { code: 'TX_DALLAS', name: 'Dallas County District Court', shortName: 'Dallas Dist. Ct.' },
      { code: 'TX_BEXAR', name: 'Bexar County District Court', shortName: 'Bexar Dist. Ct.' },
      { code: 'TX_TARRANT', name: 'Tarrant County District Court', shortName: 'Tarrant Dist. Ct.' },
      { code: 'TX_TRAVIS', name: 'Travis County District Court', shortName: 'Travis Dist. Ct.' },
      { code: 'TX_OTHER', name: 'Other Texas District Court', shortName: 'TX Dist. Ct.' },
    ],
  },
];

/**
 * Get jurisdiction by code
 */
export function getJurisdictionByCode(code: string): Jurisdiction | undefined {
  return JURISDICTIONS.find(j => j.code === code);
}

/**
 * Get court by codes
 */
export function getCourtByCode(jurisdictionCode: string, courtCode: string): Court | undefined {
  const jurisdiction = getJurisdictionByCode(jurisdictionCode);
  return jurisdiction?.courts.find(c => c.code === courtCode);
}

/**
 * Get all federal jurisdictions
 */
export function getFederalJurisdictions(): Jurisdiction[] {
  return JURISDICTIONS.filter(j => j.type === 'federal');
}

/**
 * Get all state jurisdictions
 */
export function getStateJurisdictions(): Jurisdiction[] {
  return JURISDICTIONS.filter(j => j.type === 'state');
}
