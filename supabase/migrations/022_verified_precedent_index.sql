-- ============================================================================
-- VERIFIED PRECEDENT INDEX (VPI) DATABASE SCHEMA
-- Motion Granted Citation Integrity Verification Infrastructure
-- Version: 1.0 | January 25, 2026
-- ============================================================================

-- Enable UUID generation (should already exist, but safe to add)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLE 1: verified_citations
-- The case record - each unique citation we've ever verified
-- ============================================================================
CREATE TABLE IF NOT EXISTS verified_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Citation identification
    citation_string TEXT NOT NULL,
    normalized_citation TEXT NOT NULL UNIQUE,

    -- Case metadata
    case_name TEXT NOT NULL,
    volume INTEGER,
    reporter VARCHAR(50),
    starting_page INTEGER,
    court VARCHAR(100),
    decision_date DATE,
    year INTEGER,

    -- External references
    courtlistener_id TEXT,
    courtlistener_url TEXT,
    caselaw_id TEXT,
    caselaw_url TEXT,

    -- Publication status
    is_published BOOLEAN DEFAULT TRUE,
    precedential_status VARCHAR(50),

    -- Usage tracking
    times_verified INTEGER DEFAULT 1,
    first_verified_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verified_citations_normalized ON verified_citations(normalized_citation);
CREATE INDEX IF NOT EXISTS idx_verified_citations_courtlistener ON verified_citations(courtlistener_id);
CREATE INDEX IF NOT EXISTS idx_verified_citations_court ON verified_citations(court);
CREATE INDEX IF NOT EXISTS idx_verified_citations_year ON verified_citations(year);

-- ============================================================================
-- TABLE 2: proposition_verifications
-- THE MONEY TABLE - every proposition-to-case verification result
-- ============================================================================
CREATE TABLE IF NOT EXISTS proposition_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citation_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,

    -- Proposition data
    proposition_text TEXT NOT NULL,
    proposition_hash TEXT NOT NULL,
    proposition_type VARCHAR(30) NOT NULL CHECK (proposition_type IN ('PRIMARY_STANDARD', 'REQUIRED_ELEMENT', 'SECONDARY', 'CONTEXT')),

    -- Context
    jurisdiction_context VARCHAR(50),
    motion_type_context VARCHAR(50),

    -- Verification result
    verification_result VARCHAR(20) NOT NULL CHECK (verification_result IN ('VERIFIED', 'PARTIAL', 'REJECTED', 'DICTA_ONLY', 'FLAGGED')),
    confidence_score DECIMAL(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),

    -- Holding analysis
    holding_vs_dicta VARCHAR(20) CHECK (holding_vs_dicta IN ('HOLDING', 'DICTA', 'UNCLEAR')),
    supporting_quote TEXT,
    reasoning TEXT,

    -- Stage tracking
    stage_1_result VARCHAR(20),
    stage_1_confidence DECIMAL(4,3),
    stage_2_triggered BOOLEAN DEFAULT FALSE,
    stage_2_result VARCHAR(20),
    stage_2_confidence DECIMAL(4,3),

    -- AI tracking
    ai_model_used VARCHAR(50),
    ai_model_version VARCHAR(50),
    verification_method VARCHAR(30),

    -- Source tracking (anonymized)
    source_order_id UUID,

    -- Timestamps
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prop_verifications_citation ON proposition_verifications(citation_id);
CREATE INDEX IF NOT EXISTS idx_prop_verifications_hash ON proposition_verifications(proposition_hash);
CREATE INDEX IF NOT EXISTS idx_prop_verifications_jurisdiction ON proposition_verifications(jurisdiction_context);
CREATE INDEX IF NOT EXISTS idx_prop_verifications_result ON proposition_verifications(verification_result);

