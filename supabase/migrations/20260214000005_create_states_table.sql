-- ============================================
-- MOTION GRANTED: 50-State Configuration Table
-- Migration: 20260214_create_states_table.sql
-- ============================================

-- Create the states table
CREATE TABLE IF NOT EXISTS states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(2) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    state_courts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    federal_circuits TEXT[] NOT NULL DEFAULT '{}',
    federal_districts TEXT[] NOT NULL DEFAULT '{}',
    pricing_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    formatting_profile VARCHAR(20) NOT NULL DEFAULT 'standard',
    motion_availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_states_code ON states (code);
CREATE INDEX idx_states_enabled ON states (enabled);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_states_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER states_updated_at
    BEFORE UPDATE ON states
    FOR EACH ROW
    EXECUTE FUNCTION update_states_timestamp();

-- ============================================
-- RLS POLICIES (using existing is_admin() helper)
-- ============================================
ALTER TABLE states ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ: Anyone can read enabled states (for intake form dropdown)
CREATE POLICY "Public can view enabled states"
    ON states FOR SELECT
    USING (enabled = true);

-- ADMIN READ: Admins see ALL states (including disabled)
CREATE POLICY "Admin can view all states"
    ON states FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- ADMIN UPDATE: Admins can update state configuration
CREATE POLICY "Admin can update states"
    ON states FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================
-- SEED: All 50 States + DC
-- Only LA and CA enabled at launch
-- ============================================
INSERT INTO states (code, name, enabled, state_courts_enabled, federal_circuits, federal_districts, pricing_multiplier, formatting_profile, motion_availability, notes)
VALUES
-- *** LAUNCH STATES (ENABLED) ***
('LA', 'Louisiana', TRUE, TRUE,
    ARRAY['5th'], ARRAY['E.D. La.', 'M.D. La.', 'W.D. La.'],
    1.00, 'louisiana',
    '{"state_specific": ["exception_no_cause", "exception_prescription", "exception_no_right_of_action", "exception_vagueness", "exception_lis_pendens", "exception_nonjoinder"]}'::jsonb,
    'Base pricing state. Civil law jurisdiction.'),

('CA', 'California', TRUE, TRUE,
    ARRAY['9th'], ARRAY['N.D. Cal.', 'C.D. Cal.', 'S.D. Cal.', 'E.D. Cal.'],
    1.20, 'california',
    '{"state_specific": ["demurrer", "anti_slapp", "motion_to_quash_service"]}'::jsonb,
    '1.20x pricing multiplier. Line numbering required.'),

-- *** PRE-CONFIGURED (DISABLED) ***
('TX', 'Texas', FALSE, FALSE,
    ARRAY['5th'], ARRAY['N.D. Tex.', 'S.D. Tex.', 'E.D. Tex.', 'W.D. Tex.'],
    1.00, 'standard', '{}'::jsonb, 'Federal-only ready. State courts pending.'),

