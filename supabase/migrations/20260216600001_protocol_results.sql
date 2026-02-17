-- MIGRATION: protocol_results table
-- Source: D9 A-1 | SP-13 AM-1
-- Append-only audit trail for all 23 protocol evaluation results.
-- UNIQUE constraint ensures idempotent Inngest step retries.
-- Immutability trigger prevents UPDATE/DELETE — corrections use supersedes_id.

CREATE TABLE protocol_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  protocol_number INTEGER NOT NULL CHECK (protocol_number >= 1 AND protocol_number <= 23),
  citation_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  triggered BOOLEAN NOT NULL DEFAULT false,
  severity TEXT CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  action_taken TEXT,
  ais_entry JSONB,
  handler_version TEXT NOT NULL DEFAULT '1.0.0',
  input_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes_id UUID REFERENCES protocol_results(id),
  UNIQUE(order_id, phase, protocol_number, citation_id)
);

CREATE INDEX idx_protocol_results_order ON protocol_results(order_id);
CREATE INDEX idx_protocol_results_order_phase ON protocol_results(order_id, phase);

-- RLS: CRITICAL — use orders.client_id (NOT orders.user_id) per D1 R4 CST-01
ALTER TABLE protocol_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY prot_results_select ON protocol_results FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY prot_results_insert ON protocol_results FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Immutability trigger: append-only audit trail
CREATE OR REPLACE FUNCTION prevent_protocol_results_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'protocol_results is append-only. UPDATE and DELETE are prohibited. To correct a result, INSERT a new row with supersedes_id referencing the original.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protocol_results_immutable
  BEFORE UPDATE OR DELETE ON protocol_results
  FOR EACH ROW
  EXECUTE FUNCTION prevent_protocol_results_mutation();

-- P7 cumulative failure count RPC (Decision 5: CUMULATIVE scope, Decision 6: no explicit reset)
-- Uses MAX(id) subquery to get latest verification per citation, avoiding double-counting.
CREATE OR REPLACE FUNCTION get_p7_failure_count(p_order_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) FROM citation_verifications cv
    WHERE cv.order_id = p_order_id
      AND cv.removed_in_revision = false
      AND cv.status IN ('NOT_FOUND', 'MISMATCH', 'QUOTE_NOT_FOUND')
      AND cv.id = (
        SELECT MAX(cv2.id) FROM citation_verifications cv2
        WHERE cv2.order_id = cv.order_id
          AND cv2.citation_id = cv.citation_id
      )
  );
END;
$$ LANGUAGE plpgsql;
