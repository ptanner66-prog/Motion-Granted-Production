// /lib/workflow/revision-loop.ts
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import { FAILURE_THRESHOLDS, isProtocol10Triggered } from '@/lib/config/workflow-config';

export interface RevisionResult {
  revisionCount: number;
  protocol10Triggered: boolean;
  disclosure?: string;
  shouldContinue: boolean;
}

export function generateProtocol10Disclosure(loops: number, grade?: string): string {
  return `DISCLOSURE (Per Protocol 10):
This motion underwent ${loops} revision cycles during automated QA.
${grade ? `Final automated review grade: ${grade}.` : ''}
Attorney review is recommended before filing.
This disclosure is provided for transparency per Motion Granted's quality protocols.`;
}

export async function incrementRevisionLoop(orderId: string, judgeGrade?: string): Promise<RevisionResult> {
  const supabase = await createClient();

  const { data: order, error } = await supabase.from('orders').select('revision_count').eq('id', orderId).single();
  if (error || !order) throw new Error(`Failed to fetch order: ${error?.message}`);

  const newCount = (order.revision_count || 0) + 1;
  await supabase.from('orders').update({ revision_count: newCount, updated_at: new Date().toISOString() }).eq('id', orderId);

  const triggered = isProtocol10Triggered(newCount);

  if (triggered) {
    const disclosure = generateProtocol10Disclosure(newCount, judgeGrade);
    await supabase.from('orders').update({ protocol_10_disclosure: disclosure, protocol_10_triggered_at: new Date().toISOString() }).eq('id', orderId);
    await supabase.from('checkpoint_events').insert({ order_id: orderId, event_type: 'PROTOCOL_10_TRIGGERED', phase: 'VIII', data: { revision_count: newCount, grade: judgeGrade }, created_at: new Date().toISOString() });
    console.log(`[Protocol 10] Order ${orderId} reached ${newCount} revision loops`);
    return { revisionCount: newCount, protocol10Triggered: true, disclosure, shouldContinue: false };
  }

  return { revisionCount: newCount, protocol10Triggered: false, shouldContinue: true };
}

export async function getRevisionStatus(orderId: string): Promise<{ count: number; max: number; remaining: number; triggered: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.from('orders').select('revision_count, protocol_10_triggered_at').eq('id', orderId).single();
  const count = data?.revision_count || 0;
  return { count, max: FAILURE_THRESHOLDS.MAX_REVISION_LOOPS, remaining: Math.max(0, 3 - count), triggered: !!data?.protocol_10_triggered_at };
}

export async function resetRevisionLoop(orderId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('orders').update({ revision_count: 0, protocol_10_disclosure: null, protocol_10_triggered_at: null }).eq('id', orderId);
}
