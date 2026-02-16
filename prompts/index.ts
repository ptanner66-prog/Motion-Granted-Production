// /prompts/index.ts
// Phase System Prompts v7.5
// Updated: February 13, 2026 (Central Time)
//
// DB-first prompt loading with filesystem fallback.
// phase-executors.ts imports PHASE_PROMPTS from here.
//
// Flow:
//   1. On import: load from v75 markdown files (synchronous, always works)
//   2. On loadPhasePrompts(): try reading from phase_prompts DB table
//   3. If DB read fails or table is empty, keep file-based prompts
//   4. Cache DB results in memory for 5 minutes
//   5. refreshPhasePrompts() forces immediate reload (called after admin edits)

import fs from 'fs';
import path from 'path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ── Phase key definitions ────────────────────────────────────────────────────

/** All valid PHASE_PROMPTS keys. */
export type PhaseKey =
  | 'PHASE_I' | 'PHASE_II' | 'PHASE_III' | 'PHASE_IV'
  | 'PHASE_V' | 'PHASE_V1' | 'PHASE_VI' | 'PHASE_VII'
  | 'PHASE_VII1' | 'PHASE_VIII' | 'PHASE_VIII5'
  | 'PHASE_IX' | 'PHASE_IX1' | 'PHASE_X';

/** Maps PHASE_PROMPTS keys to DB phase column values. */
const PHASE_KEY_TO_DB: Record<PhaseKey, string> = {
  PHASE_I: 'I',
  PHASE_II: 'II',
  PHASE_III: 'III',
  PHASE_IV: 'IV',
  PHASE_V: 'V',
  PHASE_V1: 'V.1',
  PHASE_VI: 'VI',
  PHASE_VII: 'VII',
  PHASE_VII1: 'VII.1',
  PHASE_VIII: 'VIII',
  PHASE_VIII5: 'VIII.5',
  PHASE_IX: 'IX',
  PHASE_IX1: 'IX.1',
  PHASE_X: 'X',
};

/** Reverse map: DB phase values to PHASE_PROMPTS keys. */
const DB_TO_PHASE_KEY: Record<string, PhaseKey> = {};
for (const [key, dbPhase] of Object.entries(PHASE_KEY_TO_DB)) {
  DB_TO_PHASE_KEY[dbPhase] = key as PhaseKey;
}

// ── File-based loading (synchronous fallback) ────────────────────────────────

const PROMPTS_DIR = path.join(process.cwd(), 'prompts');

function loadFromFile(filename: string): string {
  try {
    return fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8');
  } catch {
    console.warn(`[PROMPTS] Failed to read ${filename} from disk`);
    return '';
  }
}

const FILE_MAP: Record<PhaseKey, string> = {
  PHASE_I:     'PHASE_I_SYSTEM_PROMPT_v75.md',
  PHASE_II:    'PHASE_II_SYSTEM_PROMPT_v75.md',
  PHASE_III:   'PHASE_III_SYSTEM_PROMPT_v75.md',
  PHASE_IV:    'PHASE_IV_SYSTEM_PROMPT_v75.md',
  PHASE_V:     'PHASE_V_SYSTEM_PROMPT_v75.md',
  PHASE_V1:    'PHASE_V1_SYSTEM_PROMPT_v75.md',
  PHASE_VI:    'PHASE_VI_SYSTEM_PROMPT_v75.md',
  PHASE_VII:   'PHASE_VII_SYSTEM_PROMPT_v75.md',
  PHASE_VII1:  'PHASE_VII1_SYSTEM_PROMPT_v75.md',
  PHASE_VIII:  'PHASE_VIII_SYSTEM_PROMPT_v75.md',
  PHASE_VIII5: 'PHASE_VIII5_SYSTEM_PROMPT_v75.md',
  PHASE_IX:    'PHASE_IX_SYSTEM_PROMPT_v75.md',
  PHASE_IX1:   'PHASE_IX1_SYSTEM_PROMPT_v75.md',
  PHASE_X:     'PHASE_X_SYSTEM_PROMPT_v75.md',
};

function loadAllFromFiles(): Record<string, string> {
  const prompts: Record<string, string> = {};
  for (const [key, filename] of Object.entries(FILE_MAP)) {
    prompts[key] = loadFromFile(filename);
  }
  return prompts;
}

// ── DB-based loading ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedPrompts: Record<string, string> = {};
let cacheLoadedAt = 0;
let dbAvailable = true; // Optimistic; set false on first failure, retry after TTL

/**
 * Reads all active prompts from the phase_prompts DB table.
 * Returns null if DB is unreachable or table is empty.
 */
