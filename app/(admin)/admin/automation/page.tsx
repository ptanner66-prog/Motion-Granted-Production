import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bot,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Bell,
  Settings,
  Activity,
  ArrowRight,
  RefreshCw,
  Shield,
  Users,
  FileCheck,
} from 'lucide-react';
import Link from 'next/link';
import { ApprovalQueueList } from '@/components/admin/automation/approval-queue-list';
import { AutomationActivityFeed } from '@/components/admin/automation/activity-feed';
import { AutomationStatsCards } from '@/components/admin/automation/stats-cards';
import { QuickActionsPanel } from '@/components/admin/automation/quick-actions-panel';

export const metadata: Metadata = {
  title: 'AI Operations Center',
  description: 'Automation command center for Motion Granted.',
};

// Helper to safely run queries that may fail if table doesn't exist
async function safeQuery<T>(promise: Promise<{ data: T | null; count?: number | null; error: unknown }>, defaultValue: T): Promise<{ data: T; count: number }> {
  try {
    const result = await promise;
    return { data: result.data ?? defaultValue, count: result.count || 0 };
  } catch {
    return { data: defaultValue, count: 0 };
  }
}

export default async function AutomationDashboardPage() {
  const supabase = await createClient();

  // Fetch dashboard stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch order stats (these tables definitely exist)
  const [
    { count: pendingReviewCount },
    { count: inProgressCount },
    { count: submittedCount },
    { count: failedCount },
    { data: recentOrders },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_review'),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_progress'),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['submitted', 'under_review']),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'generation_failed'),
    supabase
      .from('orders')
      .select('id, order_number, status, motion_type')
      .in('status', ['pending_review', 'in_progress', 'submitted', 'under_review', 'generation_failed'])
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  // Safely fetch from tables that may not exist
  const [
    approvalResult,
    activityResult,
    autoProcessedResult,
    notificationResult,
  ] = await Promise.all([
    safeQuery(supabase
      .from('approval_queue')
      .select(`*, orders:order_id (order_number, case_caption, motion_type)`)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5), []),
    safeQuery(supabase
      .from('automation_logs')
      .select(`*, orders:order_id (order_number)`)
      .order('created_at', { ascending: false })
      .limit(15), []),
    safeQuery(supabase
      .from('automation_logs')
      .select('*', { count: 'exact', head: true })
      .eq('was_auto_approved', true)
      .gte('created_at', today.toISOString()), null),
    safeQuery(supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', today.toISOString()), null),
  ]);

  const stats = {
    pendingApprovals: approvalResult.count,
    autoProcessedToday: autoProcessedResult.count,
    activeAlerts: 0,
    pendingTasks: (submittedCount || 0) + (inProgressCount || 0),
    failedTasks24h: failedCount || 0,
    notificationsSentToday: notificationResult.count,
  };

  const orderStats = {
    pendingReviewCount: pendingReviewCount || 0,
    inProgressCount: inProgressCount || 0,
    submittedCount: submittedCount || 0,
    failedCount: failedCount || 0,
    recentOrders: recentOrders || [],
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-teal/20 to-teal/10 rounded-xl">
              <Bot className="h-6 w-6 text-teal" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
              AI Operations Center
            </h1>
          </div>
          <p className="text-gray-500 mt-2">
            Monitor and control automated workflows
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/automation/settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/automation/logs">
              <Activity className="h-4 w-4 mr-2" />
              View Logs
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Actions - Most Important */}
      <QuickActionsPanel {...orderStats} />

      {/* Stats Cards */}
      <div className="mt-6">
        <AutomationStatsCards stats={stats} />
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="approvals" className="mt-8">
        <TabsList className="bg-gray-100/50 p-1">
          <TabsTrigger value="approvals" className="gap-2">
            <Shield className="h-4 w-4" />
            Approvals
            {stats.pendingApprovals > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                {stats.pendingApprovals}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-2">
            <Zap className="h-4 w-4" />
            Overview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Pending Approvals</CardTitle>
                <CardDescription>
                  Items requiring your review before automation can proceed
                </CardDescription>
              </div>
              {stats.pendingApprovals > 5 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/automation/approvals">
                    View all ({stats.pendingApprovals})
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <ApprovalQueueList approvals={approvalResult.data} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <CardDescription>
                Latest automation actions and events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AutomationActivityFeed activities={activityResult.data} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Automation Modules Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Automation Modules</CardTitle>
                <CardDescription>Status of each automation component</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ModuleStatus
                  icon={Shield}
                  name="Conflict Checking"
                  description="AI-powered conflict detection"
                  status="active"
                />
                <ModuleStatus
                  icon={Users}
                  name="Clerk Assignment"
                  description="Smart workload-based routing"
                  status="active"
                />
                <ModuleStatus
                  icon={Bell}
                  name="Notifications"
                  description="Email queue with retry logic"
                  status="active"
                />
                <ModuleStatus
                  icon={FileCheck}
                  name="QA Checks"
                  description="Deliverable quality analysis"
                  status="active"
                />
                <ModuleStatus
                  icon={Clock}
                  name="Deadline Monitoring"
                  description="Proactive deadline alerts"
                  status="active"
                />
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
                <CardDescription>Common automation tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/admin/automation/settings">
                    <Settings className="h-4 w-4 mr-3" />
                    Configure Automation Settings
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/admin/automation/logs">
                    <Activity className="h-4 w-4 mr-3" />
                    View Automation Logs
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/admin/automation/approvals">
                    <Shield className="h-4 w-4 mr-3" />
                    Manage Approval Queue
                  </Link>
                </Button>
                <form action="/api/automation/cron" method="POST">
                  <input type="hidden" name="scheduleRecurring" value="false" />
                  <Button type="submit" variant="outline" className="w-full justify-start">
                    <RefreshCw className="h-4 w-4 mr-3" />
                    Process Pending Tasks Now
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ModuleStatus({
  icon: Icon,
  name,
  description,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'error';
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${
          status === 'active' ? 'bg-emerald-100' :
          status === 'paused' ? 'bg-yellow-100' : 'bg-red-100'
        }`}>
          <Icon className={`h-4 w-4 ${
            status === 'active' ? 'text-emerald-600' :
            status === 'paused' ? 'text-yellow-600' : 'text-red-600'
          }`} />
        </div>
        <div>
          <p className="font-medium text-navy text-sm">{name}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${
        status === 'active' ? 'text-emerald-600' :
        status === 'paused' ? 'text-yellow-600' : 'text-red-600'
      }`}>
        {status === 'active' && <CheckCircle className="h-3.5 w-3.5" />}
        {status === 'paused' && <Clock className="h-3.5 w-3.5" />}
        {status === 'error' && <AlertCircle className="h-3.5 w-3.5" />}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    </div>
  );
}
