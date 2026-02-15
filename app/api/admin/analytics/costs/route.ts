/**
 * Cost Analytics API Route
 *
 * GET: Returns aggregated cost metrics for the admin dashboard
 *
 * Source: Chunk 8, Task 53
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-analytics-costs');

export async function GET() {
  try {
    const supabase = await createClient();

    // Auth check — must be admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch workflow states with costs
    const { data: workflowStates, error: workflowError } = await supabase
      .from('order_workflow_state')
      .select(`
        order_id,
        api_costs,
        current_tier,
        orders!inner (
          id,
          order_number,
          motion_type,
          created_at
        )
      `)
      .gte('orders.created_at', thirtyDaysAgo.toISOString());

    if (workflowError) {
      log.error('Error fetching workflow states', { error: workflowError });
      // Return empty metrics if error
      return NextResponse.json(getEmptyMetrics());
    }

    // Calculate metrics
    let totalCost = 0;
    const costByPhase: Record<string, number> = {};
    const costByTier: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    const costByProvider: Record<string, number> = {
      anthropic: 0,
      openai: 0,
      courtlistener: 0,
      pacer: 0,
    };
    const orderCosts: Array<{
      orderId: string;
      orderNumber: string;
      cost: number;
      motionType: string;
    }> = [];

    for (const state of workflowStates || []) {
      const apiCosts = state.api_costs as Record<string, unknown> || {};
      const order = state.orders as { id: string; order_number: string; motion_type: string };
      let orderTotal = 0;

      // Sum costs by phase
      for (const [key, value] of Object.entries(apiCosts)) {
        if (typeof value === 'number') {
          costByPhase[key] = (costByPhase[key] || 0) + value;
          orderTotal += value;
        } else if (typeof value === 'object' && value !== null) {
          const phaseData = value as Record<string, unknown>;
          // Handle nested structure like { anthropic: 0.05, openai: 0.02 }
          for (const [provider, cost] of Object.entries(phaseData)) {
            if (typeof cost === 'number') {
              costByProvider[provider] = (costByProvider[provider] || 0) + cost;
              orderTotal += cost;
            }
          }
          // Also track by phase
          const phaseTotal = Object.values(phaseData).reduce<number>(
            (sum: number, v) => sum + (typeof v === 'number' ? v : 0),
            0
          );
          costByPhase[key] = (costByPhase[key] || 0) + phaseTotal;
        }
      }

      // Handle provider-level totals if stored
      if (apiCosts.anthropic && typeof apiCosts.anthropic === 'number') {
        costByProvider.anthropic += apiCosts.anthropic;
      }
      if (apiCosts.openai && typeof apiCosts.openai === 'number') {
        costByProvider.openai += apiCosts.openai;
      }

      totalCost += orderTotal;

      // Track by tier
      const tier = (state.current_tier as string) || 'B';
      if (tier === 'A' || tier === 'B' || tier === 'C' || tier === 'D') {
        costByTier[tier] += orderTotal;
      }

      // Track per order
      if (order) {
        orderCosts.push({
          orderId: order.id,
          orderNumber: order.order_number || order.id.slice(0, 8),
          cost: orderTotal,
          motionType: order.motion_type || 'Unknown',
        });
      }
    }

    // Sort and get top 10 expensive orders
    const topExpensiveOrders = orderCosts
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    // Calculate monthly trend (last 6 months)
    const monthlyTrend = await calculateMonthlyTrend(supabase);

    // Calculate average
    const totalOrders = (workflowStates || []).length;
    const averageCostPerOrder = totalOrders > 0 ? totalCost / totalOrders : 0;

    return NextResponse.json({
      totalCostLast30Days: totalCost,
      averageCostPerOrder,
      costByPhase,
      costByTier,
      costByProvider,
      monthlyTrend,
      topExpensiveOrders,
      totalOrders,
    });
  } catch (error) {
    log.error('Cost analytics error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(getEmptyMetrics(), { status: 500 });
  }
}

async function calculateMonthlyTrend(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Array<{ month: string; cost: number }>> {
  const months: Array<{ month: string; cost: number }> = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const { data } = await supabase
      .from('order_workflow_state')
      .select('api_costs, orders!inner(created_at)')
      .gte('orders.created_at', startDate.toISOString())
      .lte('orders.created_at', endDate.toISOString());

    let monthTotal = 0;
    for (const state of data || []) {
      const costs = state.api_costs as Record<string, unknown> || {};
      for (const value of Object.values(costs)) {
        if (typeof value === 'number') {
          monthTotal += value;
        } else if (typeof value === 'object' && value !== null) {
          for (const v of Object.values(value as Record<string, unknown>)) {
            if (typeof v === 'number') {
              monthTotal += v;
            }
          }
        }
      }
    }

    months.push({
      month: startDate.toLocaleDateString('en-US', { month: 'short' }),
      cost: monthTotal,
    });
  }

  return months;
}

function getEmptyMetrics() {
  return {
    totalCostLast30Days: 0,
    averageCostPerOrder: 0,
    costByPhase: {},
    costByTier: { A: 0, B: 0, C: 0, D: 0 },
    costByProvider: { anthropic: 0, openai: 0, courtlistener: 0, pacer: 0 },
    monthlyTrend: [],
    topExpensiveOrders: [],
    totalOrders: 0,
  };
}
