-- ============================================================================
-- Motion Granted Database Migrations Foundation (Chunk 1: Tasks 24-31)
-- CIV Spec Implementation - v4.1 Specification
-- ============================================================================
-- Tables Created:
--   - overruled_cases (Task 24)
--   - citation_verification_log (Task 25)
--   - model_routing_config (Task 26)
--   - verified_citations (Task 27)
--   - citation_relationships (Task 28)
--   - anonymized_analytics (Task 30)
--   - refunds (Task 31)
--
-- Tables Modified:
--   - orders (Task 29 - data retention columns)
-- ============================================================================

-- ============================================================================
-- TASK 24: CREATE OVERRULED_CASES TABLE
-- Source: CIV Spec Section 8, API Architecture Spec Section 6.1
-- Purpose: Layer 2 bad law check
-- ============================================================================

CREATE TABLE IF NOT EXISTS overruled_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation TEXT NOT NULL,
  normalized_citation TEXT UNIQUE,
  overruled_by TEXT NOT NULL,
  overruled_date DATE,
  jurisdiction VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for overruled_cases
CREATE INDEX IF NOT EXISTS idx_overruled_normalized ON overruled_cases(normalized_citation);
CREATE INDEX IF NOT EXISTS idx_overruled_jurisdiction ON overruled_cases(jurisdiction);

-- Updated timestamp trigger for overruled_cases
DROP TRIGGER IF EXISTS update_overruled_cases_timestamp ON overruled_cases;
CREATE TRIGGER update_overruled_cases_timestamp
  BEFORE UPDATE ON overruled_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed data: Commonly cited overruled cases
INSERT INTO overruled_cases (citation, normalized_citation, overruled_by, overruled_date, jurisdiction, notes)
VALUES
  (
    'Plessy v. Ferguson, 163 U.S. 537 (1896)',
    '163 U.S. 537',
    'Brown v. Board of Education, 347 U.S. 483 (1954)',
    '1954-05-17',
    'federal',
    'Overruled the "separate but equal" doctrine. Brown held that racial segregation in public schools violates the Equal Protection Clause of the Fourteenth Amendment.'
  ),
  (
    'Lochner v. New York, 198 U.S. 45 (1905)',
    '198 U.S. 45',
    'West Coast Hotel Co. v. Parrish, 300 U.S. 379 (1937)',
    '1937-03-29',
    'federal',
    'Ended the Lochner era of substantive due process protection for freedom of contract. West Coast Hotel upheld state minimum wage laws.'
  ),
  (
    'Bowers v. Hardwick, 478 U.S. 186 (1986)',
    '478 U.S. 186',
    'Lawrence v. Texas, 539 U.S. 558 (2003)',
    '2003-06-26',
    'federal',
    'Lawrence overruled Bowers, holding that intimate consensual sexual conduct is part of the liberty protected by substantive due process under the Fourteenth Amendment.'
  ),
  (
    'Austin v. Michigan Chamber of Commerce, 494 U.S. 652 (1990)',
    '494 U.S. 652',
    'Citizens United v. Federal Election Commission, 558 U.S. 310 (2010)',
    '2010-01-21',
    'federal',
    'Citizens United overruled Austin, holding that the First Amendment prohibits the government from restricting political expenditures by corporations, associations, or labor unions.'
  ),
  (
    'Korematsu v. United States, 323 U.S. 214 (1944)',
    '323 U.S. 214',
    'Trump v. Hawaii, 585 U.S. ___ (2018)',
    '2018-06-26',
    'federal',
    'While Trump v. Hawaii did not technically overrule Korematsu, Chief Justice Roberts explicitly stated that Korematsu was "gravely wrong the day it was decided" and "has been overruled in the court of history."'
  ),
  (
    'Quill Corp. v. North Dakota, 504 U.S. 298 (1992)',
    '504 U.S. 298',
    'South Dakota v. Wayfair, Inc., 585 U.S. ___ (2018)',
    '2018-06-21',
    'federal',
    'Wayfair overruled Quill''s physical presence requirement for states to require out-of-state sellers to collect and remit sales tax.'
  ),
  (
    'Chisholm v. Georgia, 2 U.S. 419 (1793)',
    '2 U.S. 419',
    'Eleventh Amendment (1795)',
    '1795-02-07',
    'federal',
    'The Eleventh Amendment was ratified specifically to overrule Chisholm, establishing state sovereign immunity from suits by citizens of other states.'
  ),
  (
    'Dred Scott v. Sandford, 60 U.S. 393 (1857)',
    '60 U.S. 393',
    'Thirteenth and Fourteenth Amendments (1865, 1868)',
    '1865-12-06',
    'federal',
    'The Thirteenth and Fourteenth Amendments effectively overruled Dred Scott by abolishing slavery and granting citizenship to all persons born in the United States.'
  )
