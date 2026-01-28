// /lib/services/citations/shorthand-resolver.ts
// Resolves Id., supra, and other shorthand citations
// Task E-7 | Version 1.0 — January 28, 2026

import type { Citation } from "@/types/citations";

interface ResolutionResult {
  resolved: boolean;
  antecedent_id: string | null;
  antecedent_raw: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  notes: string | null;
}

/**
 * Resolve Id. citations to their antecedent
 *
 * Rules:
 * 1. Id. refers to the immediately preceding citation
 * 2. Must be a full case citation (not another Id.)
 * 3. Must be within the same paragraph or section
 */
export function resolveIdCitation(
  idCitation: Citation,
  allCitations: Citation[]
): ResolutionResult {
  // Find all full case citations before this Id.
  const precedingFull = allCitations
    .filter(
      (c) =>
        c.start_index < idCitation.start_index &&
        c.citation_type === "FULL_CASE"
    )
    .sort((a, b) => b.start_index - a.start_index);

  if (precedingFull.length === 0) {
    return {
      resolved: false,
      antecedent_id: null,
      antecedent_raw: null,
      confidence: "NONE",
      notes: "No preceding full case citation found for Id.",
    };
  }

  const antecedent = precedingFull[0];

  // Check distance - Id. should be close to its antecedent
  const distance = idCitation.start_index - antecedent.end_index;
  let confidence: "HIGH" | "MEDIUM" | "LOW";

  if (distance < 200) {
    confidence = "HIGH";
  } else if (distance < 1000) {
    confidence = "MEDIUM";
  } else {
    confidence = "LOW";
  }

  return {
    resolved: true,
    antecedent_id: antecedent.id,
    antecedent_raw: antecedent.raw,
    confidence,
    notes:
      confidence === "LOW"
        ? `Id. is ${distance} chars from antecedent - verify manually`
        : null,
  };
}

/**
 * Resolve supra citations to their antecedent
 *
 * Rules:
 * 1. Supra refers to a previously cited case
 * 2. May include party name hint (e.g., "Smith, supra")
 * 3. Look for matching case name or first citation
 */
export function resolveSupraCitation(
  supraCitation: Citation,
  allCitations: Citation[]
): ResolutionResult {
  // Extract party name hint from supra citation
  const partyHint = extractSupraPartyHint(supraCitation.raw);

  // Find all full case citations before this supra
  const precedingFull = allCitations
    .filter(
      (c) =>
        c.start_index < supraCitation.start_index &&
        c.citation_type === "FULL_CASE"
    )
    .sort((a, b) => b.start_index - a.start_index);

  if (precedingFull.length === 0) {
    return {
      resolved: false,
      antecedent_id: null,
      antecedent_raw: null,
      confidence: "NONE",
      notes: "No preceding full case citation found for supra",
    };
  }

  // If we have a party hint, try to match it
  if (partyHint) {
    const hint = partyHint.toLowerCase();
    const matching = precedingFull.find((c) => {
      const caseName = (c.case_name || "").toLowerCase();
      const plaintiff = (c.plaintiff || "").toLowerCase();
      const defendant = (c.defendant || "").toLowerCase();
      return (
        caseName.includes(hint) ||
        plaintiff.includes(hint) ||
        defendant.includes(hint)
      );
    });

    if (matching) {
      return {
        resolved: true,
        antecedent_id: matching.id,
        antecedent_raw: matching.raw,
        confidence: "HIGH",
        notes: `Matched supra to "${matching.case_name}" via party name "${partyHint}"`,
      };
    }
  }

  // Fall back to most recent full citation
  const antecedent = precedingFull[0];

  return {
    resolved: true,
    antecedent_id: antecedent.id,
    antecedent_raw: antecedent.raw,
    confidence: partyHint ? "LOW" : "MEDIUM",
    notes: partyHint
      ? `Could not match party "${partyHint}" - using most recent citation`
      : "Using most recent full case citation",
  };
}

/**
 * Extract party name hint from supra citation
 * e.g., "Smith, supra" → "Smith"
 */
function extractSupraPartyHint(raw: string): string | null {
  // Pattern: "Name, supra" or "Name supra"
  const match = raw.match(/^([A-Z][a-zA-Z'.-]+),?\s+supra/i);
  return match ? match[1] : null;
}

/**
 * Resolve Ibid. citations (same as Id.)
 */
export function resolveIbidCitation(
  ibidCitation: Citation,
  allCitations: Citation[]
): ResolutionResult {
  // Ibid. behaves the same as Id.
  return resolveIdCitation(ibidCitation, allCitations);
}

/**
 * Resolve all shorthand citations in a list
 * Updates citations in place with antecedent_citation_id
 */
export function resolveAllShorthand(citations: Citation[]): void {
  for (const cite of citations) {
    let result: ResolutionResult;

    switch (cite.citation_type) {
      case "ID":
        result = resolveIdCitation(cite, citations);
        break;
      case "IBID":
        result = resolveIbidCitation(cite, citations);
        break;
      case "SUPRA":
        result = resolveSupraCitation(cite, citations);
        break;
      default:
        continue;
    }

    cite.antecedent_citation_id = result.antecedent_id;
    if (result.notes) {
      cite.verification_notes = result.notes;
    }

    if (result.resolved) {
      console.log(
        `[ShorthandResolver] Resolved ${cite.citation_type} "${cite.raw}" → "${result.antecedent_raw}" (${result.confidence})`
      );
    } else {
      console.warn(
        `[ShorthandResolver] Could not resolve ${cite.citation_type} "${cite.raw}": ${result.notes}`
      );
    }
  }
}

/**
 * Get statistics about shorthand resolution
 */
export function getResolutionStats(citations: Citation[]): {
  total_shorthand: number;
  resolved: number;
  unresolved: number;
  by_type: Record<string, { total: number; resolved: number }>;
} {
  const shorthandTypes = ["ID", "IBID", "SUPRA"];
  const shorthand = citations.filter((c) =>
    shorthandTypes.includes(c.citation_type)
  );

  const stats = {
    total_shorthand: shorthand.length,
    resolved: shorthand.filter((c) => c.antecedent_citation_id !== null).length,
    unresolved: shorthand.filter((c) => c.antecedent_citation_id === null)
      .length,
    by_type: {} as Record<string, { total: number; resolved: number }>,
  };

  for (const type of shorthandTypes) {
    const ofType = shorthand.filter((c) => c.citation_type === type);
    stats.by_type[type] = {
      total: ofType.length,
      resolved: ofType.filter((c) => c.antecedent_citation_id !== null).length,
    };
  }

  return stats;
}
