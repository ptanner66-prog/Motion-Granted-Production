/**
 * Archive Service — ST-010 + ST-042 (merged)
 *
 * PATTERN: Copy to archive -> verify copy -> delete from active.
 * NEVER delete-then-copy. Always copy-first for data safety.
 *
 * Uses service_role for cross-user file operations.
 * Allowed per SERVICE_ROLE_ALLOWLIST wildcard for lib/services/.
 *
 * SP-17 D6 Phase 6
 */
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/security/logger';
import { STORAGE_BUCKETS } from '@/lib/config/storage';

const log = createLogger('archive-service');

export async function archiveOrderFiles(orderId: string): Promise<{
  archived: number;
  errors: string[];
}> {
  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let archived = 0;

  // Get all delivery packages for this order that haven't been archived
  const { data: packages } = await supabase
    .from('delivery_packages')
    .select('id, archive_status')
    .eq('order_id', orderId)
    .neq('archive_status', 'ARCHIVED');

  if (!packages || packages.length === 0) {
    return { archived: 0, errors: [] };
  }

  for (const pkg of packages) {
    // Mark as archiving
    await supabase
      .from('delivery_packages')
      .update({ archive_status: 'ARCHIVING' })
      .eq('id', pkg.id);

    // Get documents associated with this order
    const { data: documents } = await supabase
      .from('documents')
      .select('id, file_url, file_name')
      .eq('order_id', orderId)
      .eq('is_deliverable', true);

    try {
      for (const doc of documents || []) {
        const sourceBucket = STORAGE_BUCKETS.ORDER_DOCUMENTS;
        const sourcePath = doc.file_url.replace(
          new RegExp(`^${sourceBucket}/`),
          ''
        );
        const archivePath = `${orderId}/${doc.id}`;

        // Step 1: Copy to archive
        const { error: copyErr } = await supabase.storage
          .from(STORAGE_BUCKETS.ORDER_ARCHIVE)
          .copy(`${sourceBucket}/${sourcePath}`, archivePath);

        if (copyErr) {
          errors.push(
            `Copy failed for ${doc.file_url}: ${copyErr.message}`
          );
          continue;
        }

        // Step 2: Verify copy exists
        const { data: verifyData } = await supabase.storage
          .from(STORAGE_BUCKETS.ORDER_ARCHIVE)
          .list(orderId, { search: doc.id });

        if (!verifyData || verifyData.length === 0) {
          errors.push(
            `Verification failed for ${doc.file_url}: archive file not found`
          );
          continue;
        }

        // Step 3: Delete from active (only after verified copy)
        await supabase.storage.from(sourceBucket).remove([sourcePath]);

        archived++;
      }

      // Update package archive status
      const finalStatus =
        errors.length > 0 ? 'ARCHIVE_FAILED' : 'ARCHIVED';
      await supabase
        .from('delivery_packages')
        .update({
          archive_status: finalStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pkg.id);
    } catch (err) {
      await supabase
        .from('delivery_packages')
        .update({ archive_status: 'ARCHIVE_FAILED' })
        .eq('id', pkg.id);
      errors.push(`Archive failed for package ${pkg.id}: ${err}`);
    }
  }

  log.info('Archive complete', {
    orderId,
    archived,
    errorCount: errors.length,
  });
  return { archived, errors };
}
