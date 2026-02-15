/**
 * Shared tier normalization utility.
 * Canonical implementation — all files must import from here.
 * Extracted from doc-gen-bridge.ts (more complete version) during AUDIT-008 cleanup.
 */

export function normalizeTier(tier: unknown): 'A' | 'B' | 'C' | 'D' {
  if (tier === 'A' || tier === 'B' || tier === 'C' || tier === 'D') return tier;
  if (typeof tier === 'number') {
    if (tier <= 1) return 'A';
    if (tier === 2) return 'B';
    if (tier === 3) return 'C';
    if (tier === 4) return 'D';
    return 'C';
  }
  if (typeof tier === 'string') {
    const upper = tier.toUpperCase();
    if (upper === 'A' || upper === 'B' || upper === 'C' || upper === 'D') return upper as 'A' | 'B' | 'C' | 'D';
    if (tier === '1' || tier === '0') return 'A';
    if (tier === '2') return 'B';
    if (tier === '3') return 'C';
    if (tier === '4') return 'D';
  }
  return 'B'; // Default to Tier B
}
