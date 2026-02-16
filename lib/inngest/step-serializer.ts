// lib/inngest/step-serializer.ts
// IV-002: Step output serialization validator
// JSON round-trip makes Inngest serialization behavior explicit
// Catches: Buffer → object, Date → string, circular references, Map/Set loss

import { NonRetriableError } from 'inngest';

/**
 * Serialize step output through JSON round-trip to catch serialization issues
 * early. Inngest serializes all step outputs to JSON internally — this makes
 * that behavior explicit and catches problems at the source rather than in
 * downstream steps.
 *
 * Wrap every step.run() callback:
 *   step.run('phase-ii', () => serializeStepOutput('phase-ii', executePhaseII(orderId)))
 */
export function serializeStepOutput<T>(stepName: string, output: T): T {
  try {
    const serialized = JSON.parse(JSON.stringify(output));

    if (process.env.NODE_ENV === 'development') {
      const losses = detectSerializationLosses(output, serialized);
      if (losses.length > 0) {
        console.warn(`[Inngest:${stepName}] Serialization losses:`, losses);
      }
    }

    // Check payload size (Inngest limit ~4MB)
    const size = JSON.stringify(serialized).length;
    if (size > 2_000_000) {
      console.warn(`[Inngest:${stepName}] Step output is ${(size / 1_000_000).toFixed(1)}MB. Inngest limit is ~4MB.`);
    }

    return serialized;
  } catch (error) {
    // Circular reference, BigInt, or other non-serializable type
    throw new NonRetriableError(
      `Step "${stepName}" output is not JSON-serializable: ${error instanceof Error ? error.message : 'Unknown'}`,
      { cause: error }
    );
  }
}

function detectSerializationLosses(original: unknown, serialized: unknown, path = ''): string[] {
  const losses: string[] = [];

  if (original instanceof Date) {
    losses.push(`${path || 'root'}: Date → string`);
  } else if (original instanceof Buffer || (original && typeof original === 'object' && 'type' in (original as Record<string, unknown>) && (original as Record<string, unknown>).type === 'Buffer')) {
    losses.push(`${path || 'root'}: Buffer → object`);
  } else if (original instanceof Map) {
    losses.push(`${path || 'root'}: Map → object (empty)`);
  } else if (original instanceof Set) {
    losses.push(`${path || 'root'}: Set → object (empty)`);
  } else if (typeof original === 'object' && original !== null && typeof serialized === 'object' && serialized !== null) {
    for (const key of Object.keys(original as Record<string, unknown>)) {
      if (!(key in (serialized as Record<string, unknown>))) {
        losses.push(`${path}.${key}: undefined (dropped)`);
      } else {
        losses.push(...detectSerializationLosses(
          (original as Record<string, unknown>)[key],
          (serialized as Record<string, unknown>)[key],
          `${path}.${key}`
        ));
      }
    }
  }

  return losses;
}
