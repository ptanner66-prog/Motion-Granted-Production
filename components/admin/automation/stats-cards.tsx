'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  Shield,
  Zap,
  AlertTriangle,
  Clock,
  XCircle,
  Bell,
} from 'lucide-react';
import Link from 'next/link';

interface AutomationStats {
  pendingApprovals: number;
  autoProcessedToday: number;
  activeAlerts: number;
  pendingTasks: number;
  failedTasks24h: number;
  notificationsSentToday: number;
}

export function AutomationStatsCards({ stats }: { stats: AutomationStats }) {
  const cards = [
    {
      label: 'Awaiting Approval',
      value: stats.pendingApprovals,
      icon: Shield,
      urgent: stats.pendingApprovals > 0,
      href: '/admin/automation/approvals',
    },
    {
      label: 'Auto-Processed Today',
      value: stats.autoProcessedToday,
      icon: Zap,
      href: '/admin/automation/logs?filter=auto',
    },
    {
      label: 'Active Alerts',
      value: stats.activeAlerts,
      icon: AlertTriangle,
      urgent: stats.activeAlerts > 0,
      href: '/admin/automation/approvals?urgency=high',
    },
    {
      label: 'Pending Tasks',
      value: stats.pendingTasks,
      icon: Clock,
      href: '/admin/automation/logs?filter=tasks',
    },
    {
      label: 'Failed (24h)',
      value: stats.failedTasks24h,
      icon: XCircle,
      urgent: stats.failedTasks24h > 0,
      href: '/admin/automation/logs?filter=failed',
    },
    {
      label: 'Sent Today',
      value: stats.notificationsSentToday,
      icon: Bell,
      href: '/admin/automation/logs?filter=notifications',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Link key={card.label} href={card.href} className="group">
          <Card
            className={`bg-white border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md ${
              card.urgent ? 'border-l-4 border-l-red-500' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold text-navy tabular-nums">
                    {card.value}
                  </p>
                </div>
                <div className="bg-gray-100 p-2 rounded-lg transition-transform duration-300 group-hover:scale-105">
                  <card.icon className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
