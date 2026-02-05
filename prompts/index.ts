// /prompts/index.ts
// Phase System Prompts v7.5
// Updated: January 31, 2026 (Central Time)
//
// CHANGES FROM v7.4.1:
// - Protocol 20 (Plurality Opinion Check) added to Phase V.1
// - Protocol 21 (Concurrence/Dissent Check) added to Phase V.1
// - Phase VI Tier A skip condition added

import fs from 'fs';
import path from 'path';

const loadPrompt = (filename: string): string => {
  // Use process.cwd() for Next.js compatibility (works in both dev and production build)
  const filePath = path.join(process.cwd(), 'prompts', filename);
  return fs.readFileSync(filePath, 'utf-8');
};

export const PHASE_PROMPTS = {
  PHASE_I: loadPrompt('PHASE_I_SYSTEM_PROMPT_v75.md'),
  PHASE_II: loadPrompt('PHASE_II_SYSTEM_PROMPT_v75.md'),
  PHASE_III: loadPrompt('PHASE_III_SYSTEM_PROMPT_v75.md'),
  PHASE_IV: loadPrompt('PHASE_IV_SYSTEM_PROMPT_v75.md'),
  PHASE_V: loadPrompt('PHASE_V_SYSTEM_PROMPT_v75.md'),
  PHASE_V1: loadPrompt('PHASE_V1_SYSTEM_PROMPT_v75.md'),
  PHASE_VI: loadPrompt('PHASE_VI_SYSTEM_PROMPT_v75.md'),
  PHASE_VII: loadPrompt('PHASE_VII_SYSTEM_PROMPT_v75.md'),
  PHASE_VII1: loadPrompt('PHASE_VII1_SYSTEM_PROMPT_v75.md'),
  PHASE_VIII: loadPrompt('PHASE_VIII_SYSTEM_PROMPT_v75.md'),
  PHASE_VIII5: loadPrompt('PHASE_VIII5_SYSTEM_PROMPT_v75.md'),
  PHASE_IX: loadPrompt('PHASE_IX_SYSTEM_PROMPT_v75.md'),
  PHASE_IX1: loadPrompt('PHASE_IX1_SYSTEM_PROMPT_v75.md'),
  PHASE_X: loadPrompt('PHASE_X_SYSTEM_PROMPT_v75.md'),
} as const;

export type PhaseKey = keyof typeof PHASE_PROMPTS;

// ── PHASE METADATA ──
// Model/ET fields REMOVED — those are now in lib/config/phase-registry.ts (single source of truth).
// This metadata is for display/UI purposes ONLY. For routing, import from phase-registry.
export const PHASE_METADATA = {
  PHASE_I:    { name: 'Intake & Document Processing' },
  PHASE_II:   { name: 'Legal Standards' },
  PHASE_III:  { name: 'Evidence Strategy' },
  PHASE_IV:   { name: 'Authority Research' },
  PHASE_V:    { name: 'Drafting' },
  PHASE_V1:   { name: 'Citation Verification' },
  PHASE_VI:   { name: 'Opposition Anticipation' },
  PHASE_VII:  { name: 'Judge Simulation' },
  PHASE_VII1: { name: 'Post-Revision Citation Check' },
  PHASE_VIII: { name: 'Revisions' },
  PHASE_VIII5:{ name: 'Caption Validation' },
  PHASE_IX:   { name: 'Supporting Documents' },
  PHASE_IX1:  { name: 'Separate Statement Check' },
  PHASE_X:    { name: 'Final Assembly' },
} as const;

export type PhaseMetadata = typeof PHASE_METADATA[PhaseKey];

export function getPhasePrompt(phase: PhaseKey): string {
  return PHASE_PROMPTS[phase];
}

export function getPhaseMetadata(phase: PhaseKey): PhaseMetadata {
  return PHASE_METADATA[phase];
}

// getModelForTier() — REMOVED. Use: import { getModel } from '@/lib/config/phase-registry';
// shouldSkipPhase() — REMOVED. Use: import { isPhaseSkipped } from '@/lib/config/phase-registry';
//   or: import { shouldSkipPhase } from '@/lib/config/workflow-config';

export default PHASE_PROMPTS;
