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
      bgColor: stats.pendingApprovals > 0
        ? 'bg-gradient-to-br from-orange-50 to-orange-100'
        : 'bg-gradient-to-br from-gray-50 to-gray-100',
      iconBg: stats.pendingApprovals > 0 ? 'bg-orange-500/10' : 'bg-gray-500/10',
      iconColor: stats.pendingApprovals > 0 ? 'text-orange-600' : 'text-gray-500',
      valueColor: stats.pendingApprovals > 0 ? 'text-orange-700' : 'text-gray-600',
      urgent: stats.pendingApprovals > 0,
      href: '/admin/automation/approvals',
    },
    {
      label: 'Auto-Processed Today',
      value: stats.autoProcessedToday,
      icon: Zap,
      bgColor: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600',
      valueColor: 'text-emerald-700',
      href: '/admin/automation/logs?filter=auto',
    },
    {
      label: 'Active Alerts',
      value: stats.activeAlerts,
      icon: AlertTriangle,
      bgColor: stats.activeAlerts > 0
        ? 'bg-gradient-to-br from-red-50 to-red-100'
        : 'bg-gradient-to-br from-gray-50 to-gray-100',
      iconBg: stats.activeAlerts > 0 ? 'bg-red-500/10' : 'bg-gray-500/10',
      iconColor: stats.activeAlerts > 0 ? 'text-red-600' : 'text-gray-500',
      valueColor: stats.activeAlerts > 0 ? 'text-red-700' : 'text-gray-600',
      urgent: stats.activeAlerts > 0,
      href: '/admin/automation/approvals?urgency=high',
    },
    {
      label: 'Pending Tasks',
      value: stats.pendingTasks,
      icon: Clock,
      bgColor: 'bg-gradient-to-br from-blue-50 to-blue-100',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
      valueColor: 'text-blue-700',
      href: '/admin/automation/logs?filter=tasks',
    },
    {
      label: 'Failed (24h)',
      value: stats.failedTasks24h,
      icon: XCircle,
      bgColor: stats.failedTasks24h > 0
        ? 'bg-gradient-to-br from-red-50 to-red-100'
        : 'bg-gradient-to-br from-gray-50 to-gray-100',
      iconBg: stats.failedTasks24h > 0 ? 'bg-red-500/10' : 'bg-gray-500/10',
      iconColor: stats.failedTasks24h > 0 ? 'text-red-600' : 'text-gray-500',
      valueColor: stats.failedTasks24h > 0 ? 'text-red-700' : 'text-gray-600',
      href: '/admin/automation/logs?filter=failed',
    },
    {
      label: 'Sent Today',
      value: stats.notificationsSentToday,
      icon: Bell,
      bgColor: 'bg-gradient-to-br from-purple-50 to-purple-100',
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-600',
      valueColor: 'text-purple-700',
      href: '/admin/automation/logs?filter=notifications',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Link key={card.label} href={card.href} className="group">
          <Card
            className={`${card.bgColor} border-0 overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg ${
              card.urgent ? 'ring-2 ring-orange-400' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    {card.label}
                  </p>
                  <p className={`text-2xl font-bold ${card.valueColor} tabular-nums`}>
                    {card.value}
                  </p>
                </div>
                <div
                  className={`${card.iconBg} p-2 rounded-lg transition-transform duration-300 group-hover:scale-110`}
                >
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
