#!/usr/bin/env npx tsx

/**
 * Seed Phase Prompts Script
 *
 * Loads the 14 phase system prompts into the phase_prompts table.
 *
 * Usage:
 *   npx tsx scripts/seed-phase-prompts.ts
 *
 * Prerequisites:
 * - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 * - Database migration 018_workflow_v72_phase_system.sql has been run
 * - Phase prompt files exist in /prompts/ directory (optional - uses defaults if not found)
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

// Phase configuration based on megaprompt specifications
interface PhaseConfig {
  phase: string;
  name: string;
  order: number;
  file?: string;
  modelA: string;
  modelB: string;
  modelC: string;
  thinkingA: { enabled: boolean; budget: number };
  thinkingB: { enabled: boolean; budget: number };
  thinkingC: { enabled: boolean; budget: number };
  checkpointType: string | null;
  checkpointBlocking: boolean;
  nextPhase: string | null;
}

const SONNET = 'claude-sonnet-4-5-20250929';
const OPUS = 'claude-opus-4-5-20251101';

const PHASE_CONFIG: PhaseConfig[] = [
  {
    phase: 'I',
    name: 'Intake & Document Processing',
    order: 1,
    file: 'PHASE_I_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'II',
  },
  {
    phase: 'II',
    name: 'Legal Standards / Motion Deconstruction',
    order: 2,
    file: 'PHASE_II_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'III',
  },
  {
    phase: 'III',
    name: 'Evidence Strategy / Issue Identification',
    order: 3,
    file: 'PHASE_III_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: 'HOLD',
    checkpointBlocking: true,
    nextPhase: 'IV',
  },
  {
    phase: 'IV',
    name: 'Authority Research',
    order: 4,
    file: 'PHASE_IV_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: OPUS, modelC: OPUS,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: 'NOTIFICATION',
    checkpointBlocking: false,
    nextPhase: 'V',
  },
  {
    phase: 'V',
    name: 'Drafting',
    order: 5,
    file: 'PHASE_V_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'V.1',
  },
  {
    phase: 'V.1',
    name: 'Citation Accuracy Check',
    order: 6,
    file: 'PHASE_V1_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'VI',
  },
  {
    phase: 'VI',
    name: 'Opposition Anticipation',
    order: 7,
    file: 'PHASE_VI_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: OPUS, modelC: OPUS,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: true, budget: 8000 },
    thinkingC: { enabled: true, budget: 8000 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'VII',
  },
  {
    phase: 'VII',
    name: 'Judge Simulation',
    order: 8,
    file: 'PHASE_VII_SYSTEM_PROMPT_v721.md',
    modelA: OPUS, modelB: OPUS, modelC: OPUS, // ALWAYS OPUS
    thinkingA: { enabled: true, budget: 10000 }, // ALWAYS ENABLED
    thinkingB: { enabled: true, budget: 10000 },
    thinkingC: { enabled: true, budget: 10000 },
    checkpointType: 'NOTIFICATION',
    checkpointBlocking: false,
    nextPhase: 'VIII.5',
  },
  {
    phase: 'VII.1',
    name: 'Post-Revision Citation Check',
    order: 9,
    file: 'PHASE_VII1_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'VII',
  },
  {
    phase: 'VIII',
    name: 'Revisions',
    order: 10,
    file: 'PHASE_VIII_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: true, budget: 8000 },
    thinkingC: { enabled: true, budget: 8000 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'VII.1',
  },
  {
    phase: 'VIII.5',
    name: 'Caption Validation',
    order: 11,
    file: 'PHASE_VIII5_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'IX',
  },
  {
    phase: 'IX',
    name: 'Supporting Documents',
    order: 12,
    file: 'PHASE_IX_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'IX.1',
  },
  {
    phase: 'IX.1',
    name: 'Separate Statement Check',
    order: 13,
    file: 'PHASE_IX1_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: null,
    checkpointBlocking: false,
    nextPhase: 'X',
  },
  {
    phase: 'X',
    name: 'Final Assembly',
    order: 14,
    file: 'PHASE_X_SYSTEM_PROMPT_v721.md',
    modelA: SONNET, modelB: SONNET, modelC: SONNET,
    thinkingA: { enabled: false, budget: 0 },
    thinkingB: { enabled: false, budget: 0 },
    thinkingC: { enabled: false, budget: 0 },
    checkpointType: 'BLOCKING',
    checkpointBlocking: true,
    nextPhase: null,
  },
];

// Default placeholder prompt content
function getDefaultPromptContent(phase: string, name: string): string {
  return `# Phase ${phase}: ${name}

## System Prompt v7.2.1

You are executing Phase ${phase} of the Motion Granted workflow system.

### Your Role
${name}

### Instructions
Process the input data according to this phase's requirements and return structured JSON output.

### Output Format
Return ONLY valid JSON with the following structure:
\`\`\`json
{
  "phase": "${phase}",
  "status": "complete",
  "output": {
    // Phase-specific output data
  }
}
\`\`\`

Do not include any text outside of the JSON response.
`;
}

async function seedPhasePrompts(): Promise<void> {
  console.log('🚀 Starting Phase Prompts Seeding...\n');

  const promptsDir = path.join(process.cwd(), 'prompts');
  const hasPromptsDir = fs.existsSync(promptsDir);

  if (!hasPromptsDir) {
    console.log('📁 No /prompts directory found. Creating with default prompts...');
    fs.mkdirSync(promptsDir, { recursive: true });
  }

  let successCount = 0;
  let errorCount = 0;

  for (const config of PHASE_CONFIG) {
    try {
      // Try to read prompt from file, fall back to default
      let promptContent: string;
      const filePath = config.file ? path.join(promptsDir, config.file) : null;

      if (filePath && fs.existsSync(filePath)) {
        promptContent = fs.readFileSync(filePath, 'utf-8');
        console.log(`📄 Read prompt from: ${config.file}`);
      } else {
        promptContent = getDefaultPromptContent(config.phase, config.name);
        console.log(`📝 Using default prompt for Phase ${config.phase}`);

        // Optionally write default to file
        if (filePath) {
          fs.writeFileSync(filePath, promptContent, 'utf-8');
          console.log(`   Created: ${config.file}`);
        }
      }

      // Upsert into database
      const { error } = await supabase.from('phase_prompts').upsert(
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
          checkpoint_type: config.checkpointType,
          checkpoint_blocking: config.checkpointBlocking,
          next_phase: config.nextPhase,
          version: '7.2.1',
          is_active: true,
        },
        {
          onConflict: 'phase',
        }
      );

      if (error) {
        throw error;
      }

      console.log(`✅ Seeded Phase ${config.phase}: ${config.name}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to seed Phase ${config.phase}:`, error);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Seeding Complete!`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('='.repeat(50));

  // Verify seeding
  const { data: prompts, error: verifyError } = await supabase
    .from('phase_prompts')
    .select('phase, phase_name, is_active')
    .eq('is_active', true)
    .order('phase_order');

  if (verifyError) {
    console.error('\n⚠️ Failed to verify seeding:', verifyError.message);
  } else {
    console.log(`\n📋 Verified ${prompts?.length || 0} active phase prompts in database:`);
    prompts?.forEach((p) => {
      console.log(`   - Phase ${p.phase}: ${p.phase_name}`);
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
