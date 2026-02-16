-- ==========================================================================
-- MIGRATION: Complete citation pipeline table schemas
-- AUDIT REF: DUP-001 (P0), FDN-001 (P1), FDN-002 (P1)
-- DATE: 2026-02-16 CST
-- ==========================================================================

-- citation_banks: Add count columns
ALTER TABLE citation_banks ADD COLUMN IF NOT EXISTS total_citations INTEGER DEFAULT 0;
ALTER TABLE citation_banks ADD COLUMN IF NOT EXISTS verified_count INTEGER DEFAULT 0;
ALTER TABLE citation_banks ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;

-- citation_verifications: Add detail columns
ALTER TABLE citation_verifications ADD COLUMN IF NOT EXISTS full_citation TEXT;
ALTER TABLE citation_verifications ADD COLUMN IF NOT EXISTS stage_1_courtlistener_id TEXT;
ALTER TABLE citation_verifications ADD COLUMN IF NOT EXISTS stage_2_opinion_text TEXT;

-- citation_verification_log: Add 7-step pipeline columns
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_1_extraction JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_2_holding JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_3_dicta JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_4_quotation JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_5_subsequent JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_6_courtlistener JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS composite_status VARCHAR(20);
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS models_used JSONB;

-- conflict_matches: Add resolution columns (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conflict_matches') THEN
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS type VARCHAR(50);
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS severity VARCHAR(20);
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS match_field VARCHAR(100);
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2);
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS resolution_note TEXT;
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);
  END IF;
END $$;
