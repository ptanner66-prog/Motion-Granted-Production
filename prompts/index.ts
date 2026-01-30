// prompts/index.ts
// Phase System Prompts v7.4.1
// Generated: January 28, 2026

import fs from 'fs';
import path from 'path';

const loadPrompt = (filename: string): string => {
  // Use process.cwd() for Next.js compatibility (works in both dev and production build)
  const filePath = path.join(process.cwd(), 'prompts', filename);
  return fs.readFileSync(filePath, 'utf-8');
};

export const PHASE_PROMPTS = {
  PHASE_I: loadPrompt('PHASE_I_SYSTEM_PROMPT_v741.md'),
  PHASE_II: loadPrompt('PHASE_II_SYSTEM_PROMPT_v741.md'),
  PHASE_III: loadPrompt('PHASE_III_SYSTEM_PROMPT_v741.md'),
  PHASE_IV: loadPrompt('PHASE_IV_SYSTEM_PROMPT_v741.md'),
  PHASE_V: loadPrompt('PHASE_V_SYSTEM_PROMPT_v741.md'),
  PHASE_V1: loadPrompt('PHASE_V1_SYSTEM_PROMPT_v741.md'),
  PHASE_VI: loadPrompt('PHASE_VI_SYSTEM_PROMPT_v741.md'),
  PHASE_VII: loadPrompt('PHASE_VII_SYSTEM_PROMPT_v741.md'),
  PHASE_VII1: loadPrompt('PHASE_VII1_SYSTEM_PROMPT_v741.md'),
  PHASE_VIII: loadPrompt('PHASE_VIII_SYSTEM_PROMPT_v741.md'),
  PHASE_VIII5: loadPrompt('PHASE_VIII5_SYSTEM_PROMPT_v741.md'),
  PHASE_IX: loadPrompt('PHASE_IX_SYSTEM_PROMPT_v741.md'),
  PHASE_IX1: loadPrompt('PHASE_IX1_SYSTEM_PROMPT_v741.md'),
  PHASE_X: loadPrompt('PHASE_X_SYSTEM_PROMPT_v741.md'),
} as const;

export type PhaseKey = keyof typeof PHASE_PROMPTS;

export const PHASE_METADATA = {
  PHASE_I: {
    name: 'Intake & Document Processing',
    mode: 'CODE' as const,
    model: 'sonnet' as const,
    extendedThinking: null,
  },
  PHASE_II: {
    name: 'Legal Standards',
    mode: 'CODE' as const,
    model: 'sonnet' as const,
    extendedThinking: null,
  },
  PHASE_III: {
    name: 'Evidence Strategy',
    mode: 'CHAT' as const,
    model: 'tier_dependent' as const,
    extendedThinking: null,
  },
  PHASE_IV: {
    name: 'Authority Research',
    mode: 'CODE' as const,
    model: 'tier_dependent' as const,
    extendedThinking: null,
  },
  PHASE_V: {
    name: 'Drafting',
    mode: 'CHAT' as const,
    model: 'sonnet' as const,
    extendedThinking: null,
  },
  PHASE_V1: {
    name: 'Citation Verification',
    mode: 'CODE' as const,
    model: 'openai_opus' as const,
    extendedThinking: null,
  },
  PHASE_VI: {
    name: 'Opposition Anticipation',
    mode: 'CHAT' as const,
    model: 'tier_dependent' as const,
    extendedThinking: 8000,
  },
  PHASE_VII: {
    name: 'Judge Simulation',
    mode: 'CHAT' as const,
    model: 'opus' as const,
    extendedThinking: 10000,
  },
  PHASE_VII1: {
    name: 'Post-Revision Citation Check',
    mode: 'CODE' as const,
    model: 'openai_opus' as const,
    extendedThinking: null,
  },
  PHASE_VIII: {
    name: 'Revisions',
    mode: 'CHAT' as const,
    model: 'tier_dependent' as const,
    extendedThinking: 8000,
  },
  PHASE_VIII5: {
    name: 'Caption Validation',
    mode: 'CODE' as const,
    model: 'sonnet' as const,
    extendedThinking: null,
  },
  PHASE_IX: {
    name: 'Supporting Documents',
    mode: 'CODE' as const,
    model: 'sonnet' as const,
    extendedThinking: null,
  },
  PHASE_IX1: {
    name: 'Separate Statement Check',
    mode: 'CODE' as const,
    model: 'sonnet' as const,
    extendedThinking: null,
  },
  PHASE_X: {
    name: 'Final Assembly',
    mode: 'CODE' as const,
    model: 'sonnet' as const,
    extendedThinking: null,
  },
} as const;

export type PhaseMetadata = typeof PHASE_METADATA[PhaseKey];

export function getPhasePrompt(phase: PhaseKey): string {
  return PHASE_PROMPTS[phase];
}

export function getPhaseMetadata(phase: PhaseKey): PhaseMetadata {
  return PHASE_METADATA[phase];
}

export function getModelForTier(
  phase: PhaseKey,
  tier: 'A' | 'B' | 'C'
): 'sonnet' | 'opus' {
  const metadata = PHASE_METADATA[phase];
  if (metadata.model === 'tier_dependent') {
    return tier === 'A' ? 'sonnet' : 'opus';
  }
  if (metadata.model === 'opus') return 'opus';
  return 'sonnet';
}

export default PHASE_PROMPTS;
