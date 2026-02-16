// ============================================================
// lib/config/protocol-thresholds.ts
// Protocol 7 tier-specific thresholds
// Source: D9 C-2 | SP-13 AO-2
// ============================================================

export interface P7Thresholds {
  pause: number;    // WARNING threshold
  critical: number; // CRITICAL (HOLD trigger) threshold
}

// BINDING (02/15 R3): These values are LAW
export const PROTOCOL_7_THRESHOLDS: Record<string, P7Thresholds> = {
  A: { pause: 3, critical: 5 },
  B: { pause: 5, critical: 8 },
  C: { pause: 7, critical: 12 },
  D: { pause: 7, critical: 12 },
};
