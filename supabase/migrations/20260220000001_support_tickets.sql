-- SP-GOD-6: Support ticket system
-- Creates support_tickets table for inbound email support

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  subject TEXT NOT NULL,
  body TEXT,
  priority TEXT NOT NULL DEFAULT 'P3' CHECK (priority IN ('P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  sla_response_by TIMESTAMPTZ,
  sla_resolution_by TIMESTAMPTZ,
  sla_breached BOOLEAN DEFAULT FALSE,
  message_id TEXT,
  tags TEXT[] DEFAULT '{}',
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON public.support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sender ON public.support_tickets(sender_email);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_breach ON public.support_tickets(sla_breached) WHERE sla_breached = TRUE;
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON public.support_tickets(created_at DESC);

-- RLS: Admin-only access to support tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Admin can see all tickets
CREATE POLICY admin_all_support_tickets ON public.support_tickets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Clients can see tickets linked to their orders
CREATE POLICY client_own_support_tickets ON public.support_tickets
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE client_id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_support_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_ticket_timestamp();

-- Auto-detect SLA breach
CREATE OR REPLACE FUNCTION check_sla_breach()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('resolved', 'closed') THEN
    IF NEW.sla_response_by IS NOT NULL AND NEW.first_response_at IS NULL AND now() > NEW.sla_response_by THEN
      NEW.sla_breached = TRUE;
    END IF;
    IF NEW.sla_resolution_by IS NOT NULL AND NEW.resolved_at IS NULL AND now() > NEW.sla_resolution_by THEN
      NEW.sla_breached = TRUE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_sla_check
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION check_sla_breach();

COMMENT ON TABLE public.support_tickets IS 'SP-GOD-6: Inbound support email tickets with SLA tracking';
