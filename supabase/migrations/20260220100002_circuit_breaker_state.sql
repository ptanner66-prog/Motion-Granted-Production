-- T-75: Circuit breaker state table (Redis → Supabase migration)
-- Stores per-service circuit breaker state for idempotent Inngest replay.
-- Replaces Upstash Redis-backed circuit breaker persistence.

CREATE TABLE IF NOT EXISTS public.circuit_breaker_state (
  service_name TEXT PRIMARY KEY,
  failure_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  state TEXT DEFAULT 'CLOSED' CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  opened_at TIMESTAMPTZ,
  success_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed known services
INSERT INTO public.circuit_breaker_state (service_name)
VALUES
  ('anthropic-api'),
  ('openai-api'),
  ('claude'),
  ('courtlistener'),
  ('stripe'),
  ('resend'),
  ('supabase'),
  ('cloudconvert')
ON CONFLICT DO NOTHING;

-- RLS: service_role only (server-side circuit breaker operations)
ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_circuit_breaker"
  ON public.circuit_breaker_state FOR ALL
  USING (auth.role() = 'service_role');