-- ============================================================================
-- TABLE 3: good_law_checks
-- Treatment history - bad law detection results
-- ============================================================================
CREATE TABLE IF NOT EXISTS good_law_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citation_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,

    -- Check timestamp
    check_date TIMESTAMPTZ DEFAULT NOW(),

    -- Composite status
    status VARCHAR(30) NOT NULL CHECK (status IN ('GOOD_LAW', 'CAUTION', 'NEGATIVE_TREATMENT', 'OVERRULED')),
    confidence DECIMAL(4,3),

    -- Layer 1: CourtListener
    layer_1_treatment VARCHAR(50),
    layer_1_raw_response JSONB,

    -- Layer 2: AI pattern detection
    layer_2_status VARCHAR(30),
    layer_2_confidence DECIMAL(4,3),
    layer_2_concerns TEXT[],

    -- Layer 3: Curated list
    layer_3_in_list BOOLEAN DEFAULT FALSE,
    layer_3_overruled_by TEXT,

    -- Validity
    valid_until TIMESTAMPTZ,

    -- If overruled
    overruled_by_citation TEXT,
    overruled_date DATE,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_good_law_citation ON good_law_checks(citation_id);
CREATE INDEX IF NOT EXISTS idx_good_law_valid_until ON good_law_checks(valid_until);
CREATE INDEX IF NOT EXISTS idx_good_law_status ON good_law_checks(status);

-- ============================================================================
-- TABLE 4: authority_strength_assessments
-- Strength metrics for each citation
-- ============================================================================
CREATE TABLE IF NOT EXISTS authority_strength_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citation_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,

    -- Assessment date
    assessed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metrics
    case_age_years INTEGER,
    total_citations INTEGER,
    citations_last_5_years INTEGER,
    citations_last_10_years INTEGER,
    citation_trend VARCHAR(20) CHECK (citation_trend IN ('STABLE', 'INCREASING', 'DECLINING')),
    distinguish_count INTEGER,
    distinguish_rate DECIMAL(4,3),
    criticism_count INTEGER,

    -- Classification
    stability_class VARCHAR(20) CHECK (stability_class IN ('LANDMARK', 'ESTABLISHED', 'RECENT', 'DECLINING', 'CONTROVERSIAL')),
    strength_score INTEGER CHECK (strength_score >= 0 AND strength_score <= 100),
    assessment VARCHAR(20) CHECK (assessment IN ('STRONG', 'MODERATE', 'WEAK')),

    -- Notes
    notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strength_citation ON authority_strength_assessments(citation_id);
CREATE INDEX IF NOT EXISTS idx_strength_class ON authority_strength_assessments(stability_class);

-- ============================================================================
-- TABLE 5: citation_relationships
-- How cases cite each other - builds network effects
-- ============================================================================
CREATE TABLE IF NOT EXISTS citation_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationship
    citing_case_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,
    cited_case_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,

    -- Treatment
    treatment_type VARCHAR(30) NOT NULL CHECK (treatment_type IN ('CITED', 'FOLLOWED', 'DISTINGUISHED', 'CRITICIZED', 'OVERRULED', 'QUESTIONED')),
    treatment_strength VARCHAR(20),

    -- Context
    paragraph_context TEXT,
    headnote_reference TEXT,

    -- Extraction metadata
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    extraction_method VARCHAR(30),
    confidence DECIMAL(4,3),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicates
    UNIQUE(citing_case_id, cited_case_id, treatment_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_citing ON citation_relationships(citing_case_id);
CREATE INDEX IF NOT EXISTS idx_relationships_cited ON citation_relationships(cited_case_id);
CREATE INDEX IF NOT EXISTS idx_relationships_treatment ON citation_relationships(treatment_type);

-- ============================================================================
-- TABLE 6: civ_verification_runs
-- Complete verification audit trail per order
-- ============================================================================
CREATE TABLE IF NOT EXISTS civ_verification_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,

    -- Run metadata
    run_phase VARCHAR(10) NOT NULL CHECK (run_phase IN ('V.1', 'VII.1')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Counts
    total_citations INTEGER DEFAULT 0,
    verified_count INTEGER DEFAULT 0,
    flagged_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,

    -- Aggregate metrics
    average_confidence DECIMAL(4,3),
    total_api_calls INTEGER DEFAULT 0,
    total_cost_estimate DECIMAL(10,4),

    -- Status
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'partial')),
    error_message TEXT,

    -- Results
    results JSONB,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_civ_runs_order ON civ_verification_runs(order_id);