async function loadFromDatabase(): Promise<Record<string, string> | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('phase_prompts')
      .select('phase, prompt_content')
      .eq('is_active', true)
      .order('phase_order');

    if (error) {
      console.warn(`[PROMPTS] DB read failed: ${error.message}`);
      dbAvailable = false;
      return null;
    }

    if (!data || data.length === 0) {
      console.warn('[PROMPTS] phase_prompts table is empty, using file fallback');
      return null;
    }

    // Map DB rows (phase: 'I', 'V.1') to PHASE_PROMPTS keys (PHASE_I, PHASE_V1)
    const prompts: Record<string, string> = {};
    for (const row of data) {
      const phaseKey = DB_TO_PHASE_KEY[row.phase];
      if (phaseKey && row.prompt_content) {
        prompts[phaseKey] = row.prompt_content;
      }
    }

    // Only accept if we got a reasonable number of prompts
    if (Object.keys(prompts).length < 10) {
      console.warn(`[PROMPTS] DB returned only ${Object.keys(prompts).length} prompts, expected 14. Using file fallback.`);
      return null;
    }

    dbAvailable = true;
    return prompts;
  } catch (err) {
    console.warn('[PROMPTS] DB connection failed, using file fallback:', err);
    dbAvailable = false;
    return null;
  }
}

/**
 * Load prompts from DB (preferred) or files (fallback).
 * Call at the start of each workflow run to ensure fresh prompts.
 * Results are cached for 5 minutes.
 */
export async function loadPhasePrompts(): Promise<Record<string, string>> {
  const now = Date.now();

  // Return cache if still fresh
  if (Object.keys(cachedPrompts).length > 0 && (now - cacheLoadedAt) < CACHE_TTL_MS) {
    return cachedPrompts;
  }

  // Try DB first
  if (dbAvailable || (now - cacheLoadedAt) >= CACHE_TTL_MS) {
    const dbPrompts = await loadFromDatabase();
    if (dbPrompts && Object.keys(dbPrompts).length > 0) {
      cachedPrompts = dbPrompts;
      cacheLoadedAt = now;
      console.log(`[PROMPTS] Loaded ${Object.keys(dbPrompts).length} prompts from database`);
      return cachedPrompts;
    }
  }

  // Fallback to files
  cachedPrompts = loadAllFromFiles();
  cacheLoadedAt = now;
  console.log(`[PROMPTS] Loaded ${Object.keys(cachedPrompts).length} prompts from files (fallback)`);
  return cachedPrompts;
}

/**
 * Force-reload prompts from DB. Call after admin saves an edit.
 */
export async function refreshPhasePrompts(): Promise<void> {
  cacheLoadedAt = 0; // Invalidate cache
  dbAvailable = true; // Retry DB
  await loadPhasePrompts();
}

// ── Lazy initialization (V-006) ─────────────────────────────────────────────
// File-based prompts are loaded lazily on first access instead of at module
// import time. This avoids unnecessary filesystem I/O during Vercel cold starts
// for routes that never touch the workflow engine.
//
// The validated Set tracks which phase keys have been checked for non-empty
// content. Safe to keep in module scope — warm instances benefit from the cache,
// cold starts simply re-validate on first access.

const validated = new Set<string>();
let lazyLoaded = false;

function ensureLoaded(): void {
  if (lazyLoaded) return;
  cachedPrompts = loadAllFromFiles();
  cacheLoadedAt = Date.now();
  lazyLoaded = true;
}

function validatePhasePrompt(key: string): void {
  if (validated.has(key)) return;
  ensureLoaded();
  const content = cachedPrompts[key];
  if (!content || content.trim().length === 0) {
    console.error(`[PROMPTS] Phase prompt "${key}" is empty or missing`);
  }
  validated.add(key);
}

// ── PHASE_PROMPTS export (backward-compatible) ──────────────────────────────
//
// phase-executors.ts does: import { PHASE_PROMPTS } from '@/prompts'
// and accesses PHASE_PROMPTS.PHASE_I synchronously.
//
// The Proxy ensures any access gets the latest cached value, whether
// it came from files (initial) or DB (after loadPhasePrompts() call).

export const PHASE_PROMPTS: Record<PhaseKey, string> = new Proxy(
  {} as Record<PhaseKey, string>,
  {
    get(_target, prop: string) {
      // V-006: Lazy load + validate on first access per phase key
      if (typeof prop === 'string' && prop.startsWith('PHASE_')) {
        validatePhasePrompt(prop);
      } else {
        ensureLoaded();
      }
      return cachedPrompts[prop] ?? '';
    },
    ownKeys() {
      ensureLoaded();
      return Object.keys(cachedPrompts);
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      ensureLoaded();
      if (prop in cachedPrompts) {
        return { configurable: true, enumerable: true, value: cachedPrompts[prop] };
      }
      return undefined;
    },
    has(_target, prop: string) {
      ensureLoaded();
      return prop in cachedPrompts;
    },
  }
);

// ── PHASE METADATA ──────────────────────────────────────────────────────────
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
