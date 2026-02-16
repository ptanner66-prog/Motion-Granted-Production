/**
 * One-time storage migration script
 *
 * Moves files from legacy buckets to canonical structure:
 *   order-documents/{orderId}/{filename}
 *
 * Legacy buckets to migrate from (C-011):
 *   - motion-deliverables
 *   - documents
 *   - deliverables
 *
 * Skips orders in active statuses (PROCESSING, AWAITING_APPROVAL)
 * to avoid corrupting in-flight workflows.
 *
 * Usage: npx tsx scripts/migrate-storage.ts
 *
 * SP-17 D6 Phase 7
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LEGACY_BUCKETS = ['motion-deliverables', 'documents', 'deliverables'];
const CANONICAL_BUCKET = 'order-documents';
const SKIP_STATUSES = ['PROCESSING', 'AWAITING_APPROVAL'];

async function migrate() {
  console.log('=== Storage Migration Start ===');

  for (const legacyBucket of LEGACY_BUCKETS) {
    console.log(`\nProcessing legacy bucket: ${legacyBucket}`);

    const { data: folders, error } = await supabase.storage
      .from(legacyBucket)
      .list('', { limit: 1000 });

    if (error) {
      console.log(
        `  Bucket ${legacyBucket} not found or empty — skipping`
      );
      continue;
    }

    for (const folder of folders || []) {
      // Check if order is in active status (skip if so)
      const { data: order } = await supabase
        .from('orders')
        .select('status')
        .eq('id', folder.name)
        .single();

      if (order && SKIP_STATUSES.includes(order.status)) {
        console.log(
          `  Skipping active order ${folder.name} (status: ${order.status})`
        );
        continue;
      }

      const { data: files } = await supabase.storage
        .from(legacyBucket)
        .list(folder.name);

      for (const file of files || []) {
        const sourcePath = `${folder.name}/${file.name}`;
        const destPath = `${folder.name}/${file.name}`;

        // Check if already exists at destination
        const { data: existing } = await supabase.storage
          .from(CANONICAL_BUCKET)
          .list(folder.name, { search: file.name });

        if (existing && existing.length > 0) {
          console.log(`  Already migrated: ${sourcePath}`);
          continue;
        }

        // Download from legacy
        const { data: fileData, error: dlErr } = await supabase.storage
          .from(legacyBucket)
          .download(sourcePath);

        if (dlErr || !fileData) {
          console.error(`  Failed to download: ${sourcePath}`);
          continue;
        }

        // Upload to canonical
        const { error: upErr } = await supabase.storage
          .from(CANONICAL_BUCKET)
          .upload(destPath, fileData);

        if (upErr) {
          console.error(`  Failed to upload: ${destPath}`);
          continue;
        }

        // Update database reference
        await supabase
          .from('documents')
          .update({ file_url: `${CANONICAL_BUCKET}/${destPath}` })
          .eq('file_url', `${legacyBucket}/${sourcePath}`);

        console.log(
          `  Migrated: ${legacyBucket}/${sourcePath} -> ${CANONICAL_BUCKET}/${destPath}`
        );
      }
    }
  }

  console.log('\n=== Storage Migration Complete ===');
}

migrate().catch(console.error);
