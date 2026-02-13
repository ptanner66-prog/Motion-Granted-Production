#!/usr/bin/env npx tsx

/**
 * Seed Phase Prompts — v7.5
 *
 * Loads the 14 phase system prompts from v75 markdown files into the
 * phase_prompts table. Also creates initial version history entries.
 *
 * Usage: npx tsx scripts/seed-phase-prompts.ts
 *
 * Safe to re-run — uses upsert (ON CONFLICT UPDATE).
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 *   - Phase prompt files in /prompts/ directory (PHASE_*_v75.md)
 *   - Migration 20260213100001_phase_prompts.sql applied
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Phase configuration: maps v75 files to DB rows.
 *
 * phase       — DB key (matches phase_prompts.phase column from migration 023)
 * name        — Display name
 * order       — Execution order
 * file        — Filename in /prompts/
 */
const PHASES = [
  { phase: 'I',     name: 'Intake & Document Processing',    order: 1,  file: 'PHASE_I_SYSTEM_PROMPT_v75.md' },
  { phase: 'II',    name: 'Legal Standards',                  order: 2,  file: 'PHASE_II_SYSTEM_PROMPT_v75.md' },
  { phase: 'III',   name: 'Evidence Strategy',                order: 3,  file: 'PHASE_III_SYSTEM_PROMPT_v75.md' },
  { phase: 'IV',    name: 'Authority Research',               order: 4,  file: 'PHASE_IV_SYSTEM_PROMPT_v75.md' },
  { phase: 'V',     name: 'Drafting',                         order: 5,  file: 'PHASE_V_SYSTEM_PROMPT_v75.md' },
  { phase: 'V.1',   name: 'Citation Verification',            order: 6,  file: 'PHASE_V1_SYSTEM_PROMPT_v75.md' },
  { phase: 'VI',    name: 'Opposition Anticipation',          order: 7,  file: 'PHASE_VI_SYSTEM_PROMPT_v75.md' },
  { phase: 'VII',   name: 'Judge Simulation',                 order: 8,  file: 'PHASE_VII_SYSTEM_PROMPT_v75.md' },
  { phase: 'VII.1', name: 'Post-Revision Citation Check',     order: 9,  file: 'PHASE_VII1_SYSTEM_PROMPT_v75.md' },
  { phase: 'VIII',  name: 'Revisions',                        order: 10, file: 'PHASE_VIII_SYSTEM_PROMPT_v75.md' },
  { phase: 'VIII.5',name: 'Caption Validation',               order: 11, file: 'PHASE_VIII5_SYSTEM_PROMPT_v75.md' },
  { phase: 'IX',    name: 'Supporting Documents',             order: 12, file: 'PHASE_IX_SYSTEM_PROMPT_v75.md' },
  { phase: 'IX.1',  name: 'Separate Statement Check',         order: 13, file: 'PHASE_IX1_SYSTEM_PROMPT_v75.md' },
  { phase: 'X',     name: 'Final Assembly',                   order: 14, file: 'PHASE_X_SYSTEM_PROMPT_v75.md' },
];

async function seed(): Promise<void> {
  console.log('Seeding Phase Prompts v7.5...\n');

  const promptsDir = path.join(process.cwd(), 'prompts');

  if (!fs.existsSync(promptsDir)) {
    console.error('prompts/ directory not found!');
    process.exit(1);
  }

  let successCount = 0;
  let errorCount = 0;

  for (const config of PHASES) {
    const filePath = path.join(promptsDir, config.file);

    if (!fs.existsSync(filePath)) {
      console.error(`[SKIP] ${config.file} not found`);
      errorCount++;
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

    // Upsert into phase_prompts (main table)
    const { error: upsertError } = await supabase
      .from('phase_prompts')
      .upsert(
        {
          phase: config.phase,
          phase_name: config.name,
          phase_order: config.order,
          prompt_content: content,
          version: '7.5',
          edit_version: 1,
          updated_by: 'seed-script',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phase' }
      );

    if (upsertError) {
      console.error(`[ERROR] Phase ${config.phase}: ${upsertError.message}`);
      errorCount++;
      continue;
    }

    // Insert version 1 in history (ignore conflict if already exists)
    const { error: versionError } = await supabase
      .from('phase_prompt_versions')
      .upsert(
        {
          phase: config.phase,
          prompt_content: content,
          edit_version: 1,
          edited_by: 'seed-script',
          edit_note: 'Initial seed from v75 markdown files',
        },
        { onConflict: 'phase,edit_version' }
      );

    if (versionError) {
      // Non-fatal — the prompt itself was saved
      console.warn(`[WARN] Version history for ${config.phase}: ${versionError.message}`);
    }

    console.log(`[OK] Phase ${config.phase}: ${config.name} (${wordCount} words)`);
    successCount++;
  }

  console.log(`\nSeeded ${successCount} prompts, ${errorCount} errors.`);

  // Verify
  const { data: rows } = await supabase
    .from('phase_prompts')
    .select('phase, phase_name, edit_version')
    .eq('is_active', true)
    .order('phase_order');

  if (rows && rows.length > 0) {
    console.log(`\nVerification: ${rows.length} active prompts in phase_prompts table`);
    for (const row of rows) {
      console.log(`  - ${row.phase}: ${row.phase_name} (edit v${row.edit_version})`);
    }
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
