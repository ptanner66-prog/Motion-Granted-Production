/**
 * Order Export Functionality (Task 77)
 *
 * Export orders to various formats.
 *
 * Formats:
 * - CSV: Standard spreadsheet format
 * - JSON: Full data dump
 * - PDF: Summary report (placeholder for PDF generation)
 *
 * Features:
 * - Flexible filtering
 * - Privacy-aware client info redaction
 * - Background job scheduling
 * - Turnaround time calculation
 *
 * Source: Chunk 10, Task 77 - P2 Pre-Launch
 */

import { createClient as createAdminClient } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('export-order-exporter');
// ============================================================================
// TYPES
// ============================================================================

export interface ExportFilters {
  startDate?: Date;
  endDate?: Date;
  status?: string[];
  motionType?: string[];
  minAmount?: number;
  maxAmount?: number;
  userId?: string;
}

export interface ExportOptions {
  includeClientInfo?: boolean;
  includePaymentDetails?: boolean;
  includeNotes?: boolean;
  dateFormat?: string;
}

export interface ExportedOrder {
  orderId: string;
  createdDate: string;
  status: string;
  motionType: string;
  jurisdiction: string;
  clientInfo: string; // Redacted by default
  amount: number;
  amountFormatted: string;
  paymentStatus: string;
  completedDate?: string;
  turnaroundHours?: number;
  turnaroundFormatted?: string;
}

export interface ExportResult {
  format: 'csv' | 'json' | 'pdf';
  data: string | Buffer;
  filename: string;
  recordCount: number;
  generatedAt: Date;
}

