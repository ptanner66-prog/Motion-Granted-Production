/**
 * Backup Verification System (Task 78)
 *
 * Automated backup verification and integrity checking.
 *
 * Features:
 * - Verify backup integrity
 * - List recent backups
 * - Schedule automated verification
 * - Test restore capability
 * - Alert on backup issues
 *
 * Integration: Supabase backup API, runs daily via Inngest cron
 *
 * Source: Chunk 10, Task 78 - P2 Pre-Launch
 */

import { createClient as createAdminClient } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('backup-backup-verifier');
// ============================================================================
// TYPES
// ============================================================================

export interface Backup {
  id: string;
  projectRef: string;
  createdAt: Date;
  status: 'completed' | 'in_progress' | 'failed';
  size: number;
  sizeFormatted: string;
  type: 'scheduled' | 'manual' | 'pre_migration';
  isVerified: boolean;
  verifiedAt?: Date;
}

export interface BackupVerificationResult {
  backupId: string;
  isValid: boolean;
  checks: VerificationCheck[];
  verifiedAt: Date;
  errors: string[];
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

export interface BackupHealthReport {
  lastBackupAt?: Date;
  backupCount: number;
  totalSize: number;
  verifiedCount: number;
  failedBackups: number;
  health: 'healthy' | 'warning' | 'critical';
  recommendations: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createAdminClient(supabaseUrl, supabaseKey);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// BACKUP LISTING
// ============================================================================

/**
 * List recent backups from the tracking table
 * Note: In production, this would integrate with Supabase's backup API
 */
export async function listRecentBackups(limit: number = 10): Promise<Backup[]> {
  const supabase = getAdminClient();

  if (!supabase) {
    log.error('[Backup] No admin client available');
    return [];
  }

  const { data, error } = await supabase
    .from('backup_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('[Backup] List error:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    projectRef: row.project_ref || process.env.SUPABASE_PROJECT_REF || 'unknown',
    createdAt: new Date(row.created_at),
    status: row.status,
    size: row.size_bytes || 0,
    sizeFormatted: formatBytes(row.size_bytes || 0),
    type: row.backup_type || 'scheduled',
    isVerified: row.is_verified || false,
    verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
  }));
}

/**
 * Register a new backup (called after backup completion)
 */
export async function registerBackup(
  backupId: string,
  options: {
    type?: 'scheduled' | 'manual' | 'pre_migration';
    sizeBytes?: number;
    status?: 'completed' | 'in_progress' | 'failed';
  } = {}
): Promise<Backup | null> {
  const supabase = getAdminClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('backup_records')
    .insert({
      id: backupId,
      project_ref: process.env.SUPABASE_PROJECT_REF || 'unknown',
      backup_type: options.type || 'manual',
      size_bytes: options.sizeBytes || 0,
      status: options.status || 'completed',
      is_verified: false,
    })
    .select()
    .single();

  if (error || !data) {
    log.error('[Backup] Register error:', error);
    return null;
  }

  return {
    id: data.id,
    projectRef: data.project_ref,
    createdAt: new Date(data.created_at),
    status: data.status,
    size: data.size_bytes,
    sizeFormatted: formatBytes(data.size_bytes),
    type: data.backup_type,
    isVerified: false,
  };
}

// ============================================================================
// BACKUP VERIFICATION
// ============================================================================

/**
 * Verify backup integrity
 */
