-- SP-22 Task 2: Expand hold_reason CHECK constraint
-- Adds all 4 canonical hold_reason values
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_hold_reason;
ALTER TABLE orders ADD CONSTRAINT chk_hold_reason CHECK (
  hold_reason IS NULL OR hold_reason IN (
    'evidence_gap',
    'tier_reclassification',
    'revision_stall',
    'citation_critical_failure'
  )
);

-- Add resume_phase column if not exists (for citation_critical_failure → PHASE_CURRENT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'resume_phase'
  ) THEN
    ALTER TABLE orders ADD COLUMN resume_phase TEXT;
  END IF;
END $$;