ON CONFLICT (normalized_citation) DO NOTHING;

-- RLS for overruled_cases
ALTER TABLE overruled_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to overruled_cases"
  ON overruled_cases FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Public read access to overruled_cases"
  ON overruled_cases FOR SELECT
  USING (true);

COMMENT ON TABLE overruled_cases IS 'Registry of overruled cases for Layer 2 bad law verification';


-- ============================================================================
-- TASK 25: CREATE CITATION_VERIFICATION_LOG TABLE
-- Source: CIV Spec Section 10, API Architecture Spec Section 6.1
-- Purpose: Audit trail for malpractice defense
-- ============================================================================

CREATE TABLE IF NOT EXISTS citation_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  citation_id UUID,
  citation_string TEXT NOT NULL,
  proposition TEXT,
  proposition_type VARCHAR(50),
  step_1_result JSONB,
  step_2_result JSONB,
  step_3_result JSONB,
  step_4_result JSONB,
  step_5_result JSONB,
  step_6_result JSONB,
  composite_status VARCHAR(20) NOT NULL,
  composite_confidence DECIMAL(5,4),
  flags TEXT[],
  action_required VARCHAR(50),
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  verification_duration_ms INTEGER,
  models_used TEXT[],
  api_calls_made INTEGER,
  estimated_cost DECIMAL(10,4),
  phase VARCHAR(10)
);

-- Indexes for citation_verification_log
CREATE INDEX IF NOT EXISTS idx_civ_log_order ON citation_verification_log(order_id);
CREATE INDEX IF NOT EXISTS idx_civ_log_status ON citation_verification_log(composite_status);
CREATE INDEX IF NOT EXISTS idx_civ_log_verified ON citation_verification_log(verified_at);
CREATE INDEX IF NOT EXISTS idx_civ_log_citation_id ON citation_verification_log(citation_id);

-- RLS for citation_verification_log
ALTER TABLE citation_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to citation_verification_log"
  ON citation_verification_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own citation_verification_log"
  ON citation_verification_log FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all citation_verification_log"
  ON citation_verification_log FOR SELECT
  USING (public.is_admin());

COMMENT ON TABLE citation_verification_log IS 'Complete audit trail of citation verification for malpractice defense';


-- ============================================================================
-- TASK 26: CREATE MODEL_ROUTING_CONFIG TABLE
-- Source: API Architecture Spec Section 6.1
-- Purpose: AI model configuration per tier and task type
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_routing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier VARCHAR(10) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  model_string VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tier, task_type)
);

-- Indexes for model_routing_config
CREATE INDEX IF NOT EXISTS idx_model_routing_tier ON model_routing_config(tier);
CREATE INDEX IF NOT EXISTS idx_model_routing_active ON model_routing_config(is_active);

-- Updated timestamp trigger for model_routing_config
DROP TRIGGER IF EXISTS update_model_routing_config_timestamp ON model_routing_config;
CREATE TRIGGER update_model_routing_config_timestamp
  BEFORE UPDATE ON model_routing_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed data: Tier A/B/C configuration from API Architecture Spec Section 2.3
