// /lib/services/citations/eyecite-service.ts
// Eyecite-based citation extraction service
// Task E-3 | Version 1.0 — January 28, 2026

import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import type {
  Citation,
  EyeciteOutput,
  EyeciteRawCitation,
  LACodeType,
} from "@/types/citations";
import { extractLouisianaCitations, type LACitation } from "./la-statute-parser";
import { fullPreprocess } from "./citation-preprocessor";
import { resolveAllShorthand } from "./shorthand-resolver";
import { deduplicateCitationsStrict } from "@/lib/civ/deduplication";

const EYECITE_SCRIPT = path.join(process.cwd(), "scripts", "eyecite_extract.py");
const CONTEXT_CHARS = 500; // Characters before/after citation for context

/**
 * Execute the Eyecite Python script
 */
async function runEyeciteScript(text: string): Promise<EyeciteOutput> {
  return new Promise((resolve, reject) => {
    const python = spawn("python3", [EYECITE_SCRIPT]);

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        console.error("[Eyecite] Script error:", stderr);
        reject(new Error(`Eyecite script exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result as EyeciteOutput);
      } catch (parseError) {
        reject(new Error(`Failed to parse Eyecite output: ${parseError}`));
      }
    });

    python.on("error", (err) => {
      reject(new Error(`Failed to spawn Eyecite script: ${err.message}`));
    });

    // Write input text to stdin
    python.stdin.write(text);
    python.stdin.end();
  });
}

/**
 * Extract surrounding context for a citation
 */
function extractContext(
  text: string,
  startIndex: number,
  endIndex: number
): string {
  const contextStart = Math.max(0, startIndex - CONTEXT_CHARS);
  const contextEnd = Math.min(text.length, endIndex + CONTEXT_CHARS);
  return text.substring(contextStart, contextEnd);
}

/**
 * Extract the proposition (sentence containing citation)
 */
function extractProposition(text: string, startIndex: number): string {
  // Find sentence boundaries
  const beforeText = text.substring(Math.max(0, startIndex - 500), startIndex);
  const afterText = text.substring(startIndex, Math.min(text.length, startIndex + 500));

  // Find sentence start (last period/newline before citation)
  const sentenceStartMatch = beforeText.match(/[.!?\n]\s*([^.!?\n]*)$/);
  const sentenceStart = sentenceStartMatch
    ? sentenceStartMatch[1]
    : beforeText.slice(-200);

  // Find sentence end (first period/newline after citation)
  const sentenceEndMatch = afterText.match(/^([^.!?\n]*[.!?])/);
  const sentenceEnd = sentenceEndMatch
    ? sentenceEndMatch[1]
    : afterText.slice(0, 200);

  return (sentenceStart + sentenceEnd).trim();
}

/**
 * Map Eyecite raw citation to our Citation schema
 */
function mapEyeciteCitation(
  raw: EyeciteRawCitation,
  text: string,
  idMap: Map<string, string>
): Citation {
  const id = uuidv4();
  const [startIndex, endIndex] = raw.span || [0, 0];

  // Store mapping for antecedent resolution
  idMap.set(raw.raw, id);

  // Find antecedent ID if this is Id./supra
  let antecedent_citation_id: string | null = null;
  if (raw.antecedent && idMap.has(raw.antecedent)) {
    antecedent_citation_id = idMap.get(raw.antecedent) || null;
  }

  return {
    id,
    raw: raw.raw,
    citation_type: raw.citation_type,
    volume: raw.volume,
    reporter: raw.reporter,
    page: raw.page,
    pinpoint: raw.pinpoint,
    year: raw.year,
    court: raw.court,
    case_name: raw.case_name,
    plaintiff: raw.plaintiff,
    defendant: raw.defendant,
    antecedent_citation_id,
    start_index: startIndex,
    end_index: endIndex,
    page_location: 0, // Will be calculated by document parser
    paragraph_location: 0, // Will be calculated by document parser
    surrounding_context: extractContext(text, startIndex, endIndex),
    proposition: extractProposition(text, startIndex),
    proposition_type: "SECONDARY", // Default, will be analyzed later
    quote_text: null,
    verification_status: "PENDING",
    courtlistener_id: null,
    courtlistener_url: null,
    verification_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Map Louisiana citation to our Citation schema
 */
function mapLACitation(la: LACitation, text: string): Citation {
  return {
    id: uuidv4(),
    raw: la.raw,
    citation_type: "LA_STATUTE",
    volume: la.title || null,
    reporter: null,
    page: null,
    pinpoint: la.subsection || null,
    year: la.year?.toString() || null,
    court: "la",
    case_name: null,
    plaintiff: null,
    defendant: null,
    antecedent_citation_id: null,
    start_index: la.startIndex,
    end_index: la.endIndex,
    page_location: 0,
    paragraph_location: 0,
    surrounding_context: extractContext(text, la.startIndex, la.endIndex),
    proposition: extractProposition(text, la.startIndex),
    proposition_type: "SECONDARY",
    quote_text: null,
    verification_status: "PENDING",
    courtlistener_id: null,
    courtlistener_url: null,
    verification_notes: null,
    la_code_type: la.type as LACodeType,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Determine if a citation is statutory rather than case law.
 * Statutory citations bypass deduplication (BUG #7).
 *
 * Checks both the citation_type field (set by LA parser) and the raw text
 * for common statutory patterns (Art., §, U.S.C., C.F.R., C.C.P., R.S., etc.).
 */
function isStatutoryCitation(citation: Citation): boolean {
  if (citation.citation_type === "LA_STATUTE") return true;
  return /\b(?:Art\.|§|U\.S\.C\.|C\.F\.R\.|C\.C\.P?\.|R\.S\.)\b/i.test(citation.raw);
}

/**
 * Extract all citations from text
 * Combines Louisiana parser + Eyecite
 */
export async function extractCitations(text: string): Promise<Citation[]> {
  const citations: Citation[] = [];
  const idMap = new Map<string, string>();

  // 0. Preprocess text
  const preprocessedText = fullPreprocess(text);

  // 1. Extract Louisiana citations FIRST (Eyecite doesn't recognize them)
  console.log("[Citation] Running Louisiana statute parser...");
  const laCitations = extractLouisianaCitations(preprocessedText);
  console.log(`[Citation] Found ${laCitations.length} Louisiana citations`);

  for (const la of laCitations) {
    citations.push(mapLACitation(la, preprocessedText));
  }

  // 2. Extract remaining citations with Eyecite
  console.log("[Citation] Running Eyecite extraction...");
  try {
    const eyeciteOutput = await runEyeciteScript(preprocessedText);

    if (eyeciteOutput.error) {
      console.error("[Citation] Eyecite error:", eyeciteOutput.error);
      // Don't throw - return what we have from LA parser
    } else {
      console.log(`[Citation] Eyecite found ${eyeciteOutput.count} citations`);

      // 3. Map Eyecite citations and deduplicate
      const seenRaw = new Set(citations.map((c) => c.raw));

      for (const raw of eyeciteOutput.citations) {
        // Skip if already found by LA parser
        if (seenRaw.has(raw.raw)) {
          continue;
        }

        citations.push(mapEyeciteCitation(raw, preprocessedText, idMap));
        seenRaw.add(raw.raw);
      }
    }
  } catch (error) {
    console.error("[Citation] Eyecite execution failed:", error);
    // Continue with LA citations only
  }

  // 4. BUG #7 FIX: Deduplicate case law citations to remove partial/truncated extractions
  // (e.g., "185 So. 3" alongside full "185 So. 3d 94"). Statutory citations bypass dedup.
  const caseLawCitations = citations.filter((c) => !isStatutoryCitation(c));
  const statutoryCitations = citations.filter((c) => isStatutoryCitation(c));

  let dedupedCitations: Citation[];
  if (caseLawCitations.length > 0) {
    const dedupResult = deduplicateCitationsStrict(
      caseLawCitations,
      (c: Citation) => c.raw
    );
    console.log(
      `[Citation] Dedup: ${dedupResult.stats.inputCount} case law in → ` +
      `${dedupResult.stats.uniqueCount} unique (removed ${dedupResult.removed.length}: ` +
      `${dedupResult.stats.seriesTruncations} series, ` +
      `${dedupResult.stats.prefixTruncations} prefix, ` +
      `${dedupResult.stats.substringRemovals} substring, ` +
      `${dedupResult.stats.exactDuplicates} exact, ` +
      `${dedupResult.stats.incompleteRemovals} incomplete)`
    );
    dedupedCitations = [...dedupResult.unique, ...statutoryCitations];
  } else {
    dedupedCitations = [...statutoryCitations];
  }

  // 5. Sort by position in document
  dedupedCitations.sort((a, b) => a.start_index - b.start_index);

  // 6. Resolve shorthand citations (Id., supra, etc.)
  console.log("[Citation] Resolving shorthand citations...");
  resolveAllShorthand(dedupedCitations);

  console.log(`[Citation] Total citations extracted: ${dedupedCitations.length}`);
  return dedupedCitations;
}

/**
 * Resolve Id./supra citations to their antecedents
 * Updates citations in place with antecedent_citation_id
 * @deprecated Use resolveAllShorthand from shorthand-resolver.ts instead
 */
export function resolveShorthandCitations(citations: Citation[]): void {
  resolveAllShorthand(citations);
}

/**
 * Get citation batch size for a phase
 * Per v6.3 Section 0-C: Default 4, Phases V.1 and VII.1 use 2
 */
export function getCitationBatchSize(phase: string): number {
  if (phase === "V.1" || phase === "VII.1") {
    return 2; // Smaller batches prevent memory loops
  }
  return 4; // Default batch size
}

/**
 * Split citations into batches for processing
 */
export function batchCitations(
  citations: Citation[],
  batchSize: number
): Citation[][] {
  const batches: Citation[][] = [];
  for (let i = 0; i < citations.length; i += batchSize) {
    batches.push(citations.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Get extraction statistics
 */
export function getExtractionStats(citations: Citation[]): {
  total: number;
  by_type: Record<string, number>;
  verified: number;
  pending: number;
  failed: number;
} {
  const stats = {
    total: citations.length,
    by_type: {} as Record<string, number>,
    verified: 0,
    pending: 0,
    failed: 0,
  };

  for (const cite of citations) {
    // Count by type
    stats.by_type[cite.citation_type] =
      (stats.by_type[cite.citation_type] || 0) + 1;

    // Count by verification status
    switch (cite.verification_status) {
      case "VERIFIED":
        stats.verified++;
        break;
      case "PENDING":
        stats.pending++;
        break;
      case "FAILED":
      case "BLOCKED":
        stats.failed++;
        break;
    }
  }

  return stats;
}
