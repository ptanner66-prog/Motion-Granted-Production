#!/usr/bin/env npx tsx

/**
 * Seed Phase Prompts Script v7.4.1
 *
 * Loads the 14 phase system prompts into the database.
 * Updates both phase_prompts and workflow_phase_definitions tables.
 *
 * Usage:
 *   npx tsx scripts/seed-phase-prompts.ts
 *
 * Prerequisites:
 * - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 * - Phase prompt files exist in /prompts/ directory (v7.4.1)
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

// Model strings from /lib/config/models.ts v7.4.1
const SONNET = 'claude-sonnet-4-5-20250514';
const OPUS = 'claude-opus-4-5-20250514';

// Token budgets per v7.4.1 spec
const STANDARD_BUDGET = 64000;
const EXTENDED_BUDGET = 128000;

// Phase configuration v7.4.1
interface PhaseConfig {
  phase: string;
  name: string;
  order: number;
  file: string;
  modelA: string;
  modelB: string;
  modelC: string;
  thinkingA: { enabled: boolean; budget: number };
  thinkingB: { enabled: boolean; budget: number };
  thinkingC: { enabled: boolean; budget: number };
  maxTokens: number;
  checkpointType: string | null;
  checkpointBlocking: boolean;
  nextPhase: string | null;
}

const PHASE_CONFIG: PhaseConfig[] = [
  {
    phase: 'I',
    name: 'Intake & Document Processing',
    order: 1,
    file: 'PHASE_I_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'II',
  },
  {
    phase: 'II',
    name: 'Legal Standards & Motion Deconstruction',
    order: 2,
    file: 'PHASE_II_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'III',
  },
  {
    phase: 'III',
    name: 'Evidence Strategy & Argument Structure',
    order: 3,
    file: 'PHASE_III_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: 'HOLD',
    checkpointBlocking: true,
    nextPhase: 'IV',
  },
  {
    phase: 'IV',
    name: 'Authority Research',
    order: 4,
    file: 'PHASE_IV_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: OPUS, modelC: OPUS,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: 'NOTIFICATION',
    checkpointBlocking: false,
    nextPhase: 'V',
  },
  {
    phase: 'V',
    name: 'Draft Motion & Memorandum',
    order: 5,
    file: 'PHASE_V_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'V.1',
  },
  {
    phase: 'V.1',
    name: 'Citation Accuracy Check (7-Step Pipeline)',
    order: 6,
    file: 'PHASE_V1_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'VI',
  },
  {
    phase: 'VI',
    name: 'Opposition Anticipation',
    order: 7,
    file: 'PHASE_VI_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: OPUS, modelC: OPUS,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: true, budget: EXTENDED_BUDGET },
    thinkingC: { enabled: true, budget: EXTENDED_BUDGET },
    maxTokens: EXTENDED_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'VII',
  },
  {
    phase: 'VII',
    name: 'Judge Simulation',
    order: 8,
    file: 'PHASE_VII_SYSTEM_PROMPT_v741.md',
    modelA: OPUS, modelB: OPUS, modelC: OPUS, // ALWAYS OPUS
    thinkingA: { enabled: true, budget: EXTENDED_BUDGET }, // ALWAYS ENABLED
    thinkingB: { enabled: true, budget: EXTENDED_BUDGET },
    thinkingC: { enabled: true, budget: EXTENDED_BUDGET },
    maxTokens: EXTENDED_BUDGET,
    checkpointType: 'NOTIFICATION',
    checkpointBlocking: false,
    nextPhase: 'VIII.5',
  },
  {
    phase: 'VII.1',
    name: 'Post-Revision Citation Check',
    order: 9,
    file: 'PHASE_VII1_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'VII', // Loop back to Judge Simulation
  },
  {
    phase: 'VIII',
    name: 'Revisions',
    order: 10,
    file: 'PHASE_VIII_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: OPUS, modelC: OPUS,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: true, budget: EXTENDED_BUDGET },
    thinkingC: { enabled: true, budget: EXTENDED_BUDGET },
    maxTokens: EXTENDED_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'VII.1', // Loop to citation check
  },
  {
    phase: 'VIII.5',
    name: 'Caption Validation',
    order: 11,
    file: 'PHASE_VIII5_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'IX',
  },
  {
    phase: 'IX',
    name: 'Supporting Documents',
    order: 12,
    file: 'PHASE_IX_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'IX.1',
  },
  {
    phase: 'IX.1',
    name: 'Separate Statement Check (MSJ/MSA)',
    order: 13,
    file: 'PHASE_IX1_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'X',
  },
  {
    phase: 'X',
    name: 'Final Assembly',
    order: 14,
    file: 'PHASE_X_SYSTEM_PROMPT_v741.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    maxTokens: STANDARD_BUDGET,
    checkpointType: 'BLOCKING',
    checkpointBlocking: true,
    nextPhase: null,
  },
];

async function seedPhasePrompts(): Promise<void> {
  console.log('🚀 Seeding Phase Prompts v7.4.1...\n');

  const promptsDir = path.join(process.cwd(), 'prompts');

  if (!fs.existsSync(promptsDir)) {
    console.error('❌ prompts/ directory not found!');
    process.exit(1);
  }

  let successCount = 0;
  let errorCount = 0;

  for (const config of PHASE_CONFIG) {
    try {
      // Read prompt from file
      const filePath = path.join(promptsDir, config.file);

      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${config.file}`);
        errorCount++;
        continue;
      }

      const promptContent = fs.readFileSync(filePath, 'utf-8');
      console.log(`📄 Read: ${config.file} (${promptContent.length} bytes)`);

      // Upsert into phase_prompts table
      const { error: phaseError } = await supabase.from('phase_prompts').upsert(
        {
          phase: config.phase,
          phase_name: config.name,
          phase_order: config.order,
          prompt_content: promptContent,
          model_tier_a: config.modelA,
          model_tier_b: config.modelB,
          model_tier_c: config.modelC,
          extended_thinking_tier_a: config.thinkingA,
          extended_thinking_tier_b: config.thinkingB,
          extended_thinking_tier_c: config.thinkingC,
          max_tokens: config.maxTokens,
          checkpoint_type: config.checkpointType,
          checkpoint_blocking: config.checkpointBlocking,
          next_phase: config.nextPhase,
          version: '7.4.1',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phase' }
      );

      if (phaseError) {
        console.error(`   ⚠️ phase_prompts error: ${phaseError.message}`);
      }

      // Also upsert into workflow_phase_definitions table
      const { error: workflowError } = await supabase.from('workflow_phase_definitions').upsert(
        {
          phase_key: config.phase,
          phase_name: config.name,
          phase_order: config.order,
          system_prompt: promptContent,
          model_tier_a: config.modelA,
          model_tier_b: config.modelB,
          model_tier_c: config.modelC,
          extended_thinking_tier_a: config.thinkingA,
          extended_thinking_tier_b: config.thinkingB,
          extended_thinking_tier_c: config.thinkingC,
          max_tokens: config.maxTokens,
          checkpoint_type: config.checkpointType,
          checkpoint_blocking: config.checkpointBlocking,
          next_phase: config.nextPhase,
          version: '7.4.1',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phase_key' }
      );

      if (workflowError) {
        console.error(`   ⚠️ workflow_phase_definitions error: ${workflowError.message}`);
      }

      if (!phaseError || !workflowError) {
        console.log(`✅ Phase ${config.phase}: ${config.name}`);
        successCount++;
      } else {
        errorCount++;
      }
    } catch (error) {
      console.error(`❌ Failed to seed Phase ${config.phase}:`, error);
      errorCount++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 Seeding Complete!');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('═'.repeat(50));

  // Verify seeding in phase_prompts
  const { data: phasePrompts } = await supabase
    .from('phase_prompts')
    .select('phase, phase_name, version')
    .eq('is_active', true)
    .order('phase_order');

  if (phasePrompts && phasePrompts.length > 0) {
    console.log(`\n📋 phase_prompts table: ${phasePrompts.length} phases`);
    phasePrompts.forEach((p) => {
      console.log(`   - ${p.phase}: ${p.phase_name} (v${p.version})`);
    });
  }

  // Verify seeding in workflow_phase_definitions
  const { data: workflowDefs } = await supabase
    .from('workflow_phase_definitions')
    .select('phase_key, phase_name, version')
    .eq('is_active', true)
    .order('phase_order');

  if (workflowDefs && workflowDefs.length > 0) {
    console.log(`\n📋 workflow_phase_definitions table: ${workflowDefs.length} phases`);
    workflowDefs.forEach((p) => {
      console.log(`   - ${p.phase_key}: ${p.phase_name} (v${p.version})`);
    });
  }
}

// Run the script
seedPhasePrompts()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
