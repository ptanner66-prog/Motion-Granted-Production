import { Metadata } from 'next';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Users,
  FileCheck,
  DollarSign,
  Clock,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { ApprovalQueueClient } from './approval-queue-client';

export const metadata: Metadata = {
  title: 'Approval Queue | AI Operations Center',
  description: 'Review and manage pending automation approvals.',
};

// Revalidate every 30 seconds for near real-time updates
export const revalidate = 30;

interface PageProps {
  searchParams: Promise<{
    status?: string;
    type?: string;
    urgency?: string;
    page?: string;
    search?: string;
  }>;
}

const ITEMS_PER_PAGE = 25;

// Stats component with streaming
async function ApprovalStats() {
  const supabase = await createClient();

  const [
    { count: pendingCount },
    { count: criticalCount },
    { count: processedTodayCount },
  ] = await Promise.all([
    supabase
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('urgency', ['high', 'critical']),
    supabase
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .in('status', ['approved', 'rejected'])
      .gte('resolved_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const stats = [
    {
      label: 'Pending',
      value: pendingCount || 0,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      label: 'Critical/High',
      value: criticalCount || 0,
      color: 'text-red-600 bg-red-50',
    },
    {
      label: 'Processed (24h)',
      value: processedTodayCount || 0,
      color: 'text-emerald-600 bg-emerald-50',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{stat.label}</span>
              <span className={`text-2xl font-bold ${stat.color.split(' ')[0]}`}>
                {stat.value}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatsLoading() {
  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
              <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function ApprovalsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const status = params.status || 'pending';
  const type = params.type;
  const urgency = params.urgency;
  const page = parseInt(params.page || '1');
  const search = params.search;
  const offset = (page - 1) * ITEMS_PER_PAGE;

  // Build query with optimized select
  let query = supabase
    .from('approval_queue')
    .select(`
      id,
      approval_type,
      order_id,
      request_details,
      ai_recommendation,
      ai_reasoning,
      ai_confidence,
      urgency,
      status,
      created_at,
      resolved_at,
      review_notes,
      orders:order_id (
        order_number,
        case_caption,
        motion_type,
        status
      )
    `, { count: 'exact' })
    .eq('status', status)
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: true })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  if (type) {
    query = query.eq('approval_type', type);
  }

  if (urgency) {
    query = query.eq('urgency', urgency);
  }

  const { data: approvals, count, error } = await query;

  if (error) {
    console.error('[Approvals] Query error:', error);
  }

  const totalPages = Math.ceil((count || 0) / ITEMS_PER_PAGE);

  // Get type counts for filters
  const { data: typeCounts } = await supabase
    .from('approval_queue')
    .select('approval_type')
    .eq('status', status);

  const typeCountMap = (typeCounts || []).reduce((acc, item) => {
    acc[item.approval_type] = (acc[item.approval_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const approvalTypes = [
    { value: 'conflict_review', label: 'Conflict Review', icon: Shield, color: 'text-orange-600' },
    { value: 'clerk_assignment', label: 'Clerk Assignment', icon: Users, color: 'text-blue-600' },
    { value: 'qa_override', label: 'QA Override', icon: FileCheck, color: 'text-purple-600' },
    { value: 'refund_request', label: 'Refund Request', icon: DollarSign, color: 'text-red-600' },
    { value: 'change_order', label: 'Change Order', icon: DollarSign, color: 'text-green-600' },
    { value: 'deadline_extension', label: 'Deadline Extension', icon: Clock, color: 'text-yellow-600' },
  ];

  const urgencyLevels = [
    { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
    { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-700' },
    { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700' },
  ];

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/automation">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Ops Center
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-navy">Approval Queue</h1>
            <p className="text-gray-500">
              Review and process automation approval requests
            </p>
          </div>
        </div>
        <Link href="/admin/automation/approvals">
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </Link>
      </div>

      {/* Stats with Suspense */}
      <Suspense fallback={<StatsLoading />}>
        <ApprovalStats />
      </Suspense>

      {/* Main Content */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {status === 'pending' ? 'Pending Approvals' :
                 status === 'approved' ? 'Approved Items' : 'Rejected Items'}
              </CardTitle>
              <CardDescription>
                {count || 0} total items {type && `of type "${approvalTypes.find(t => t.value === type)?.label}"`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6 pb-6 border-b">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <div className="flex gap-1">
                {statusOptions.map((opt) => (
                  <Link
                    key={opt.value}
                    href={`/admin/automation/approvals?status=${opt.value}${type ? `&type=${type}` : ''}${urgency ? `&urgency=${urgency}` : ''}`}
                  >
                    <Button
                      variant={status === opt.value ? 'default' : 'outline'}
                      size="sm"
                      className={status === opt.value ? 'bg-navy' : ''}
                    >
                      {opt.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Type:</span>
              <div className="flex gap-1 flex-wrap">
                <Link
                  href={`/admin/automation/approvals?status=${status}${urgency ? `&urgency=${urgency}` : ''}`}
                >
                  <Button
                    variant={!type ? 'default' : 'outline'}
                    size="sm"
                    className={!type ? 'bg-navy' : ''}
                  >
                    All
                  </Button>
                </Link>
                {approvalTypes.map((t) => {
                  const count = typeCountMap[t.value] || 0;
                  if (count === 0 && type !== t.value) return null;
                  const Icon = t.icon;
                  return (
                    <Link
                      key={t.value}
                      href={`/admin/automation/approvals?status=${status}&type=${t.value}${urgency ? `&urgency=${urgency}` : ''}`}
                    >
                      <Button
                        variant={type === t.value ? 'default' : 'outline'}
                        size="sm"
                        className={type === t.value ? 'bg-navy' : ''}
                      >
                        <Icon className={`h-3 w-3 mr-1 ${type === t.value ? 'text-white' : t.color}`} />
                        {t.label}
                        {count > 0 && (
                          <span className="ml-1 text-xs opacity-70">({count})</span>
                        )}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Urgency Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Urgency:</span>
              <div className="flex gap-1">
                <Link
                  href={`/admin/automation/approvals?status=${status}${type ? `&type=${type}` : ''}`}
                >
                  <Button
                    variant={!urgency ? 'default' : 'outline'}
                    size="sm"
                    className={!urgency ? 'bg-navy' : ''}
                  >
                    All
                  </Button>
                </Link>
                {urgencyLevels.map((u) => (
                  <Link
                    key={u.value}
                    href={`/admin/automation/approvals?status=${status}${type ? `&type=${type}` : ''}&urgency=${u.value}`}
                  >
                    <Button
                      variant={urgency === u.value ? 'default' : 'outline'}
                      size="sm"
                      className={urgency === u.value ? u.color : ''}
                    >
                      {u.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Client Component for Interactive List */}
          <ApprovalQueueClient
            initialApprovals={approvals || []}
            totalCount={count || 0}
            currentPage={page}
            totalPages={totalPages}
            itemsPerPage={ITEMS_PER_PAGE}
            currentFilters={{ status, type, urgency }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
