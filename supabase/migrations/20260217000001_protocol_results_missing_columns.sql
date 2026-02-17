-- MIGRATION: Add missing columns to protocol_results
-- Source: Schema audit — code vs database comparison
--
-- The protocol_results table was created with a different column set than
-- what lib/protocols/persistence.ts expects. This migration adds the 4
-- columns the code inserts plus the supersedes_id column from the original
-- migration spec, and the UNIQUE constraint required for upsert idempotency.
--
-- Missing columns found:
--   triggered       — persistence.ts inserts result.triggered (BOOLEAN)
--   ais_entry       — persistence.ts inserts result.aisEntry (JSONB)
--   handler_version — persistence.ts inserts result.handlerVersion (TEXT)
--   input_hash      — persistence.ts inserts SHA-256 hash for idempotency (TEXT)
--   supersedes_id   — append-only correction pattern from original spec (UUID)

-- 1. triggered: whether the protocol was triggered (true) or evaluated clean (false)
ALTER TABLE public.protocol_results
  ADD COLUMN IF NOT EXISTS triggered BOOLEAN NOT NULL DEFAULT false;

-- 2. ais_entry: structured JSONB audit entry (AI Safety entry)
ALTER TABLE public.protocol_results
  ADD COLUMN IF NOT EXISTS ais_entry JSONB;

-- 3. handler_version: semver of the protocol handler that produced this result
ALTER TABLE public.protocol_results
  ADD COLUMN IF NOT EXISTS handler_version TEXT NOT NULL DEFAULT '1.0.0';

-- 4. input_hash: SHA-256 of (citationId + phase + status) for dedup
ALTER TABLE public.protocol_results
  ADD COLUMN IF NOT EXISTS input_hash TEXT;

-- 5. supersedes_id: self-referencing FK for append-only corrections
ALTER TABLE public.protocol_results
  ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES public.protocol_results(id);

-- 6. UNIQUE constraint for upsert ON CONFLICT (idempotent Inngest step retries)
--    Uses DO NOTHING so concurrent retries don't fail.
--    Wrap in DO block to avoid error if constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'protocol_results_order_id_phase_protocol_number_citation_id_key'
      AND conrelid = 'public.protocol_results'::regclass
  ) THEN
    ALTER TABLE public.protocol_results
      ADD CONSTRAINT protocol_results_order_id_phase_protocol_number_citation_id_key
      UNIQUE (order_id, phase, protocol_number, citation_id);
  END IF;
END $$;