INSERT INTO model_routing_config (tier, task_type, model_string) VALUES
  -- Tier A Configuration
  ('A', 'stage_1_holding', 'gpt-4o'),
  ('A', 'stage_2_adversarial', 'claude-opus-4-5-20250101'),
  ('A', 'dicta_detection', 'claude-haiku-4-5-20251001'),
  ('A', 'bad_law_analysis', 'claude-haiku-4-5-20251001'),
  ('A', 'drafting', 'claude-sonnet-4-5-20250929'),
  -- Tier B Configuration
  ('B', 'stage_1_holding', 'gpt-4o'),
  ('B', 'stage_2_adversarial', 'claude-opus-4-5-20250101'),
  ('B', 'dicta_detection', 'claude-haiku-4-5-20251001'),
  ('B', 'bad_law_analysis', 'claude-haiku-4-5-20251001'),
  ('B', 'drafting', 'claude-sonnet-4-5-20250929'),
  -- Tier C Configuration (premium models)
  ('C', 'stage_1_holding', 'gpt-5.2'),
  ('C', 'stage_2_adversarial', 'claude-opus-4-5-20250101'),
  ('C', 'dicta_detection', 'claude-sonnet-4-5-20250929'),
  ('C', 'bad_law_analysis', 'claude-sonnet-4-5-20250929'),
  ('C', 'drafting', 'claude-opus-4-5-20250101'),
  ('C', 'judge_simulation', 'claude-opus-4-5-20250101')
ON CONFLICT (tier, task_type) DO UPDATE SET
  model_string = EXCLUDED.model_string,
  updated_at = NOW();

-- RLS for model_routing_config
ALTER TABLE model_routing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to model_routing_config"
  ON model_routing_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins can manage model_routing_config"
  ON model_routing_config FOR ALL
  USING (public.is_admin());

CREATE POLICY "Public read access to active model_routing_config"
  ON model_routing_config FOR SELECT
  USING (is_active = true);

COMMENT ON TABLE model_routing_config IS 'AI model routing configuration per tier and task type';


-- ============================================================================
-- TASK 27: CREATE VERIFIED_CITATIONS TABLE (VPI - Verified Precedent Index)
-- Source: CIV Spec Section 11, Code Mode Spec Section 24
-- Purpose: Cache of verified citations for faster lookup
-- ============================================================================

