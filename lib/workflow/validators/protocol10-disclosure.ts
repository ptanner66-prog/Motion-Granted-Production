/**
 * Protocol 10 AI Disclosure Lookup — BUG-15 Production Fix
 *
 * Determines whether AI disclosure is required based on the court's local rules.
 * Several Louisiana federal courts (EDLA, MDLA, WDLA) have local rules
 * requiring AI disclosure.
 */

// Courts that REQUIRE AI disclosure
const AI_DISCLOSURE_REQUIRED: Record<string, { required: boolean; rule?: string; note?: string }> = {
  // Federal courts with AI disclosure rules
  'EDLA': { required: true, rule: 'Local Rule 83.X', note: 'Eastern District of Louisiana requires AI disclosure' },
  'MDLA': { required: true, rule: 'Local Rule 83.X', note: 'Middle District of Louisiana requires AI disclosure' },
  'WDLA': { required: true, rule: 'Local Rule 83.X', note: 'Western District of Louisiana requires AI disclosure' },
  'NDTX': { required: true, rule: 'Standing Order', note: 'Northern District of Texas requires AI certification' },
  'SDTX': { required: true, rule: 'Local Rule', note: 'Southern District of Texas requires AI disclosure' },

  // State courts — generally no disclosure required (as of 2026)
  '19th JDC': { required: false },
  '1st Circuit': { required: false },
  '2nd Circuit': { required: false },
  '3rd Circuit': { required: false },
  '4th Circuit': { required: false },
  '5th Circuit': { required: false },
};

export interface ProtocolTenResult {
  disclosureRequired: boolean;
  rule?: string;
  note?: string;
  court: string;
}

/**
 * Determine if Protocol 10 AI disclosure is required for the given court.
 */
export function checkProtocol10Disclosure(
  jurisdiction: string,
  courtDivision?: string
): ProtocolTenResult {
  const toCheck = [jurisdiction, courtDivision || ''].map(s => s.toUpperCase().trim());

  for (const [court, config] of Object.entries(AI_DISCLOSURE_REQUIRED)) {
    if (toCheck.some(s => s.includes(court.toUpperCase()))) {
      return {
        disclosureRequired: config.required,
        rule: config.rule,
        note: config.note,
        court,
      };
    }
  }

  // Default: not required (conservative for state courts)
  return {
    disclosureRequired: false,
    court: jurisdiction,
    note: 'No AI disclosure rule found for this jurisdiction',
  };
}