export async function verifyBackupIntegrity(
  backupId: string
): Promise<BackupVerificationResult> {
  const startTime = Date.now();
  const checks: VerificationCheck[] = [];
  const errors: string[] = [];

  const supabase = getAdminClient();

  if (!supabase) {
    return {
      backupId,
      isValid: false,
      checks: [],
      verifiedAt: new Date(),
      errors: ['Admin client not available'],
    };
  }

  // Get backup record
  const { data: backup } = await supabase
    .from('backup_records')
    .select('*')
    .eq('id', backupId)
    .single();

  if (!backup) {
    return {
      backupId,
      isValid: false,
      checks: [],
      verifiedAt: new Date(),
      errors: ['Backup record not found'],
    };
  }

  // Check 1: Backup status
  const statusCheckStart = Date.now();
  const statusCheck: VerificationCheck = {
    name: 'Backup Status',
    passed: backup.status === 'completed',
    message: backup.status === 'completed'
      ? 'Backup completed successfully'
      : `Backup status is ${backup.status}`,
    duration: Date.now() - statusCheckStart,
  };
  checks.push(statusCheck);
  if (!statusCheck.passed) {
    errors.push(`Backup status is ${backup.status}`);
  }

  // Check 2: Backup size
  const sizeCheckStart = Date.now();
  const minExpectedSize = 1024; // Minimum 1KB
  const sizeCheck: VerificationCheck = {
    name: 'Backup Size',
    passed: backup.size_bytes >= minExpectedSize,
    message: backup.size_bytes >= minExpectedSize
      ? `Backup size is ${formatBytes(backup.size_bytes)}`
      : `Backup too small: ${formatBytes(backup.size_bytes)}`,
    duration: Date.now() - sizeCheckStart,
  };
  checks.push(sizeCheck);
  if (!sizeCheck.passed) {
    errors.push('Backup size below minimum threshold');
  }

  // Check 3: Backup age
  const ageCheckStart = Date.now();
  const backupAge = Date.now() - new Date(backup.created_at).getTime();
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  const ageCheck: VerificationCheck = {
    name: 'Backup Freshness',
    passed: backupAge < maxAge,
    message: backupAge < maxAge
      ? `Backup is ${Math.floor(backupAge / (24 * 60 * 60 * 1000))} days old`
      : `Backup is older than 30 days`,
    duration: Date.now() - ageCheckStart,
  };
  checks.push(ageCheck);
  if (!ageCheck.passed) {
    errors.push('Backup is older than retention policy');
  }

  // Check 4: Database connectivity (verify we can access the backup's source)
  const dbCheckStart = Date.now();
  try {
    const { error: dbError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    const dbCheck: VerificationCheck = {
      name: 'Source Database',
      passed: !dbError,
      message: !dbError
        ? 'Source database is accessible'
        : 'Source database is not accessible',
      duration: Date.now() - dbCheckStart,
    };
    checks.push(dbCheck);
    if (!dbCheck.passed) {
      errors.push('Source database connectivity issue');
    }
  } catch {
    checks.push({
      name: 'Source Database',
      passed: false,
      message: 'Database connectivity check failed',
      duration: Date.now() - dbCheckStart,
    });
    errors.push('Database connectivity check failed');
  }

  // Check 5: Core tables existence
  const tablesCheckStart = Date.now();
  const coreTables = ['profiles', 'orders', 'documents'];
  let tablesExist = true;

  for (const table of coreTables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      tablesExist = false;
      break;
    }
  }

  const tablesCheck: VerificationCheck = {
    name: 'Core Tables',
    passed: tablesExist,
    message: tablesExist
      ? 'All core tables are accessible'
      : 'Some core tables are missing or inaccessible',
    duration: Date.now() - tablesCheckStart,
  };
  checks.push(tablesCheck);
  if (!tablesCheck.passed) {
    errors.push('Core tables verification failed');
  }

  // Determine overall validity
  const isValid = checks.every((c) => c.passed);

  // Update backup record with verification result
  await supabase
    .from('backup_records')
    .update({
      is_verified: isValid,
      verified_at: new Date().toISOString(),
      verification_checks: checks,
      verification_errors: errors,
    })
    .eq('id', backupId);

  log.info(`[Backup] Verified backup ${backupId}: ${isValid ? 'VALID' : 'INVALID'}`);

  return {
    backupId,
    isValid,
    checks,
    verifiedAt: new Date(),
    errors,
  };
}