CREATE TABLE IF NOT EXISTS verified_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_string TEXT NOT NULL,
  normalized_citation TEXT UNIQUE,
  case_name TEXT,
  volume VARCHAR(20),
  reporter VARCHAR(50),
  starting_page VARCHAR(20),
  court VARCHAR(100),
  decision_date DATE,
  year INTEGER,
  courtlistener_id TEXT,
  courtlistener_url TEXT,
  is_published BOOLEAN DEFAULT true,
  opinion_text_excerpt TEXT,
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  verification_count INTEGER DEFAULT 1,
  confidence_score DECIMAL(5,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for verified_citations
CREATE INDEX IF NOT EXISTS idx_verified_normalized ON verified_citations(normalized_citation);
CREATE INDEX IF NOT EXISTS idx_verified_court ON verified_citations(court);
CREATE INDEX IF NOT EXISTS idx_verified_year ON verified_citations(year);
CREATE INDEX IF NOT EXISTS idx_verified_courtlistener ON verified_citations(courtlistener_id);
CREATE INDEX IF NOT EXISTS idx_verified_case_name ON verified_citations(case_name);
CREATE INDEX IF NOT EXISTS idx_verified_last_verified ON verified_citations(last_verified_at);

-- Updated timestamp trigger for verified_citations
DROP TRIGGER IF EXISTS update_verified_citations_timestamp ON verified_citations;
CREATE TRIGGER update_verified_citations_timestamp
  BEFORE UPDATE ON verified_citations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for verified_citations
ALTER TABLE verified_citations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to verified_citations"
  ON verified_citations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Public read access to verified_citations"
  ON verified_citations FOR SELECT
  USING (true);

COMMENT ON TABLE verified_citations IS 'Verified Precedent Index (VPI) - cached verified citations for faster lookup';


-- ============================================================================
-- TASK 28: CREATE CITATION_RELATIONSHIPS TABLE (Citation Graph)
-- Source: CIV Spec Section 12, Code Mode Spec Section 28
-- Purpose: Track how cases cite and treat other cases
-- ============================================================================

CREATE TABLE IF NOT EXISTS citation_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citing_case_id UUID REFERENCES verified_citations(id) ON DELETE CASCADE,
  cited_case_id UUID REFERENCES verified_citations(id) ON DELETE CASCADE,
  treatment_type VARCHAR(20) NOT NULL CHECK (treatment_type IN ('FOLLOWED', 'DISTINGUISHED', 'OVERRULED', 'CITED', 'CRITICIZED')),
  treatment_strength VARCHAR(20) CHECK (treatment_strength IN ('STRONG', 'MODERATE', 'WEAK')),
  paragraph_context TEXT,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for citation_relationships
CREATE INDEX IF NOT EXISTS idx_citation_rel_citing ON citation_relationships(citing_case_id);
CREATE INDEX IF NOT EXISTS idx_citation_rel_cited ON citation_relationships(cited_case_id);
CREATE INDEX IF NOT EXISTS idx_citation_rel_treatment ON citation_relationships(treatment_type);
CREATE INDEX IF NOT EXISTS idx_citation_rel_strength ON citation_relationships(treatment_strength);

-- Composite index for relationship lookups
CREATE INDEX IF NOT EXISTS idx_citation_rel_pair ON citation_relationships(citing_case_id, cited_case_id);

-- RLS for citation_relationships
ALTER TABLE citation_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to citation_relationships"
  ON citation_relationships FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Public read access to citation_relationships"
  ON citation_relationships FOR SELECT
  USING (true);

COMMENT ON TABLE citation_relationships IS 'Citation graph database tracking case relationships and treatment';


-- ============================================================================
-- TASK 29: ADD DATA RETENTION COLUMNS TO ORDERS TABLE
-- Source: DATA_RETENTION_IMPLEMENTATION_SPEC_v1.md
-- Purpose: Track data retention lifecycle
-- ============================================================================

-- Note: deleted_at column already exists from migration 014_legal_compliance_fixes.sql
-- Adding remaining retention columns

ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_extended_by_customer BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_extension_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS max_retention_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reminder_sent BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reminder_sent_at TIMESTAMPTZ;
-- deleted_at already exists, skip
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_type VARCHAR(20);

-- Indexes for retention columns
CREATE INDEX IF NOT EXISTS idx_orders_retention ON orders(retention_expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deletion_reminder ON orders(deletion_reminder_sent, retention_expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_retention_extended ON orders(retention_extended_by_customer) WHERE retention_extended_by_customer = true;

-- Function to calculate initial retention date (90 days from order completion)
CREATE OR REPLACE FUNCTION calculate_retention_expiry()
RETURNS TRIGGER AS $$
BEGIN
  -- Set initial retention expiry to 90 days from completion
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.retention_expires_at := NOW() + INTERVAL '90 days';
    NEW.max_retention_date := NOW() + INTERVAL '180 days'; -- Maximum 180 days with extension
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic retention date calculation
DROP TRIGGER IF EXISTS set_retention_expiry ON orders;
CREATE TRIGGER set_retention_expiry
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION calculate_retention_expiry();

COMMENT ON COLUMN orders.retention_expires_at IS 'Date when order data will be automatically deleted (90 days default)';
COMMENT ON COLUMN orders.retention_extended_by_customer IS 'Whether customer requested extension of retention period';
COMMENT ON COLUMN orders.max_retention_date IS 'Maximum date data can be retained (180 days with extension)';
COMMENT ON COLUMN orders.deletion_reminder_sent IS 'Whether 14-day deletion reminder has been sent';
COMMENT ON COLUMN orders.deletion_type IS 'Type of deletion: auto, manual, customer_request';


-- ============================================================================
-- TASK 30: CREATE ANONYMIZED_ANALYTICS TABLE
-- Source: DATA_RETENTION_IMPLEMENTATION_SPEC_v1.md
-- Purpose: Persisted analytics after order deletion
-- ============================================================================

CREATE TABLE IF NOT EXISTS anonymized_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date DATE NOT NULL,
  jurisdiction VARCHAR(50),
  motion_type VARCHAR(100),
  tier VARCHAR(10),
  price_cents INTEGER,
  rush_fee_cents INTEGER DEFAULT 0,
  revision_count INTEGER DEFAULT 0,
  total_citations INTEGER,
  flagged_citations INTEGER,
  verified_citations INTEGER,
  verification_time_ms INTEGER,
  judge_simulation_grade VARCHAR(5),
  delivery_time_hours DECIMAL(10,2),
  customer_satisfaction_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for anonymized_analytics
CREATE INDEX IF NOT EXISTS idx_analytics_date ON anonymized_analytics(order_date);
CREATE INDEX IF NOT EXISTS idx_analytics_jurisdiction ON anonymized_analytics(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_analytics_tier ON anonymized_analytics(tier);
CREATE INDEX IF NOT EXISTS idx_analytics_motion_type ON anonymized_analytics(motion_type);
CREATE INDEX IF NOT EXISTS idx_analytics_grade ON anonymized_analytics(judge_simulation_grade);

-- Composite indexes for common analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_date_tier ON anonymized_analytics(order_date, tier);
CREATE INDEX IF NOT EXISTS idx_analytics_jurisdiction_motion ON anonymized_analytics(jurisdiction, motion_type);

-- RLS for anonymized_analytics
ALTER TABLE anonymized_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to anonymized_analytics"
  ON anonymized_analytics FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins can read anonymized_analytics"
  ON anonymized_analytics FOR SELECT
  USING (public.is_admin());

COMMENT ON TABLE anonymized_analytics IS 'Anonymized analytics data persisted after order deletion for business insights';


-- ============================================================================
-- TASK 31: CREATE REFUNDS TABLE
-- Source: Gap Analysis A-4
-- Purpose: Track refund requests and processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  reason VARCHAR(100),
  refund_type VARCHAR(20) NOT NULL CHECK (refund_type IN ('FULL', 'PARTIAL')),
  stripe_refund_id TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  -- Additional fields for audit trail
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  notes TEXT
);

-- Indexes for refunds
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe ON refunds(stripe_refund_id);

-- RLS for refunds
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to refunds"
  ON refunds FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins can manage refunds"
  ON refunds FOR ALL
  USING (public.is_admin());

CREATE POLICY "Users can view their own refunds"
  ON refunds FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

COMMENT ON TABLE refunds IS 'Refund tracking for order payments processed through Stripe';


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to anonymize and archive order data before deletion
CREATE OR REPLACE FUNCTION anonymize_order_data(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_order RECORD;
  v_analytics_id UUID;
BEGIN
  -- Get order data
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Insert anonymized analytics record
  INSERT INTO anonymized_analytics (
    order_date,
    jurisdiction,
    motion_type,
    tier,
    price_cents,
    rush_fee_cents,
    revision_count
  ) VALUES (
    v_order.created_at::DATE,
    v_order.jurisdiction,
    v_order.motion_type,
    v_order.motion_tier::TEXT,
    (v_order.total_price * 100)::INTEGER,
    COALESCE((v_order.rush_surcharge * 100)::INTEGER, 0),
    COALESCE(v_order.revision_count, 0)
  ) RETURNING id INTO v_analytics_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if citation is overruled
CREATE OR REPLACE FUNCTION is_citation_overruled(p_normalized_citation TEXT)
RETURNS TABLE (
  is_overruled BOOLEAN,
  overruled_by TEXT,
  overruled_date DATE,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE AS is_overruled,
    oc.overruled_by,
    oc.overruled_date,
    oc.notes
  FROM overruled_cases oc
  WHERE oc.normalized_citation = p_normalized_citation;

  -- If no rows found, return not overruled
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::DATE, NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get model for tier and task
CREATE OR REPLACE FUNCTION get_model_for_task(p_tier VARCHAR, p_task_type VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_model VARCHAR;
BEGIN
  SELECT model_string INTO v_model
  FROM model_routing_config
  WHERE tier = p_tier
    AND task_type = p_task_type
    AND is_active = TRUE;

  RETURN v_model;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to authenticated users where appropriate
GRANT SELECT ON overruled_cases TO authenticated;
GRANT SELECT ON verified_citations TO authenticated;
GRANT SELECT ON citation_relationships TO authenticated;
GRANT SELECT ON model_routing_config TO authenticated;

-- Service role has full access via RLS policies


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Tables Created: overruled_cases, citation_verification_log, model_routing_config,
--                 verified_citations, citation_relationships, anonymized_analytics, refunds
-- Tables Modified: orders (retention columns)
-- Seed Data: overruled_cases (8 records), model_routing_config (16 records)
-- ============================================================================
