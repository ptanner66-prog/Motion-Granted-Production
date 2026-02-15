/**
 * OPPOSITION INTEGRATOR
 *
 * TASK-06: Ensure Phase VIII revisions cite authorities identified
 * by Phase VI opposition analysis.
 *
 * Audit Evidence (Pelican order):
 * Phase VI identified:
 * - SWAT 24 Shreveport Bossier v. Bond, 808 So.2d 294 (La. 2001)
 * - Vartech Systems v. Hayden, 951 So.2d 247 (La. App. 1st Cir. 2006)
 *
 * All 3 judge simulation loops flagged both cases.
 * All 3 revision instruction sets told Phase VIII to address them.
 * Neither case appears in the final motion.
 *
 * @module opposition-integrator
 */

import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OppositionAuthority {
  caseName: string;
  citation: string;
  argument: string;           // Which opposition argument this supports
  likelihood: 'HIGH' | 'MEDIUM' | 'LOW';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  recommendedResponse: string; // How to distinguish/address
}

export interface OppositionAnalysis {
  anticipatedArguments: {
    argument: string;
    likelihood: 'HIGH' | 'MEDIUM' | 'LOW';
    strength: 'STRONG' | 'MODERATE' | 'WEAK';
    likelyAuthority: OppositionAuthority | null;
    ourResponse: string;
  }[];
}

export interface AuthorityCheckResult {
  authority: OppositionAuthority;
  addressed: boolean;
  citedByName: boolean;
  distinguished: boolean;
  location?: string; // Where in the motion it was addressed
}

export interface RevisionInstruction {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  instruction: string;
  authority: OppositionAuthority;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract HIGH-likelihood authorities that must be addressed.
 */
export function getRequiredAuthorities(
  oppositionAnalysis: OppositionAnalysis
): OppositionAuthority[] {
  return oppositionAnalysis.anticipatedArguments
    .filter(arg =>
      arg.likelihood === 'HIGH' &&
      (arg.strength === 'STRONG' || arg.strength === 'MODERATE') &&
      arg.likelyAuthority !== null
    )
    .map(arg => arg.likelyAuthority!);
}

/**
 * Check if opposition authorities are addressed in the motion text.
 */
export function checkAuthoritiesAddressed(
  motionText: string,
  authorities: OppositionAuthority[]
): AuthorityCheckResult[] {
  const results: AuthorityCheckResult[] = [];
  const textLower = motionText.toLowerCase();

  for (const authority of authorities) {
    const caseNameLower = authority.caseName.toLowerCase();
    const shortName = extractShortCaseName(authority.caseName).toLowerCase();

    // Check if case is cited by name
    const citedByName =
      textLower.includes(caseNameLower) ||
      textLower.includes(shortName);

    // Check if case is distinguished (mentioned with distinguishing language)
    const distinguished = citedByName && (
      textLower.includes(`${shortName} is distinguishable`) ||
      textLower.includes(`unlike ${shortName}`) ||
      textLower.includes(`${shortName} does not apply`) ||
      textLower.includes(`${shortName} is inapposite`) ||
      textLower.includes(`${shortName}, however,`)
    );

    // Check if the doctrine is addressed (even without case name)
    const doctrineAddressed = checkDoctrineAddressed(textLower, authority.argument);

    results.push({
      authority,
      addressed: citedByName || doctrineAddressed,
      citedByName,
      distinguished,
      location: citedByName ? findLocation(motionText, shortName) : undefined,
    });

    if (!citedByName) {
      logger.warn('[OPPOSITION-INTEGRATOR] Authority not cited by name', {
        caseName: authority.caseName,
        citation: authority.citation,
        argument: authority.argument,
      });
    }
  }

  return results;
}

/**
 * Generate revision instructions for unaddressed authorities.
 */
export function generateRevisionInstructions(
  checkResults: AuthorityCheckResult[]
): RevisionInstruction[] {
  const instructions: RevisionInstruction[] = [];

  for (const result of checkResults) {
    if (!result.citedByName) {
      instructions.push({
        priority: result.authority.strength === 'STRONG' ? 'CRITICAL' : 'HIGH',
        instruction: `ADDRESS OPPOSITION AUTHORITY: Cite and distinguish ${result.authority.caseName}, ${result.authority.citation}. ` +
          `This case supports the opposing argument that ${result.authority.argument}. ` +
          `Recommended response: ${result.authority.recommendedResponse}`,
        authority: result.authority,
      });
    } else if (!result.distinguished) {
      instructions.push({
        priority: 'MEDIUM',
        instruction: `STRENGTHEN DISTINCTION: ${result.authority.caseName} is cited but not clearly distinguished. ` +
          `Add explicit distinguishing language explaining why this case does not control.`,
        authority: result.authority,
      });
    }
  }

  return instructions;
}

/**
 * Generate AIS section for unaddressed opposition authorities.
 */
export function generateAISOppositionSection(
  checkResults: AuthorityCheckResult[]
): string {
  const unaddressed = checkResults.filter(r => !r.citedByName);

  if (unaddressed.length === 0) {
    return '';
  }

  let section = '## Opposition Authorities to Prepare For\n\n';
  section += 'The following authorities were identified as likely opposition citations but are not addressed in the motion:\n\n';

  for (const result of unaddressed) {
    section += `- **${result.authority.caseName}**, ${result.authority.citation}\n`;
    section += `  - Supports: ${result.authority.argument}\n`;
    section += `  - Strength: ${result.authority.strength}\n`;
    section += `  - Recommended response: ${result.authority.recommendedResponse}\n\n`;
  }

  return section;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractShortCaseName(fullName: string): string {
  // "SWAT 24 Shreveport Bossier, Inc. v. Bond" → "SWAT 24"
  // "Vartech Systems, Inc. v. Hayden" → "Vartech"
  const match = fullName.match(/^([A-Za-z0-9\s]+?)(?:,?\s*Inc\.?|,?\s*LLC|,?\s*Corp\.?)?(?:\s+v\.?\s+)/i);
  if (match) {
    return match[1].trim().split(' ')[0]; // First word
  }
  return fullName.split(' ')[0];
}

function checkDoctrineAddressed(text: string, argument: string): boolean {
  // Extract key concepts from the argument
  const argLower = argument.toLowerCase();

  const concepts = [
    'preparation to compete',
    'mere preparation',
    'non-solicitation applies to',
    '23:921 applies',
  ];

  for (const concept of concepts) {
    if (argLower.includes(concept) && text.includes(concept)) {
      return true;
    }
  }

  return false;
}

function findLocation(text: string, shortName: string): string | undefined {
  const index = text.toLowerCase().indexOf(shortName.toLowerCase());
  if (index === -1) return undefined;

  // Find surrounding context
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + shortName.length + 50);

  return `...${text.slice(start, end)}...`;
}
