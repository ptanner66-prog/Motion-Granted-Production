import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Users,
  FileCheck,
  DollarSign,
  Clock,
  ArrowLeft,
  ExternalLink,
  Bot,
  User,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { ApprovalDetailActions } from './approval-detail-actions';
import { calculateAdminRefundSuggestion, type RefundSuggestion } from '@/lib/payments/refund-calculator';

export const metadata: Metadata = {
  title: 'Approval Details | AI Operations Center',
  description: 'Review approval request details.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

const approvalTypeConfig: Record<string, { icon: typeof Shield; label: string; color: string; bgColor: string }> = {
  conflict_review: { icon: Shield, label: 'Conflict Review', color: 'text-orange-600', bgColor: 'bg-orange-50' },
  clerk_assignment: { icon: Users, label: 'Clerk Assignment', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  qa_override: { icon: FileCheck, label: 'QA Override', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  refund_request: { icon: DollarSign, label: 'Refund Request', color: 'text-red-600', bgColor: 'bg-red-50' },
  change_order: { icon: DollarSign, label: 'Change Order', color: 'text-green-600', bgColor: 'bg-green-50' },
  deadline_extension: { icon: Clock, label: 'Deadline Extension', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
};

const urgencyConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Low Priority', color: 'bg-gray-100 text-gray-700' },
  normal: { label: 'Normal Priority', color: 'bg-blue-100 text-blue-700' },
  high: { label: 'High Priority', color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Critical Priority', color: 'bg-red-100 text-red-700' },
};

export default async function ApprovalDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch approval with related data
  const { data: approval, error } = await supabase
    .from('approval_queue')
    .select(`
      *,
      orders:order_id (
        id,
        order_number,
        case_caption,
        motion_type,
        status,
        created_at,
        client_id,
        amount_paid_cents,
        current_phase,
        profiles:client_id (
          full_name,
          email
        )
      ),
      reviewer:reviewed_by (
        full_name,
        email
      )
    `)
    .eq('id', id)
    .single();

  if (error || !approval) {
    notFound();
  }

  const config = approvalTypeConfig[approval.approval_type] || {
    icon: AlertTriangle,
    label: approval.approval_type,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  };
  const urgency = urgencyConfig[approval.urgency] || urgencyConfig.normal;
  const Icon = config.icon;
  const order = approval.orders as {
    id: string;
    order_number: string;
    case_caption: string;
    motion_type: string;
    status: string;
    created_at: string;
    client_id: string;
    amount_paid_cents: number | null;
    current_phase: string | null;
    profiles: { full_name: string; email: string } | null;
  } | null;

  const isPending = approval.status === 'pending';

  // Parse request details for display
  const requestDetails = approval.request_details as Record<string, unknown>;

  // Calculate refund suggestion for refund_request approvals
  let refundSuggestion: RefundSuggestion | null = null;
  if (approval.approval_type === 'refund_request' && order?.amount_paid_cents && order?.current_phase) {
    refundSuggestion = calculateAdminRefundSuggestion(order.amount_paid_cents, order.current_phase);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/automation/approvals">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Queue
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-navy">{config.label}</h1>
              <Badge variant="outline" className={urgency.color}>
                {urgency.label}
              </Badge>
              {!isPending && (
                <Badge
                  variant="outline"
                  className={
                    approval.status === 'approved'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }
                >
                  {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
                </Badge>
              )}
            </div>
            <p className="text-gray-500">
              ID: {approval.id}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Type Card */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-xl ${config.bgColor}`}>
                  <Icon className={`h-8 w-8 ${config.color}`} />
                </div>
                <div>
                  <CardTitle>{config.label}</CardTitle>
                  <CardDescription>
                    Created {new Date(approval.created_at).toLocaleString()}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* AI Analysis */}
          {(approval.ai_recommendation || approval.ai_reasoning) && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-teal" />
                  <CardTitle className="text-lg">AI Analysis</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {approval.ai_recommendation && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Recommendation</h4>
                    <p className="text-navy font-medium">{approval.ai_recommendation}</p>
                    {approval.ai_confidence !== null && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal rounded-full"
                            style={{ width: `${approval.ai_confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-500">
                          {Math.round(approval.ai_confidence * 100)}% confidence
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {approval.ai_reasoning && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Reasoning</h4>
                    <p className="text-gray-700 whitespace-pre-wrap">{approval.ai_reasoning}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Request Details */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Request Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(requestDetails, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Resolution Info (if resolved) */}
          {!isPending && approval.resolved_at && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-gray-500" />
                  <CardTitle className="text-lg">Resolution</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status</span>
                  <Badge
                    className={
                      approval.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }
                  >
                    {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Resolved At</span>
                  <span className="font-medium">
                    {new Date(approval.resolved_at).toLocaleString()}
                  </span>
                </div>
                {approval.reviewer && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Reviewed By</span>
                    <span className="font-medium">
                      {(approval.reviewer as { full_name: string }).full_name}
                    </span>
                  </div>
                )}
                {approval.review_notes && (
                  <div>
                    <span className="text-gray-500 block mb-1">Notes</span>
                    <p className="bg-gray-50 rounded-lg p-3 text-gray-700">
                      {approval.review_notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Refund Suggestion (refund_request only) */}
          {refundSuggestion && (
            <Card className="border-0 shadow-sm border-l-4 border-l-amber-400">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Refund Guidance</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-navy">
                    ${(refundSuggestion.suggestedRefundCents / 100).toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {refundSuggestion.suggestedPercentage}% of ${((order?.amount_paid_cents ?? 0) / 100).toFixed(2)} paid
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Phase at Refund</span>
                  <p className="font-mono font-medium">{refundSuggestion.phase}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Reasoning</span>
                  <p className="text-sm text-gray-700">{refundSuggestion.reasoning}</p>
                </div>
                <p className="text-xs text-gray-400 italic">
                  Advisory only — override with mandatory reason (min 10 chars)
                </p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {isPending && (
            <ApprovalDetailActions
              approvalId={approval.id}
              approvalType={approval.approval_type}
              refundSuggestion={refundSuggestion}
              orderId={order?.id}
            />
          )}

          {/* Order Info */}
          {order && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Related Order</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <span className="text-xs text-gray-500">Order Number</span>
                  <p className="font-mono font-medium">{order.order_number}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Case Caption</span>
                  <p className="font-medium text-navy line-clamp-2">{order.case_caption}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Motion Type</span>
                  <p>{order.motion_type}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Order Status</span>
                  <Badge variant="outline" className="ml-2">{order.status}</Badge>
                </div>
                {order.profiles && (
                  <div>
                    <span className="text-xs text-gray-500">Client</span>
                    <p className="font-medium">{order.profiles.full_name}</p>
                    <p className="text-sm text-gray-500">{order.profiles.email}</p>
                  </div>
                )}
                <Link href={`/admin/orders/${order.id}`}>
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Order
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-teal" />
                    <div className="w-0.5 h-full bg-gray-200" />
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-gray-500">
                      {new Date(approval.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {approval.resolved_at && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full ${
                        approval.status === 'approved' ? 'bg-emerald-500' : 'bg-red-500'
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {approval.status === 'approved' ? 'Approved' : 'Rejected'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(approval.resolved_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
                {isPending && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-orange-600">Awaiting Review</p>
                      <p className="text-xs text-gray-500">Pending your decision</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
