'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';

interface OrderStatusCount {
  status: string;
  count: number;
}

interface OrderStatusChartProps {
  data: OrderStatusCount[];
}

// Status configuration with colors and labels
const statusConfig: Record<string, { label: string; color: string; bgColor: string; barColor: string }> = {
  submitted: { label: 'Submitted', color: 'text-blue-700', bgColor: 'bg-blue-100', barColor: 'bg-blue-500' },
  under_review: { label: 'Under Review', color: 'text-purple-700', bgColor: 'bg-purple-100', barColor: 'bg-purple-500' },
  assigned: { label: 'Assigned', color: 'text-indigo-700', bgColor: 'bg-indigo-100', barColor: 'bg-indigo-500' },
  in_progress: { label: 'In Progress', color: 'text-amber-700', bgColor: 'bg-amber-100', barColor: 'bg-amber-500' },
  draft_delivered: { label: 'Draft Delivered', color: 'text-teal-700', bgColor: 'bg-teal-100', barColor: 'bg-teal-500' },
  pending_review: { label: 'Pending Review', color: 'text-cyan-700', bgColor: 'bg-cyan-100', barColor: 'bg-cyan-500' },
  revision_requested: { label: 'Revision Requested', color: 'text-orange-700', bgColor: 'bg-orange-100', barColor: 'bg-orange-500' },
  revision_delivered: { label: 'Revision Delivered', color: 'text-lime-700', bgColor: 'bg-lime-100', barColor: 'bg-lime-500' },
  completed: { label: 'Completed', color: 'text-emerald-700', bgColor: 'bg-emerald-100', barColor: 'bg-emerald-500' },
  on_hold: { label: 'On Hold', color: 'text-gray-700', bgColor: 'bg-gray-100', barColor: 'bg-gray-500' },
  cancelled: { label: 'Cancelled', color: 'text-red-700', bgColor: 'bg-red-100', barColor: 'bg-red-500' },
  generation_failed: { label: 'Generation Failed', color: 'text-red-700', bgColor: 'bg-red-100', barColor: 'bg-red-500' },
};

function getStatusConfig(status: string) {
  return statusConfig[status] || {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    barColor: 'bg-gray-500',
  };
}

export function OrderStatusChart({ data }: OrderStatusChartProps) {
  const { total, maxCount, sortedData, pieData } = useMemo(() => {
    const total = data.reduce((sum, item) => sum + item.count, 0);
    const maxCount = Math.max(...data.map((item) => item.count), 1);

    // Sort by count descending
    const sortedData = [...data].sort((a, b) => b.count - a.count);

    // Calculate pie chart angles
    let currentAngle = 0;
    const pieData = sortedData.map((item) => {
      const angle = (item.count / total) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      return {
        ...item,
        startAngle,
        endAngle: currentAngle,
        percentage: ((item.count / total) * 100).toFixed(1),
      };
    });

    return { total, maxCount, sortedData, pieData };
  }, [data]);

  if (data.length === 0 || total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <svg
          className="h-16 w-16 text-gray-300 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="font-medium">No order data</p>
        <p className="text-sm mt-1">Order statistics will appear here</p>
      </div>
    );
  }

  // Generate pie chart path for each segment
  const generatePiePath = (startAngle: number, endAngle: number, radius: number = 80) => {
    const cx = 100;
    const cy = 100;

    // Convert degrees to radians, starting from -90 degrees (top of circle)
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Pie Chart */}
      <div className="flex flex-col items-center justify-center">
        <svg viewBox="0 0 200 200" className="w-48 h-48">
          {/* Background circle */}
          <circle cx="100" cy="100" r="80" fill="#f3f4f6" />

          {/* Pie segments */}
          {pieData.map((item, index) => {
            const config = getStatusConfig(item.status);
            // Handle full circle case
            if (item.startAngle === 0 && item.endAngle >= 359.9) {
              return (
                <circle
                  key={item.status}
                  cx="100"
                  cy="100"
                  r="80"
                  className={config.barColor}
                  fill="currentColor"
                />
              );
            }
            return (
              <path
                key={item.status}
                d={generatePiePath(item.startAngle, item.endAngle)}
                className={config.barColor}
                fill="currentColor"
                stroke="white"
                strokeWidth="2"
              />
            );
          })}

          {/* Center circle with total */}
          <circle cx="100" cy="100" r="50" fill="white" />
          <text
            x="100"
            y="95"
            textAnchor="middle"
            className="text-2xl font-bold fill-navy"
            style={{ fontSize: '24px' }}
          >
            {total}
          </text>
          <text
            x="100"
            y="115"
            textAnchor="middle"
            className="text-xs fill-gray-500"
            style={{ fontSize: '12px' }}
          >
            Total Orders
          </text>
        </svg>
      </div>

      {/* Bar Chart and Legend */}
      <div className="space-y-3">
        {sortedData.map((item) => {
          const config = getStatusConfig(item.status);
          const percentage = (item.count / total) * 100;
          const barWidth = (item.count / maxCount) * 100;

          return (
            <div key={item.status} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${config.barColor}`} />
                  <span className="text-gray-700">{config.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-navy">{item.count}</span>
                  <Badge variant="secondary" className="text-xs">
                    {percentage.toFixed(1)}%
                  </Badge>
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${config.barColor} rounded-full transition-all duration-500`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