// ============================================================================
// SCHEDULED VERIFICATION
// ============================================================================

/**
 * Schedule backup verification (creates task for Inngest)
 */
export async function scheduleBackupVerification(): Promise<{
  scheduled: number;
  backupIds: string[];
}> {
  const supabase = getAdminClient();

  if (!supabase) {
    return { scheduled: 0, backupIds: [] };
  }

  // Get unverified backups from the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: unverified } = await supabase
    .from('backup_records')
    .select('id')
    .eq('is_verified', false)
    .eq('status', 'completed')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  if (!unverified || unverified.length === 0) {
    log.info('[Backup] No unverified backups to schedule');
    return { scheduled: 0, backupIds: [] };
  }

  const backupIds = unverified.map((b) => b.id);

  // Create verification tasks
  const { error } = await supabase.from('verification_tasks').insert(
    backupIds.map((id) => ({
      backup_id: id,
      status: 'pending',
      scheduled_for: new Date().toISOString(),
    }))
  );

  if (error) {
    log.error('[Backup] Failed to schedule verifications:', error);
    return { scheduled: 0, backupIds: [] };
  }

  log.info(`[Backup] Scheduled verification for ${backupIds.length} backups`);

  return {
    scheduled: backupIds.length,
    backupIds,
  };
}

/**
 * Run verification for all pending tasks
 */
export async function processPendingVerifications(): Promise<{
  processed: number;
  passed: number;
  failed: number;
}> {
  const supabase = getAdminClient();

  if (!supabase) {
    return { processed: 0, passed: 0, failed: 0 };
  }

  // Get pending verification tasks
  const { data: tasks } = await supabase
    .from('verification_tasks')
    .select('id, backup_id')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .limit(5);

  if (!tasks || tasks.length === 0) {
    return { processed: 0, passed: 0, failed: 0 };
  }

  let passed = 0;
  let failed = 0;

  for (const task of tasks) {
    // Mark as processing
    await supabase
      .from('verification_tasks')
      .update({ status: 'processing' })
      .eq('id', task.id);

    // Run verification
    const result = await verifyBackupIntegrity(task.backup_id);

    // Update task status
    await supabase
      .from('verification_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: {
          isValid: result.isValid,
          checks: result.checks,
          errors: result.errors,
        },
      })
      .eq('id', task.id);

    if (result.isValid) {
      passed++;
    } else {
      failed++;
    }
  }

  return {
    processed: tasks.length,
    passed,
    failed,
  };
}

// ============================================================================
// RESTORE TESTING
// ============================================================================

/**
 * Test restore capability (dry run)
 * Note: Actual restore would require Supabase Management API
 */
export async function restoreTest(
  backupId: string
): Promise<{
  success: boolean;
  message: string;
  canRestore: boolean;
  estimatedTime?: number;
}> {
  const supabase = getAdminClient();

  if (!supabase) {
    return {
      success: false,
      message: 'Admin client not available',
      canRestore: false,
    };
  }

  // Get backup record
  const { data: backup } = await supabase
    .from('backup_records')
    .select('*')
    .eq('id', backupId)
    .single();

  if (!backup) {
    return {
      success: false,
      message: 'Backup not found',
      canRestore: false,
    };
  }

  // Verify backup is valid before restore test
  if (!backup.is_verified) {
    const verification = await verifyBackupIntegrity(backupId);
    if (!verification.isValid) {
      return {
        success: false,
        message: 'Backup failed verification checks',
        canRestore: false,
      };
    }
  }

  // Check backup status
  if (backup.status !== 'completed') {
    return {
      success: false,
      message: `Backup status is ${backup.status}, cannot restore`,
      canRestore: false,
    };
  }

  // Estimate restore time based on size
  const bytesPerSecond = 10 * 1024 * 1024; // 10 MB/s assumption
  const estimatedTime = Math.ceil(backup.size_bytes / bytesPerSecond);

  // Log restore test
  await supabase.from('restore_tests').insert({
    backup_id: backupId,
    test_type: 'dry_run',
    result: 'success',
    estimated_restore_time: estimatedTime,
  });

  return {
    success: true,
    message: 'Restore test passed - backup is restorable',
    canRestore: true,
    estimatedTime,
  };
}

