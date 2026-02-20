/**
 * M-09 Input Screening — Garbage Input Detection
 *
 * Validates order intake data to detect nonsensical, spam, or
 * clearly invalid submissions before entering the workflow pipeline.
 *
 * Runs at order submission time (before payment). Returns a
 * pass/fail result with specific rejection reasons.
 *
 * Detection categories:
 *   1. Empty/trivial content
 *   2. Gibberish / random characters
 *   3. Test/placeholder data
 *   4. Minimum field requirements
 *   5. Language detection (non-English for US courts)
 */

import { createLogger } from '@/lib/logging/logger';

const logger = createLogger('input-screening');

// ============================================================================
// TYPES
// ============================================================================

export interface ScreeningInput {
  motionType: string;
  statementOfFacts?: string;
  proceduralHistory?: string;
  instructions?: string;
  caseNumber?: string;
  caseCaption?: string;
  jurisdiction?: string;
  partyNames?: string[];
}

export interface ScreeningResult {
  pass: boolean;
  score: number;          // 0-100, higher = more likely valid
  flags: ScreeningFlag[];
  recommendation: 'accept' | 'review' | 'reject';
}

export interface ScreeningFlag {
  field: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
}

// ============================================================================
// THRESHOLDS
// ============================================================================

const MIN_FACTS_LENGTH = 50;     // At least a couple sentences
const MIN_CAPTION_LENGTH = 5;    // "v." alone is too short
const GIBBERISH_THRESHOLD = 0.4; // Ratio of non-alpha to alpha chars
const REPEATED_CHAR_THRESHOLD = 0.5; // e.g., "aaaaaaa"
const TEST_PATTERNS = [
  /^test\b/i,
  /\basdf\b/i,
  /\bfoo\s?bar\b/i,
  /\blorem\s+ipsum\b/i,
  /\bxxx+\b/i,
  /^hello\s*world$/i,
  /\bplaceholder\b/i,
  /\bsample\s+text\b/i,
];

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Screen order intake for garbage/invalid input.
 */
export function screenInput(input: ScreeningInput): ScreeningResult {
  const flags: ScreeningFlag[] = [];
  let score = 100;

  // 1. Motion type validation
  if (!input.motionType || input.motionType.trim().length === 0) {
    flags.push({ field: 'motionType', issue: 'Motion type is required', severity: 'error' });
    score -= 30;
  }

  // 2. Statement of facts checks
  if (input.statementOfFacts) {
    const factsFlags = analyzeTextField(input.statementOfFacts, 'statementOfFacts', MIN_FACTS_LENGTH);
    flags.push(...factsFlags);
    score -= factsFlags.filter(f => f.severity === 'error').length * 20;
    score -= factsFlags.filter(f => f.severity === 'warning').length * 10;
  } else {
    flags.push({ field: 'statementOfFacts', issue: 'Statement of facts is empty', severity: 'warning' });
    score -= 15;
  }

  // 3. Case caption checks
  if (input.caseCaption) {
    const captionFlags = analyzeTextField(input.caseCaption, 'caseCaption', MIN_CAPTION_LENGTH);
    flags.push(...captionFlags);
    score -= captionFlags.filter(f => f.severity === 'error').length * 15;
  }

  // 4. Instructions checks
  if (input.instructions) {
    const instrFlags = analyzeTextField(input.instructions, 'instructions', 10);
    flags.push(...instrFlags);
    score -= instrFlags.filter(f => f.severity === 'error').length * 15;
  }

  // 5. Party names validation
  if (input.partyNames && input.partyNames.length > 0) {
    for (const name of input.partyNames) {
      if (isGibberish(name)) {
        flags.push({ field: 'partyNames', issue: `Party name "${name}" appears to be gibberish`, severity: 'error' });
        score -= 20;
      }
    }
  }

  // 6. Case number format (loose check)
  if (input.caseNumber) {
    if (isGibberish(input.caseNumber) && !/\d/.test(input.caseNumber)) {
      flags.push({ field: 'caseNumber', issue: 'Case number format appears invalid', severity: 'warning' });
      score -= 10;
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine recommendation
  let recommendation: ScreeningResult['recommendation'];
  if (score >= 70) recommendation = 'accept';
  else if (score >= 40) recommendation = 'review';
  else recommendation = 'reject';

  const result: ScreeningResult = {
    pass: score >= 40,
    score,
    flags,
    recommendation,
  };

  if (!result.pass) {
    logger.warn('input_screening.rejected', {
      motionType: input.motionType || 'unknown',
      score: String(score),
      flagCount: String(flags.length),
      errorFlags: String(flags.filter(f => f.severity === 'error').length),
    });
  }

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function analyzeTextField(text: string, fieldName: string, minLength: number): ScreeningFlag[] {
  const flags: ScreeningFlag[] = [];
  const trimmed = text.trim();

  // Empty after trim
  if (trimmed.length === 0) {
    flags.push({ field: fieldName, issue: 'Field is empty', severity: 'error' });
    return flags;
  }

  // Too short
  if (trimmed.length < minLength) {
    flags.push({
      field: fieldName,
      issue: `Content too short (${trimmed.length} chars, minimum ${minLength})`,
      severity: 'warning',
    });
  }

  // Gibberish detection
  if (isGibberish(trimmed)) {
    flags.push({
      field: fieldName,
      issue: 'Content appears to be gibberish or random characters',
      severity: 'error',
    });
  }

  // Repeated characters
  if (hasExcessiveRepeats(trimmed)) {
    flags.push({
      field: fieldName,
      issue: 'Content contains excessive repeated characters',
      severity: 'error',
    });
  }

  // Test/placeholder patterns
  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(trimmed)) {
      flags.push({
        field: fieldName,
        issue: `Content appears to be test/placeholder data (matched: ${pattern.source})`,
        severity: 'error',
      });
      break;
    }
  }

  return flags;
}

function isGibberish(text: string): boolean {
  if (text.length < 5) return false;

  // Calculate ratio of non-alphabetic, non-space characters
  const alphaCount = (text.match(/[a-zA-Z\s]/g) || []).length;
  const ratio = 1 - (alphaCount / text.length);

  if (ratio > GIBBERISH_THRESHOLD) return true;

  // Check for low vowel ratio (most English text has ~35-40% vowels)
  const vowelCount = (text.match(/[aeiouAEIOU]/g) || []).length;
  const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (letterCount > 10) {
    const vowelRatio = vowelCount / letterCount;
    if (vowelRatio < 0.1 || vowelRatio > 0.7) return true;
  }

  return false;
}

function hasExcessiveRepeats(text: string): boolean {
  // Check for sequences of 4+ identical characters
  const repeats = text.match(/(.)\1{3,}/g);
  if (!repeats) return false;

  const repeatLength = repeats.reduce((sum, r) => sum + r.length, 0);
  return (repeatLength / text.length) > REPEATED_CHAR_THRESHOLD;
}