('AL', 'Alabama', FALSE, FALSE, ARRAY['11th'], ARRAY['N.D. Ala.', 'M.D. Ala.', 'S.D. Ala.'], 1.00, 'standard', '{}'::jsonb, NULL),
('AK', 'Alaska', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Alaska'], 1.00, 'standard', '{}'::jsonb, NULL),
('AZ', 'Arizona', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Ariz.'], 1.00, 'standard', '{}'::jsonb, NULL),
('AR', 'Arkansas', FALSE, FALSE, ARRAY['8th'], ARRAY['E.D. Ark.', 'W.D. Ark.'], 1.00, 'standard', '{}'::jsonb, NULL),
('CO', 'Colorado', FALSE, FALSE, ARRAY['10th'], ARRAY['D. Colo.'], 1.00, 'standard', '{}'::jsonb, NULL),
('CT', 'Connecticut', FALSE, FALSE, ARRAY['2nd'], ARRAY['D. Conn.'], 1.00, 'standard', '{}'::jsonb, NULL),
('DE', 'Delaware', FALSE, FALSE, ARRAY['3rd'], ARRAY['D. Del.'], 1.00, 'standard', '{}'::jsonb, NULL),
('FL', 'Florida', FALSE, FALSE, ARRAY['11th'], ARRAY['N.D. Fla.', 'M.D. Fla.', 'S.D. Fla.'], 1.00, 'standard', '{}'::jsonb, NULL),
('GA', 'Georgia', FALSE, FALSE, ARRAY['11th'], ARRAY['N.D. Ga.', 'M.D. Ga.', 'S.D. Ga.'], 1.00, 'standard', '{}'::jsonb, NULL),
('HI', 'Hawaii', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Haw.'], 1.00, 'standard', '{}'::jsonb, NULL),
('ID', 'Idaho', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Idaho'], 1.00, 'standard', '{}'::jsonb, NULL),
('IL', 'Illinois', FALSE, FALSE, ARRAY['7th'], ARRAY['N.D. Ill.', 'C.D. Ill.', 'S.D. Ill.'], 1.00, 'standard', '{}'::jsonb, NULL),
('IN', 'Indiana', FALSE, FALSE, ARRAY['7th'], ARRAY['N.D. Ind.', 'S.D. Ind.'], 1.00, 'standard', '{}'::jsonb, NULL),
('IA', 'Iowa', FALSE, FALSE, ARRAY['8th'], ARRAY['N.D. Iowa', 'S.D. Iowa'], 1.00, 'standard', '{}'::jsonb, NULL),
('KS', 'Kansas', FALSE, FALSE, ARRAY['10th'], ARRAY['D. Kan.'], 1.00, 'standard', '{}'::jsonb, NULL),
('KY', 'Kentucky', FALSE, FALSE, ARRAY['6th'], ARRAY['E.D. Ky.', 'W.D. Ky.'], 1.00, 'standard', '{}'::jsonb, NULL),
('ME', 'Maine', FALSE, FALSE, ARRAY['1st'], ARRAY['D. Me.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MD', 'Maryland', FALSE, FALSE, ARRAY['4th'], ARRAY['D. Md.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MA', 'Massachusetts', FALSE, FALSE, ARRAY['1st'], ARRAY['D. Mass.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MI', 'Michigan', FALSE, FALSE, ARRAY['6th'], ARRAY['E.D. Mich.', 'W.D. Mich.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MN', 'Minnesota', FALSE, FALSE, ARRAY['8th'], ARRAY['D. Minn.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MS', 'Mississippi', FALSE, FALSE, ARRAY['5th'], ARRAY['N.D. Miss.', 'S.D. Miss.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MO', 'Missouri', FALSE, FALSE, ARRAY['8th'], ARRAY['E.D. Mo.', 'W.D. Mo.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MT', 'Montana', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Mont.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NE', 'Nebraska', FALSE, FALSE, ARRAY['8th'], ARRAY['D. Neb.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NV', 'Nevada', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Nev.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NH', 'New Hampshire', FALSE, FALSE, ARRAY['1st'], ARRAY['D.N.H.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NJ', 'New Jersey', FALSE, FALSE, ARRAY['3rd'], ARRAY['D.N.J.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NM', 'New Mexico', FALSE, FALSE, ARRAY['10th'], ARRAY['D.N.M.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NY', 'New York', FALSE, FALSE, ARRAY['2nd'], ARRAY['N.D.N.Y.', 'S.D.N.Y.', 'E.D.N.Y.', 'W.D.N.Y.'], 1.15, 'standard', '{}'::jsonb, 'Premium market.'),
('NC', 'North Carolina', FALSE, FALSE, ARRAY['4th'], ARRAY['E.D.N.C.', 'M.D.N.C.', 'W.D.N.C.'], 1.00, 'standard', '{}'::jsonb, NULL),
('ND', 'North Dakota', FALSE, FALSE, ARRAY['8th'], ARRAY['D.N.D.'], 1.00, 'standard', '{}'::jsonb, NULL),
('OH', 'Ohio', FALSE, FALSE, ARRAY['6th'], ARRAY['N.D. Ohio', 'S.D. Ohio'], 1.00, 'standard', '{}'::jsonb, NULL),
('OK', 'Oklahoma', FALSE, FALSE, ARRAY['10th'], ARRAY['N.D. Okla.', 'E.D. Okla.', 'W.D. Okla.'], 1.00, 'standard', '{}'::jsonb, NULL),
('OR', 'Oregon', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Or.'], 1.00, 'standard', '{}'::jsonb, NULL),
('PA', 'Pennsylvania', FALSE, FALSE, ARRAY['3rd'], ARRAY['E.D. Pa.', 'M.D. Pa.', 'W.D. Pa.'], 1.00, 'standard', '{}'::jsonb, NULL),
('RI', 'Rhode Island', FALSE, FALSE, ARRAY['1st'], ARRAY['D.R.I.'], 1.00, 'standard', '{}'::jsonb, NULL),
('SC', 'South Carolina', FALSE, FALSE, ARRAY['4th'], ARRAY['D.S.C.'], 1.00, 'standard', '{}'::jsonb, NULL),
('SD', 'South Dakota', FALSE, FALSE, ARRAY['8th'], ARRAY['D.S.D.'], 1.00, 'standard', '{}'::jsonb, NULL),
('TN', 'Tennessee', FALSE, FALSE, ARRAY['6th'], ARRAY['E.D. Tenn.', 'M.D. Tenn.', 'W.D. Tenn.'], 1.00, 'standard', '{}'::jsonb, NULL),
('UT', 'Utah', FALSE, FALSE, ARRAY['10th'], ARRAY['D. Utah'], 1.00, 'standard', '{}'::jsonb, NULL),
('VT', 'Vermont', FALSE, FALSE, ARRAY['2nd'], ARRAY['D. Vt.'], 1.00, 'standard', '{}'::jsonb, NULL),
('VA', 'Virginia', FALSE, FALSE, ARRAY['4th'], ARRAY['E.D. Va.', 'W.D. Va.'], 1.00, 'standard', '{}'::jsonb, NULL),
('WA', 'Washington', FALSE, FALSE, ARRAY['9th'], ARRAY['E.D. Wash.', 'W.D. Wash.'], 1.00, 'standard', '{}'::jsonb, NULL),
('WV', 'West Virginia', FALSE, FALSE, ARRAY['4th'], ARRAY['N.D.W. Va.', 'S.D.W. Va.'], 1.00, 'standard', '{}'::jsonb, NULL),
('WI', 'Wisconsin', FALSE, FALSE, ARRAY['7th'], ARRAY['E.D. Wis.', 'W.D. Wis.'], 1.00, 'standard', '{}'::jsonb, NULL),
('WY', 'Wyoming', FALSE, FALSE, ARRAY['10th'], ARRAY['D. Wyo.'], 1.00, 'standard', '{}'::jsonb, NULL),
('DC', 'District of Columbia', FALSE, FALSE, ARRAY['D.C.'], ARRAY['D.D.C.'], 1.00, 'standard', '{}'::jsonb, 'Federal district.');