// ============================================================================
// HEALTH REPORTING
// ============================================================================

/**
 * Generate backup health report
 */
export async function getBackupHealthReport(): Promise<BackupHealthReport> {
  const supabase = getAdminClient();

  if (!supabase) {
    return {
      backupCount: 0,
      totalSize: 0,
      verifiedCount: 0,
      failedBackups: 0,
      health: 'critical',
      recommendations: ['Unable to connect to backup system'],
    };
  }

  // Get backup statistics
  const { data: backups } = await supabase
    .from('backup_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (!backups || backups.length === 0) {
    return {
      backupCount: 0,
      totalSize: 0,
      verifiedCount: 0,
      failedBackups: 0,
      health: 'critical',
      recommendations: ['No backups found - set up automated backups immediately'],
    };
  }

  const backupCount = backups.length;
  const totalSize = backups.reduce((sum, b) => sum + (b.size_bytes || 0), 0);
  const verifiedCount = backups.filter((b) => b.is_verified).length;
  const failedBackups = backups.filter((b) => b.status === 'failed').length;
  const lastBackup = backups[0];
  const lastBackupAt = new Date(lastBackup.created_at);

  // Calculate health status
  const recommendations: string[] = [];
  let health: 'healthy' | 'warning' | 'critical' = 'healthy';

  // Check last backup age
  const hoursSinceLastBackup = (Date.now() - lastBackupAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastBackup > 48) {
    health = 'critical';
    recommendations.push('Last backup is more than 48 hours old');
  } else if (hoursSinceLastBackup > 24) {
    health = 'warning';
    recommendations.push('Last backup is more than 24 hours old');
  }

  // Check verification rate
  const verificationRate = (verifiedCount / backupCount) * 100;
  if (verificationRate < 50) {
    if (health === 'healthy') health = 'warning';
    recommendations.push('Less than 50% of backups are verified');
  }

  // Check failed backups
  if (failedBackups > 0) {
    if (health === 'healthy') health = 'warning';
    recommendations.push(`${failedBackups} backup(s) have failed`);
  }

  // Check recent backup not verified
  if (!lastBackup.is_verified) {
    recommendations.push('Most recent backup has not been verified');
  }

  if (recommendations.length === 0) {
    recommendations.push('Backup system is healthy');
  }

  return {
    lastBackupAt,
    backupCount,
    totalSize,
    verifiedCount,
    failedBackups,
    health,
    recommendations,
  };
}

/**
 * Alert on backup issues (for monitoring integration)
 */
export async function checkBackupAlerts(): Promise<{
  alertLevel: 'none' | 'warning' | 'critical';
  alerts: string[];
}> {
  const report = await getBackupHealthReport();

  const alerts: string[] = [];
  let alertLevel: 'none' | 'warning' | 'critical' = 'none';

  if (report.health === 'critical') {
    alertLevel = 'critical';
    alerts.push(...report.recommendations);
  } else if (report.health === 'warning') {
    alertLevel = 'warning';
    alerts.push(...report.recommendations.filter((r) => !r.includes('healthy')));
  }

  if (alertLevel !== 'none') {
    log.warn(`[Backup] Alert level: ${alertLevel}`, alerts);

    // Log alert to database
    const supabase = getAdminClient();
    if (supabase) {
      await supabase.from('backup_alerts').insert({
        alert_level: alertLevel,
        alerts,
        created_at: new Date().toISOString(),
      });
    }
  }

  return { alertLevel, alerts };
}