export interface ScheduledExport {
  id: string;
  type: 'csv' | 'json' | 'pdf';
  filters: ExportFilters;
  recipientEmail: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduledFor: Date;
  completedAt?: Date;
  downloadUrl?: string;
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

function formatDate(date: Date, format?: string): string {
  if (format === 'ISO') {
    return date.toISOString();
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatTurnaround(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} hours`;
  }
  return `${(hours / 24).toFixed(1)} days`;
}

function redactEmail(email: string): string {
  if (!email) return 'N/A';
  const [local, domain] = email.split('@');
  if (!domain) return '***@***.***';
  const localRedacted = local.length > 2 ? local[0] + '***' + local[local.length - 1] : '***';
  return `${localRedacted}@${domain}`;
}

function escapeCSV(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchOrders(
  filters: ExportFilters,
  options: ExportOptions = {}
): Promise<ExportedOrder[]> {
  const supabase = getAdminClient();

  if (!supabase) {
    log.error('[Export] No admin client available');
    return [];
  }

  let query = supabase
    .from('orders')
    .select(`
      id,
      created_at,
      updated_at,
      status,
      motion_type,
      jurisdiction,
      amount,
      payment_status,
      completed_at,
      user_id,
      profiles:user_id (
        email
      )
    `)
    .order('created_at', { ascending: false });

  // Apply filters
  if (filters.startDate) {
    query = query.gte('created_at', filters.startDate.toISOString());
  }

  if (filters.endDate) {
    query = query.lte('created_at', filters.endDate.toISOString());
  }

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  if (filters.motionType && filters.motionType.length > 0) {
    query = query.in('motion_type', filters.motionType);
  }

  if (filters.minAmount !== undefined) {
    query = query.gte('amount', filters.minAmount);
  }

  if (filters.maxAmount !== undefined) {
    query = query.lte('amount', filters.maxAmount);
  }

  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  const { data, error } = await query.limit(10000);

  if (error) {
    log.error('[Export] Query error:', error);
    return [];
  }

  return (data || []).map((order) => {
    const createdAt = new Date(order.created_at);
    const completedAt = order.completed_at ? new Date(order.completed_at) : null;

    let turnaroundHours: number | undefined;
    if (completedAt) {
      turnaroundHours = (completedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    }

    // Get client email, redact if not including full client info
    const email = (order.profiles as { email?: string })?.email || '';
    const clientInfo = options.includeClientInfo ? email : redactEmail(email);

    return {
      orderId: order.id,
      createdDate: formatDate(createdAt, options.dateFormat),
      status: order.status,
      motionType: order.motion_type || 'N/A',
      jurisdiction: order.jurisdiction || 'N/A',
      clientInfo,
      amount: order.amount || 0,
      amountFormatted: formatCurrency(order.amount || 0),
      paymentStatus: order.payment_status || 'unknown',
      completedDate: completedAt ? formatDate(completedAt, options.dateFormat) : undefined,
      turnaroundHours,
      turnaroundFormatted: turnaroundHours ? formatTurnaround(turnaroundHours) : undefined,
    };
  });
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export orders to CSV format
 */
export async function exportOrdersToCSV(
  filters: ExportFilters,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const orders = await fetchOrders(filters, options);

  // CSV Headers
  const headers = [
    'Order ID',
    'Created Date',
    'Status',
    'Motion Type',
    'Jurisdiction',
    'Client',
    'Amount',
    'Payment Status',
    'Completed Date',
    'Turnaround',
  ];

  // Build CSV rows
  const rows = orders.map((order) => [
    escapeCSV(order.orderId),
    escapeCSV(order.createdDate),
    escapeCSV(order.status),
    escapeCSV(order.motionType),
    escapeCSV(order.jurisdiction),
    escapeCSV(order.clientInfo),
    escapeCSV(order.amountFormatted),
    escapeCSV(order.paymentStatus),
    escapeCSV(order.completedDate || ''),
    escapeCSV(order.turnaroundFormatted || ''),
  ]);

  // Combine headers and rows
  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  const timestamp = new Date().toISOString().split('T')[0];

  return {
    format: 'csv',
    data: csv,
    filename: `orders-export-${timestamp}.csv`,
    recordCount: orders.length,
    generatedAt: new Date(),
  };
}

/**
 * Export orders to JSON format (full data dump)
 */
export async function exportOrdersToJSON(
  filters: ExportFilters,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const orders = await fetchOrders(filters, { ...options, dateFormat: 'ISO' });

  const exportData = {
    exportedAt: new Date().toISOString(),
    filters: {
      startDate: filters.startDate?.toISOString(),
      endDate: filters.endDate?.toISOString(),
      status: filters.status,
      motionType: filters.motionType,
    },
    recordCount: orders.length,
    orders,
  };

  const json = JSON.stringify(exportData, null, 2);
  const timestamp = new Date().toISOString().split('T')[0];

  return {
    format: 'json',
    data: json,
    filename: `orders-export-${timestamp}.json`,
    recordCount: orders.length,
    generatedAt: new Date(),
  };
}

/**
 * Export orders to PDF format (summary report)
 * Note: Actual PDF generation would require a library like pdfkit or puppeteer
 */
export async function exportOrdersToPDF(
  filters: ExportFilters
): Promise<ExportResult> {
  const orders = await fetchOrders(filters);

  // Calculate summary statistics
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + o.amount, 0);
  const completedOrders = orders.filter((o) => o.status === 'completed' || o.status === 'delivered');
  const avgTurnaround = completedOrders.length > 0
    ? completedOrders.reduce((sum, o) => sum + (o.turnaroundHours || 0), 0) / completedOrders.length
    : 0;

  const statusBreakdown: Record<string, number> = {};
  orders.forEach((o) => {
    statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
  });

  // Generate HTML report (would be converted to PDF in production)
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Orders Export Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .stat { display: inline-block; margin-right: 40px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #2563eb; }
    .stat-label { color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; }
    .footer { margin-top: 40px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Motion Granted - Orders Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div class="summary">
    <div class="stat">
      <div class="stat-value">${totalOrders}</div>
      <div class="stat-label">Total Orders</div>
    </div>
    <div class="stat">
      <div class="stat-value">${formatCurrency(totalRevenue)}</div>
      <div class="stat-label">Total Revenue</div>
    </div>
    <div class="stat">
      <div class="stat-value">${completedOrders.length}</div>
      <div class="stat-label">Completed</div>
    </div>
    <div class="stat">
      <div class="stat-value">${formatTurnaround(avgTurnaround)}</div>
      <div class="stat-label">Avg Turnaround</div>
    </div>
  </div>

  <h2>Status Breakdown</h2>
  <table>
    <tr><th>Status</th><th>Count</th><th>Percentage</th></tr>
    ${Object.entries(statusBreakdown)
      .map(([status, count]) => `<tr><td>${status}</td><td>${count}</td><td>${((count / totalOrders) * 100).toFixed(1)}%</td></tr>`)
      .join('')}
  </table>

  <h2>Recent Orders</h2>
  <table>
    <tr><th>Order ID</th><th>Date</th><th>Type</th><th>Status</th><th>Amount</th></tr>
    ${orders.slice(0, 50)
      .map((o) => `<tr><td>${o.orderId.slice(0, 8)}...</td><td>${o.createdDate}</td><td>${o.motionType}</td><td>${o.status}</td><td>${o.amountFormatted}</td></tr>`)
      .join('')}
  </table>
  ${orders.length > 50 ? `<p>... and ${orders.length - 50} more orders</p>` : ''}

  <div class="footer">
    <p>This report contains ${totalOrders} orders. Client information has been redacted for privacy.</p>
    <p>Motion Granted - Confidential</p>
  </div>
</body>
</html>`;

  const timestamp = new Date().toISOString().split('T')[0];

  return {
    format: 'pdf',
    data: html, // In production, convert HTML to PDF
    filename: `orders-report-${timestamp}.html`, // Would be .pdf
    recordCount: orders.length,
    generatedAt: new Date(),
  };
}

// ============================================================================
// SCHEDULED EXPORTS
// ============================================================================

/**
 * Schedule an export to be generated in the background
 */
export async function scheduleExport(
  type: 'csv' | 'json' | 'pdf',
  filters: ExportFilters,
  recipientEmail: string
): Promise<ScheduledExport | null> {
  const supabase = getAdminClient();

  if (!supabase) {
    log.error('[Export] No admin client available');
    return null;
  }

  // Create scheduled export record
  const { data, error } = await supabase
    .from('scheduled_exports')
    .insert({
      export_type: type,
      filters: {
        startDate: filters.startDate?.toISOString(),
        endDate: filters.endDate?.toISOString(),
        status: filters.status,
        motionType: filters.motionType,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
      },
      recipient_email: recipientEmail,
      status: 'pending',
      scheduled_for: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    log.error('[Export] Schedule error:', error);
    return null;
  }

  log.info(`[Export] Scheduled ${type} export for ${recipientEmail}`);

  return {
    id: data.id,
    type: data.export_type,
    filters: data.filters,
    recipientEmail: data.recipient_email,
    status: data.status,
    scheduledFor: new Date(data.scheduled_for),
  };
}

/**
 * Process a scheduled export (called by background job)
 */
export async function processScheduledExport(
  exportId: string
): Promise<boolean> {
  const supabase = getAdminClient();

  if (!supabase) {
    return false;
  }

  // Get export record
  const { data: exportRecord } = await supabase
    .from('scheduled_exports')
    .select('*')
    .eq('id', exportId)
    .single();

  if (!exportRecord) {
    log.error('[Export] Export record not found');
    return false;
  }

  // Update status to processing
  await supabase
    .from('scheduled_exports')
    .update({ status: 'processing' })
    .eq('id', exportId);

  try {
    // Parse filters
    const filters: ExportFilters = {
      startDate: exportRecord.filters.startDate ? new Date(exportRecord.filters.startDate) : undefined,
      endDate: exportRecord.filters.endDate ? new Date(exportRecord.filters.endDate) : undefined,
      status: exportRecord.filters.status,
      motionType: exportRecord.filters.motionType,
      minAmount: exportRecord.filters.minAmount,
      maxAmount: exportRecord.filters.maxAmount,
    };

    // Generate export
    let result: ExportResult;
    switch (exportRecord.export_type) {
      case 'csv':
        result = await exportOrdersToCSV(filters);
        break;
      case 'json':
        result = await exportOrdersToJSON(filters);
        break;
      case 'pdf':
        result = await exportOrdersToPDF(filters);
        break;
      default:
        throw new Error(`Unknown export type: ${exportRecord.export_type}`);
    }

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('exports')
      .upload(
        `exports/${exportId}/${result.filename}`,
        typeof result.data === 'string' ? new Blob([result.data]) : result.data,
        { contentType: result.format === 'json' ? 'application/json' : 'text/csv' }
      );

    if (uploadError) {
      throw uploadError;
    }

    // Get download URL
    const { data: urlData } = await supabase.storage
      .from('exports')
      .createSignedUrl(`exports/${exportId}/${result.filename}`, 86400); // 24 hour expiry

    // Update export record
    await supabase
      .from('scheduled_exports')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        download_url: urlData?.signedUrl,
        record_count: result.recordCount,
      })
      .eq('id', exportId);

    log.info(`[Export] Completed export ${exportId} with ${result.recordCount} records`);

    // Send email to recipient with download link
    if (exportRecord.recipient_email && urlData?.signedUrl) {
      try {
        const { sendEmailAsync } = await import('@/lib/email/email-service');
        sendEmailAsync(
          exportRecord.recipient_email,
          `Your Motion Granted Export is Ready`,
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">Export Ready</h1>
            <p>Your requested data export is complete.</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Records:</strong> ${result.recordCount}</p>
              <p><strong>Format:</strong> ${exportRecord.export_type?.toUpperCase() || 'CSV'}</p>
            </div>
            <p><a href="${urlData.signedUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Download Export</a></p>
            <p style="font-size: 12px; color: #666;">This download link expires in 24 hours.</p>
          </div>`
        );
      } catch (emailError) {
        log.warn('[Export] Failed to send export email:', emailError);
      }
    }

    return true;
  } catch (error) {
    log.error('[Export] Processing error:', error);

    // Mark as failed
    await supabase
      .from('scheduled_exports')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', exportId);

    return false;
  }
}

/**
 * Get pending exports (for background job processing)
 */
export async function getPendingExports(): Promise<ScheduledExport[]> {
  const supabase = getAdminClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('scheduled_exports')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(10);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    type: row.export_type,
    filters: row.filters,
    recipientEmail: row.recipient_email,
    status: row.status,
    scheduledFor: new Date(row.scheduled_for),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    downloadUrl: row.download_url,
  }));
}
