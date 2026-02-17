/**
 * JSON Extractor
 *
 * Extracts and parses JSON from Claude's response, handling common issues:
 * 1. Markdown code fences (```json ... ```)
 * 2. Text before/after JSON (preamble/postamble)
 * 3. Trailing commas
 * 4. Control characters
 * 5. Truncated responses (unclosed brackets/braces) via jsonrepair
 *
 * Returns { success: true, data } or { success: false, error, rawText }
 */

import { jsonrepair } from 'jsonrepair';

export type ExtractJSONResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; rawText: string };

export function extractJSON<T = Record<string, unknown>>(
  raw: string,
  context: { phase: string; orderId: string }
): ExtractJSONResult<T> {
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    return { success: false, error: 'Empty response from Claude', rawText: raw || '' };
  }

  let text = raw.trim();

  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // If no code fence, try to find JSON object/array boundaries
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const jsonStart = text.search(/[\[{]/);
    if (jsonStart === -1) {
      return { success: false, error: 'No JSON object or array found in response', rawText: raw };
    }
    text = text.slice(jsonStart);
  }

  // Find matching closing bracket
  if (text.startsWith('{')) {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) text = text.slice(0, lastBrace + 1);
  } else if (text.startsWith('[')) {
    const lastBracket = text.lastIndexOf(']');
    if (lastBracket !== -1) text = text.slice(0, lastBracket + 1);
  }

  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, '$1');

  // Remove control characters (except newlines and tabs which are valid in JSON strings)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');

  // Attempt parse
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data };
  } catch (firstError) {
    // RECOVERY PASS 1: Try all code fences
    const allFences = [...raw.matchAll(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g)];
    for (const fence of allFences) {
      try {
        const cleaned = fence[1].trim().replace(/,\s*([}\]])/g, '$1');
        const data = JSON.parse(cleaned) as T;
        return { success: true, data };
      } catch { continue; }
    }
    // RECOVERY PASS 2: Brace-counted extraction (handles nested objects)
    const braceStart = raw.indexOf('{');
    if (braceStart !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = braceStart; i < raw.length; i++) {
        if (raw[i] === '{') depth++;
        if (raw[i] === '}') depth--;
        if (depth === 0) { end = i; break; }
      }
      if (end !== -1) {
        try {
          let candidate = raw.slice(braceStart, end + 1);
          candidate = candidate.replace(/,\s*([}\]])/g, '$1');
          candidate = candidate.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
          const data = JSON.parse(candidate) as T;
          return { success: true, data };
        } catch { /* fall through */ }
      }
    }
    // RECOVERY PASS 3: Replace common LLM artifacts and retry (BUG #3)
    // When blank fields are in the prompt, Claude sometimes outputs [blank]/[N/A]
    // as bare text instead of valid JSON string values.
    {
      let sanitized = raw.replace(/:\s*\[blank\]/gi, ': ""');
      sanitized = sanitized.replace(/:\s*\[N\/A\]/gi, ': null');
      sanitized = sanitized.replace(/:\s*\[empty\]/gi, ': ""');
      sanitized = sanitized.replace(/:\s*\[none\]/gi, ': null');
      if (sanitized !== raw) {
        const sanitizedBraceStart = sanitized.indexOf('{');
        if (sanitizedBraceStart !== -1) {
          let depth = 0;
          let end = -1;
          for (let i = sanitizedBraceStart; i < sanitized.length; i++) {
            if (sanitized[i] === '{') depth++;
            if (sanitized[i] === '}') depth--;
            if (depth === 0) { end = i; break; }
          }
          if (end !== -1) {
            try {
              let candidate = sanitized.slice(sanitizedBraceStart, end + 1);
              candidate = candidate.replace(/,\s*([}\]])/g, '$1');
              const data = JSON.parse(candidate) as T;
              console.warn(`[${context.phase}] JSON recovered after LLM artifact replacement for order ${context.orderId}`);
              return { success: true, data };
            } catch { /* fall through */ }
          }
        }
      }
    }
    // RECOVERY PASS 4: jsonrepair — handles truncated output, unclosed brackets,
    // missing commas, single quotes, trailing commas, and other structural issues.
    // This is the last-resort recovery for malformed JSON (e.g. response hit max_tokens).
    {
      // Try to isolate the JSON portion from raw text first
      const jsonCandidate = extractJSONCandidate(raw);
      for (const candidate of [jsonCandidate, text, raw]) {
        try {
          const repaired = jsonrepair(candidate);
          const data = JSON.parse(repaired) as T;
          console.warn(`[${context.phase}] JSON recovered via jsonrepair for order ${context.orderId} (input length: ${candidate.length})`);
          return { success: true, data };
        } catch { continue; }
      }
    }
    const preview = raw.slice(0, 300).replace(/\n/g, '\\n');
    const tail = raw.slice(-200).replace(/\n/g, '\\n');
    console.error(`[${context.phase}] JSON parse FAILED for order ${context.orderId}. Length: ${raw.length}. Preview: ${preview}`);
    console.error(`[${context.phase}] Tail: ${tail}`);
    return {
      success: false,
      error: `JSON parse failed after 4 attempts: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
      rawText: raw,
    };
  }
}

/**
 * Extract the best JSON candidate from raw text.
 * Finds the first { and takes everything from there, handling potential truncation.
 */
function extractJSONCandidate(raw: string): string {
  const start = raw.indexOf('{');
  if (start === -1) return raw;
  return raw.slice(start);
}