CREATE INDEX IF NOT EXISTS idx_civ_runs_status ON civ_verification_runs(status);

-- ============================================================================
-- TABLE 7: curated_overruled_cases
-- Manually maintained list of commonly cited overruled cases
-- ============================================================================
CREATE TABLE IF NOT EXISTS curated_overruled_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Case identification
    citation TEXT NOT NULL UNIQUE,
    case_name TEXT NOT NULL,

    -- Overruling info
    overruled_by_citation TEXT NOT NULL,
    overruled_by_case_name TEXT,
    overruled_date DATE,

    -- Context
    area_of_law VARCHAR(100),
    notes TEXT,

    -- Metadata
    added_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overruled_citation ON curated_overruled_cases(citation);

-- ============================================================================
-- TABLE 8: civ_cache_hits
-- Track cache hit analytics for VPI optimization
-- ============================================================================
CREATE TABLE IF NOT EXISTS civ_cache_hits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposition_verification_id UUID REFERENCES proposition_verifications(id) ON DELETE SET NULL,
    order_id UUID,

    -- Hit metadata
    hit_at TIMESTAMPTZ DEFAULT NOW(),
    original_verification_date TIMESTAMPTZ,

    -- Value
    tokens_saved_estimate INTEGER,
    cost_saved_estimate DECIMAL(10,4)
);

CREATE INDEX IF NOT EXISTS idx_cache_hits_order ON civ_cache_hits(order_id);
CREATE INDEX IF NOT EXISTS idx_cache_hits_date ON civ_cache_hits(hit_at);

-- ============================================================================
-- SEED DATA: Commonly cited overruled cases
-- ============================================================================
INSERT INTO curated_overruled_cases (citation, case_name, overruled_by_citation, overruled_by_case_name, notes, area_of_law)
VALUES
    ('Lochner v. New York, 198 U.S. 45 (1905)', 'Lochner v. New York', 'West Coast Hotel Co. v. Parrish, 300 U.S. 379 (1937)', 'West Coast Hotel Co. v. Parrish', 'Economic substantive due process rejected', 'Constitutional Law'),
    ('Plessy v. Ferguson, 163 U.S. 537 (1896)', 'Plessy v. Ferguson', 'Brown v. Board of Education, 347 U.S. 483 (1954)', 'Brown v. Board of Education', 'Separate but equal doctrine overruled', 'Civil Rights'),
    ('Bowers v. Hardwick, 478 U.S. 186 (1986)', 'Bowers v. Hardwick', 'Lawrence v. Texas, 539 U.S. 558 (2003)', 'Lawrence v. Texas', 'Sodomy laws unconstitutional', 'Constitutional Law'),
    ('Austin v. Michigan Chamber of Commerce, 494 U.S. 652 (1990)', 'Austin v. Michigan Chamber of Commerce', 'Citizens United v. FEC, 558 U.S. 310 (2010)', 'Citizens United v. FEC', 'Corporate speech restrictions overruled', 'First Amendment'),
    ('Abood v. Detroit Board of Education, 431 U.S. 209 (1977)', 'Abood v. Detroit Board of Education', 'Janus v. AFSCME, 585 U.S. ___ (2018)', 'Janus v. AFSCME', 'Public sector union fees', 'Labor Law')
ON CONFLICT (citation) DO NOTHING;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE verified_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposition_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE good_law_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_strength_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE civ_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE curated_overruled_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE civ_cache_hits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES (Service role has full access, public read for cache)
-- ============================================================================

-- verified_citations: Read access for all authenticated, write for service role
CREATE POLICY "verified_citations_read" ON verified_citations FOR SELECT TO authenticated USING (true);
CREATE POLICY "verified_citations_service" ON verified_citations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- proposition_verifications: Read access for all authenticated, write for service role
CREATE POLICY "prop_verifications_read" ON proposition_verifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "prop_verifications_service" ON proposition_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- good_law_checks: Read access for all authenticated, write for service role
CREATE POLICY "good_law_read" ON good_law_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "good_law_service" ON good_law_checks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authority_strength_assessments: Read access for all authenticated, write for service role
CREATE POLICY "strength_read" ON authority_strength_assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "strength_service" ON authority_strength_assessments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- citation_relationships: Read access for all authenticated, write for service role
CREATE POLICY "relationships_read" ON citation_relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "relationships_service" ON citation_relationships FOR ALL TO service_role USING (true) WITH CHECK (true);

