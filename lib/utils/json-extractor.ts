/**
 * JSON Extractor
 *
 * Extracts and parses JSON from Claude's response, handling common issues:
 * 1. Markdown code fences (```json ... ```)
 * 2. Text before/after JSON (preamble/postamble)
 * 3. Trailing commas
 * 4. Control characters
 *
 * Returns { success: true, data } or { success: false, error, rawText }
 */

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
    // Log the failure with context
    const preview = raw.slice(0, 300).replace(/\n/g, '\\n');
    console.error(`[${context.phase}] JSON parse FAILED for order ${context.orderId}. Preview: ${preview}`);
    return {
      success: false,
      error: `JSON parse failed: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
      rawText: raw,
    };
  }
}
