/**
 * PACER Types
 *
 * Type definitions for PACER API integration.
 * PACER (Public Access to Court Electronic Records) provides access
 * to federal court documents.
 */

export interface PACERCredentials {
  username: string;
  password: string;
}

export interface PACERCase {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  courtId: string;
  dateFiled: string;
  dateTermed?: string;
  caseType: string;
}

export interface PACERSearchParams {
  caseNumber?: string;
  courtId?: string;
  caseName?: string;
  filedYear?: number;
  partyName?: string;
}

export interface PACERLookupResult {
  found: boolean;
  caseId?: string;
  caseName?: string;
  court?: string;
  url?: string;
  cost?: number;
  error?: string;
}

export interface PACERCost {
  lookup: number;
  document: number;
  currentSession: number;
}

// Federal court IDs for PACER
export const FEDERAL_COURT_IDS: Record<string, string> = {
  // Circuit Courts
  'ca1': '1st Circuit',
  'ca2': '2nd Circuit',
  'ca3': '3rd Circuit',
  'ca4': '4th Circuit',
  'ca5': '5th Circuit',
  'ca6': '6th Circuit',
  'ca7': '7th Circuit',
  'ca8': '8th Circuit',
  'ca9': '9th Circuit',
  'ca10': '10th Circuit',
  'ca11': '11th Circuit',
  'cadc': 'D.C. Circuit',
  'cafc': 'Federal Circuit',

  // Select District Courts
  'nysd': 'S.D.N.Y.',
  'nyed': 'E.D.N.Y.',
  'cacd': 'C.D. Cal.',
  'cand': 'N.D. Cal.',
  'txnd': 'N.D. Tex.',
  'txsd': 'S.D. Tex.',
  'ilnd': 'N.D. Ill.',
  'dcd': 'D.D.C.',
  'flsd': 'S.D. Fla.',
  'paed': 'E.D. Pa.',
};