-- civ_verification_runs: Admin/clerk access only
CREATE POLICY "civ_runs_admin" ON civ_verification_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- curated_overruled_cases: Read access for all authenticated, write for service role
CREATE POLICY "overruled_read" ON curated_overruled_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "overruled_service" ON curated_overruled_cases FOR ALL TO service_role USING (true) WITH CHECK (true);

-- civ_cache_hits: Service role only (internal analytics)
CREATE POLICY "cache_hits_service" ON civ_cache_hits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- FUNCTION: Hash proposition text for cache lookup
-- ============================================================================
CREATE OR REPLACE FUNCTION hash_proposition(proposition_text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(sha256(lower(trim(proposition_text))::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNCTION: Normalize citation string
-- ============================================================================
CREATE OR REPLACE FUNCTION normalize_citation(citation_text TEXT)
RETURNS TEXT AS $$
DECLARE
    normalized TEXT;
BEGIN
    -- Remove extra whitespace
    normalized := regexp_replace(citation_text, '\s+', ' ', 'g');
    -- Trim
    normalized := trim(normalized);
    -- Standardize vs./vs to v.
    normalized := regexp_replace(normalized, '\s+vs\.?\s+', ' v. ', 'gi');
    -- Standardize reporter spacing (F. 3d -> F.3d)
    normalized := regexp_replace(normalized, '(\w)\.\s+(\d)', '\1.\2', 'g');

    RETURN normalized;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNCTION: Check VPI cache for proposition
-- ============================================================================
CREATE OR REPLACE FUNCTION check_vpi_cache(
    p_proposition_text TEXT,
    p_jurisdiction_context VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    cached_result VARCHAR(20),
    cached_confidence DECIMAL(4,3),
    citation_string TEXT,
    supporting_quote TEXT,
    reasoning TEXT,
    verification_id UUID
) AS $$
DECLARE
    prop_hash TEXT;
BEGIN
    prop_hash := hash_proposition(p_proposition_text);

    RETURN QUERY
    SELECT
        pv.verification_result,
        pv.confidence_score,
        vc.citation_string,
        pv.supporting_quote,
        pv.reasoning,
        pv.id
    FROM proposition_verifications pv
    JOIN verified_citations vc ON pv.citation_id = vc.id
    WHERE pv.proposition_hash = prop_hash
        AND pv.confidence_score >= 0.85
        AND (p_jurisdiction_context IS NULL OR pv.jurisdiction_context = p_jurisdiction_context)
    ORDER BY pv.verified_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- TRIGGER: Update timestamps on verified_citations
-- ============================================================================
CREATE OR REPLACE FUNCTION update_verified_citation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verified_citations_updated_at
    BEFORE UPDATE ON verified_citations
    FOR EACH ROW
    EXECUTE FUNCTION update_verified_citation_timestamp();

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE verified_citations IS 'Unique citation records in the Verified Precedent Index (VPI). Each row represents a single legal case that has been verified.';
COMMENT ON TABLE proposition_verifications IS 'The core VPI table - records every proposition-to-case verification result with confidence scores and reasoning.';
COMMENT ON TABLE good_law_checks IS 'Three-layer bad law check results: CourtListener treatment, AI pattern detection, and curated list matches.';
COMMENT ON TABLE authority_strength_assessments IS 'Citation metrics and stability classification for determining authority strength.';
COMMENT ON TABLE citation_relationships IS 'Graph of how cases cite each other, enabling network-effect analysis.';
COMMENT ON TABLE civ_verification_runs IS 'Audit trail of complete CIV verification runs per order, tracking Phase V.1 and VII.1 executions.';
COMMENT ON TABLE curated_overruled_cases IS 'Manually maintained list of commonly cited cases that have been overruled.';
COMMENT ON TABLE civ_cache_hits IS 'Analytics table tracking VPI cache hit rates and cost savings.';
