import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';
import { AutomationLogsTable } from '@/components/admin/automation/logs-table';

export const metadata: Metadata = {
  title: 'Automation Logs',
  description: 'View automation activity logs.',
};

export default async function AutomationLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string; orderId?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const page = parseInt(params.page || '1');
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('automation_logs')
    .select(`
      *,
      orders:order_id (
        order_number,
        case_caption
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Apply filters
  if (params.orderId) {
    query = query.eq('order_id', params.orderId);
  }

  if (params.filter === 'auto') {
    query = query.eq('was_auto_approved', true);
  } else if (params.filter === 'failed') {
    query = query.ilike('action_type', '%failed%');
  } else if (params.filter === 'notifications') {
    query = query.ilike('action_type', 'notification%');
  }

  const { data: logs, count } = await query;

  const totalPages = Math.ceil((count || 0) / pageSize);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/automation">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-navy tracking-tight">
              Automation Logs
            </h1>
            <p className="text-gray-500 mt-1">
              {count?.toLocaleString() || 0} total events
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/automation/logs">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link href="/admin/automation/logs">
          <Button
            variant={!params.filter ? 'default' : 'outline'}
            size="sm"
          >
            All
          </Button>
        </Link>
        <Link href="/admin/automation/logs?filter=auto">
          <Button
            variant={params.filter === 'auto' ? 'default' : 'outline'}
            size="sm"
          >
            Auto-Processed
          </Button>
        </Link>
        <Link href="/admin/automation/logs?filter=failed">
          <Button
            variant={params.filter === 'failed' ? 'default' : 'outline'}
            size="sm"
          >
            Failed
          </Button>
        </Link>
        <Link href="/admin/automation/logs?filter=notifications">
          <Button
            variant={params.filter === 'notifications' ? 'default' : 'outline'}
            size="sm"
          >
            Notifications
          </Button>
        </Link>
      </div>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <AutomationLogsTable logs={logs || []} />
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            asChild
          >
            <Link
              href={`/admin/automation/logs?page=${page - 1}${params.filter ? `&filter=${params.filter}` : ''}`}
            >
              Previous
            </Link>
          </Button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            asChild
          >
            <Link
              href={`/admin/automation/logs?page=${page + 1}${params.filter ? `&filter=${params.filter}` : ''}`}
            >
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
