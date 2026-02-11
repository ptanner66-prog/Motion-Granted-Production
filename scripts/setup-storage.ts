#!/usr/bin/env npx tsx
/**
 * Set up Supabase Storage bucket for filing packages.
 *
 * Run once: npx tsx scripts/setup-storage.ts
 *
 * Creates a private 'filing-packages' bucket with:
 * - 50MB max file size
 * - Only .docx and .pdf allowed
 * - Private (requires signed URLs for download)
 */

import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error('Failed to list buckets:', listError.message);
    process.exit(1);
  }

  const exists = buckets?.some((b) => b.name === 'filing-packages');

  if (exists) {
    console.log('filing-packages bucket already exists');
    return;
  }

  // Create bucket - private (requires signed URLs for download)
  const { error: createError } = await supabase.storage.createBucket('filing-packages', {
    public: false,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/pdf',
    ],
  });

  if (createError) {
    console.error('Failed to create bucket:', createError.message);
    process.exit(1);
  }

  console.log('Created filing-packages bucket');
  console.log('');
  console.log('NOTE: RLS policies for storage should be applied via SQL migration.');
  console.log('See: supabase/migrations/20260212000001_storage_rls.sql');
  console.log('');
  console.log('Customer downloads use signed URLs generated server-side.');
  console.log('No direct storage access is needed for clients.');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
