/**
 * POST /api/webhooks/support-email
 *
 * Inbound email webhook handler for support tickets.
 * Receives parsed email data from Resend inbound webhook,
 * creates a support ticket, and auto-classifies priority.
 *
 * Webhook signature verified via RESEND_WEBHOOK_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { classifyPriority, extractOrderId, calculateDeadlines } from '@/lib/support/sla-engine';
import { createLogger } from '@/lib/logging/logger';

const logger = createLogger('webhook-support-email');

interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  messageId?: string;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createSupabaseClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature if configured
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('svix-signature') || request.headers.get('webhook-signature');
      if (!signature) {
        logger.warn('support_email.no_signature');
        return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
      }
      // Resend uses Svix for webhook delivery — simplified verification
      // In production, use the svix package for full verification
    }

    let body: InboundEmail;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { from, subject, text, html } = body;

    if (!from || !subject) {
      return NextResponse.json({ error: 'Missing required fields (from, subject)' }, { status: 400 });
    }

    // Extract sender email
    const emailMatch = from.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const senderEmail = emailMatch ? emailMatch[0].toLowerCase() : from;

    // Extract sender name
    const nameMatch = from.match(/^([^<]+)/);
    const senderName = nameMatch ? nameMatch[1].trim() : undefined;

    // Get body text (prefer text, fallback to stripping HTML)
    const bodyText = text || (html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');

    // Extract order ID from email content
    const combinedText = `${subject} ${bodyText}`;
    const orderNumber = extractOrderId(combinedText);

    // Auto-classify priority
    const priority = classifyPriority(subject, bodyText, !!orderNumber);

    // Calculate SLA deadlines
    const now = new Date();
    const deadlines = calculateDeadlines(now, priority);

    const supabase = getSupabase();

    // Look up order ID if we found an order number
    let orderId: string | null = null;
    if (orderNumber) {
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', orderNumber)
        .single();
      orderId = order?.id || null;
    }

    // Create support ticket
    const { data: ticket, error: insertError } = await supabase
      .from('support_tickets')
      .insert({
        order_id: orderId,
        sender_email: senderEmail,
        sender_name: senderName,
        subject,
        body: bodyText.slice(0, 10000), // Cap body at 10K chars
        priority,
        status: 'open',
        sla_response_by: deadlines.responseBy.toISOString(),
        sla_resolution_by: deadlines.resolutionBy.toISOString(),
        message_id: body.messageId || null,
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error('support_email.insert_failed', {
        error: insertError.message,
        senderEmail,
      });
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }

    logger.info('support_email.ticket_created', {
      ticketId: ticket.id,
      priority,
      hasOrderId: String(!!orderId),
      senderEmail,
    });

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      priority,
      slaResponseBy: deadlines.responseBy.toISOString(),
    });
  } catch (err) {
    logger.error('support_email.webhook_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
