-- ============================================
-- MOTION GRANTED: State Motion Availability Table
-- Migration: 20260215100002_create_state_motion_availability.sql
-- SP-C Task 3 | BD-7: Motion availability EXCLUSIVELY here
-- ============================================

CREATE TABLE IF NOT EXISTS state_motion_availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state_code CHAR(2) NOT NULL REFERENCES states(code) ON DELETE CASCADE,
  motion_type TEXT NOT NULL,
  court_type TEXT NOT NULL CHECK (court_type IN ('STATE', 'FEDERAL')),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(state_code, motion_type, court_type)
);

-- Indexes
CREATE INDEX idx_sma_state_code ON state_motion_availability(state_code);
CREATE INDEX idx_sma_court_type ON state_motion_availability(court_type);
CREATE INDEX idx_sma_enabled ON state_motion_availability(enabled) WHERE enabled = true;

-- RLS
ALTER TABLE state_motion_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view enabled motion availability"
  ON state_motion_availability FOR SELECT
  USING (enabled = true);

CREATE POLICY "Admin can manage motion availability"
  ON state_motion_availability FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================
-- SEED: CA motions (STATE + FEDERAL) - 42 universal + state-specific
-- ============================================

-- CA STATE: All universal motions + CA-specific
INSERT INTO state_motion_availability (state_code, motion_type, court_type) VALUES
  -- Tier A Universal (STATE)
  ('CA', 'motion-to-extend-deadline', 'STATE'),
  ('CA', 'motion-for-continuance', 'STATE'),
  ('CA', 'motion-to-withdraw-as-counsel', 'STATE'),
  ('CA', 'motion-for-leave-to-file', 'STATE'),
  ('CA', 'motion-to-appear-pro-hac-vice', 'STATE'),
  ('CA', 'motion-to-substitute-counsel', 'STATE'),
  ('CA', 'motion-to-consolidate', 'STATE'),
  ('CA', 'motion-to-sever', 'STATE'),
  ('CA', 'motion-for-default-judgment', 'STATE'),
  ('CA', 'motion-to-set-aside-default', 'STATE'),
  ('CA', 'motion-to-quash-service', 'STATE'),
  ('CA', 'motion-to-stay-proceedings', 'STATE'),
  ('CA', 'motion-to-seal-records', 'STATE'),
  ('CA', 'motion-for-protective-order-simple', 'STATE'),
  ('CA', 'motion-to-shorten-time', 'STATE'),
  ('CA', 'motion-for-service-by-publication', 'STATE'),
  ('CA', 'motion-for-leave-to-amend-simple', 'STATE'),
  ('CA', 'motion-to-strike-simple', 'STATE'),
  ('CA', 'ex-parte-application-routine', 'STATE'),
  ('CA', 'motion-to-relate-cases', 'STATE'),
  -- Tier B Universal (STATE)
  ('CA', 'motion-to-compel-discovery', 'STATE'),
  ('CA', 'motion-for-sanctions', 'STATE'),
  ('CA', 'motion-for-protective-order-complex', 'STATE'),
  ('CA', 'motion-to-quash-subpoena', 'STATE'),
  ('CA', 'motion-in-limine', 'STATE'),
  ('CA', 'motion-to-exclude-expert', 'STATE'),
  ('CA', 'motion-for-new-trial', 'STATE'),
  ('CA', 'motion-to-reconsider', 'STATE'),
  ('CA', 'motion-for-jnov', 'STATE'),
  ('CA', 'motion-to-vacate-judgment', 'STATE'),
  ('CA', 'motion-to-enforce-judgment', 'STATE'),
  ('CA', 'motion-for-contempt', 'STATE'),
  ('CA', 'motion-to-compel-arbitration', 'STATE'),
  ('CA', 'motion-for-leave-to-amend-complex', 'STATE'),
  ('CA', 'motion-to-strike-complex', 'STATE'),
  ('CA', 'motion-for-judgment-on-pleadings', 'STATE'),
  ('CA', 'motion-to-transfer-venue', 'STATE'),
  ('CA', 'motion-to-dismiss-simple', 'STATE'),
  ('CA', 'motion-for-attorneys-fees', 'STATE'),
  ('CA', 'motion-for-costs', 'STATE'),
  ('CA', 'motion-to-bifurcate', 'STATE'),
  ('CA', 'motion-to-intervene', 'STATE'),
  -- CA-Only (STATE)
  ('CA', 'demurrer-simple', 'STATE'),
  ('CA', 'motion-to-strike-ca-ccp-435', 'STATE'),
  ('CA', 'motion-for-judgment-on-pleadings-ca', 'STATE'),
  ('CA', 'demurrer-complex', 'STATE'),
  ('CA', 'anti-slapp-motion-simple', 'STATE'),
  ('CA', 'motion-for-complex-case-determination', 'STATE'),
  ('CA', 'anti-slapp-motion-complex', 'STATE'),
  -- Tier C/D Universal (STATE)
  ('CA', 'motion-for-writ-of-mandamus', 'STATE'),
  ('CA', 'motion-for-writ-of-prohibition', 'STATE'),
  ('CA', 'motion-for-writ-of-habeas-corpus', 'STATE'),
  ('CA', 'motion-for-interlocutory-appeal', 'STATE'),
  ('CA', 'motion-for-declaratory-judgment', 'STATE'),
  ('CA', 'motion-for-summary-judgment', 'STATE'),
  ('CA', 'motion-for-summary-adjudication', 'STATE'),
  ('CA', 'motion-for-partial-summary-judgment', 'STATE'),
  ('CA', 'motion-for-class-certification', 'STATE'),
  ('CA', 'motion-to-decertify-class', 'STATE'),
  ('CA', 'motion-for-preliminary-injunction', 'STATE'),
  ('CA', 'temporary-restraining-order', 'STATE'),
  ('CA', 'daubert-sargent-motion', 'STATE')
ON CONFLICT (state_code, motion_type, court_type) DO NOTHING;

-- CA FEDERAL: All universal + federal-only motions
INSERT INTO state_motion_availability (state_code, motion_type, court_type) VALUES
  -- Tier A Universal (FEDERAL)
  ('CA', 'motion-to-extend-deadline', 'FEDERAL'),
  ('CA', 'motion-for-continuance', 'FEDERAL'),
  ('CA', 'motion-to-withdraw-as-counsel', 'FEDERAL'),
  ('CA', 'motion-for-leave-to-file', 'FEDERAL'),
  ('CA', 'motion-to-appear-pro-hac-vice', 'FEDERAL'),
  ('CA', 'motion-to-substitute-counsel', 'FEDERAL'),
  ('CA', 'motion-to-consolidate', 'FEDERAL'),
  ('CA', 'motion-to-sever', 'FEDERAL'),
  ('CA', 'motion-for-default-judgment', 'FEDERAL'),
  ('CA', 'motion-to-set-aside-default', 'FEDERAL'),
  ('CA', 'motion-to-quash-service', 'FEDERAL'),
  ('CA', 'motion-to-stay-proceedings', 'FEDERAL'),
  ('CA', 'motion-to-seal-records', 'FEDERAL'),
  ('CA', 'motion-for-protective-order-simple', 'FEDERAL'),
  ('CA', 'motion-to-shorten-time', 'FEDERAL'),
  ('CA', 'motion-for-service-by-publication', 'FEDERAL'),
  ('CA', 'motion-for-leave-to-amend-simple', 'FEDERAL'),
  ('CA', 'motion-to-strike-simple', 'FEDERAL'),
  ('CA', 'ex-parte-application-routine', 'FEDERAL'),
  ('CA', 'motion-to-relate-cases', 'FEDERAL'),
  -- Tier B Universal (FEDERAL)
  ('CA', 'motion-to-compel-discovery', 'FEDERAL'),
  ('CA', 'motion-for-sanctions', 'FEDERAL'),
  ('CA', 'motion-for-protective-order-complex', 'FEDERAL'),
  ('CA', 'motion-to-quash-subpoena', 'FEDERAL'),
  ('CA', 'motion-in-limine', 'FEDERAL'),
  ('CA', 'motion-to-exclude-expert', 'FEDERAL'),
  ('CA', 'motion-for-new-trial', 'FEDERAL'),
  ('CA', 'motion-to-reconsider', 'FEDERAL'),
  ('CA', 'motion-for-jnov', 'FEDERAL'),
  ('CA', 'motion-to-vacate-judgment', 'FEDERAL'),
  ('CA', 'motion-to-enforce-judgment', 'FEDERAL'),
  ('CA', 'motion-for-contempt', 'FEDERAL'),
  ('CA', 'motion-to-compel-arbitration', 'FEDERAL'),
  ('CA', 'motion-for-leave-to-amend-complex', 'FEDERAL'),
  ('CA', 'motion-to-strike-complex', 'FEDERAL'),
  ('CA', 'motion-for-judgment-on-pleadings', 'FEDERAL'),
  ('CA', 'motion-to-transfer-venue', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-simple', 'FEDERAL'),
  ('CA', 'motion-for-attorneys-fees', 'FEDERAL'),
  ('CA', 'motion-for-costs', 'FEDERAL'),
  ('CA', 'motion-to-bifurcate', 'FEDERAL'),
  ('CA', 'motion-to-intervene', 'FEDERAL'),
  ('CA', 'motion-for-summary-judgment-partial', 'FEDERAL'),
  -- Federal-Only (FEDERAL)
  ('CA', 'motion-to-dismiss-12b1', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b2', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b3', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b4', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b5', 'FEDERAL'),
  ('CA', 'motion-to-remand', 'FEDERAL'),
  ('CA', 'motion-for-abstention', 'FEDERAL'),
  ('CA', 'motion-for-more-definite-statement', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b6-complex', 'FEDERAL'),
  -- Tier C/D Universal (FEDERAL)
  ('CA', 'motion-for-writ-of-mandamus', 'FEDERAL'),
  ('CA', 'motion-for-writ-of-prohibition', 'FEDERAL'),
  ('CA', 'motion-for-writ-of-habeas-corpus', 'FEDERAL'),
  ('CA', 'motion-for-interlocutory-appeal', 'FEDERAL'),
  ('CA', 'motion-for-declaratory-judgment', 'FEDERAL'),
  ('CA', 'motion-for-summary-judgment', 'FEDERAL'),
  ('CA', 'motion-for-summary-adjudication', 'FEDERAL'),
  ('CA', 'motion-for-partial-summary-judgment', 'FEDERAL'),
  ('CA', 'motion-for-class-certification', 'FEDERAL'),
  ('CA', 'motion-to-decertify-class', 'FEDERAL'),
  ('CA', 'motion-for-preliminary-injunction', 'FEDERAL'),
  ('CA', 'temporary-restraining-order', 'FEDERAL'),
  ('CA', 'daubert-sargent-motion', 'FEDERAL')
ON CONFLICT (state_code, motion_type, court_type) DO NOTHING;

-- ============================================
-- SEED: LA motions (STATE + FEDERAL)
-- ============================================

-- LA STATE: All universal + LA-specific
INSERT INTO state_motion_availability (state_code, motion_type, court_type) VALUES
  -- Tier A Universal (STATE)
  ('LA', 'motion-to-extend-deadline', 'STATE'),
  ('LA', 'motion-for-continuance', 'STATE'),
  ('LA', 'motion-to-withdraw-as-counsel', 'STATE'),
  ('LA', 'motion-for-leave-to-file', 'STATE'),
  ('LA', 'motion-to-appear-pro-hac-vice', 'STATE'),
  ('LA', 'motion-to-substitute-counsel', 'STATE'),
  ('LA', 'motion-to-consolidate', 'STATE'),
  ('LA', 'motion-to-sever', 'STATE'),
  ('LA', 'motion-for-default-judgment', 'STATE'),
  ('LA', 'motion-to-set-aside-default', 'STATE'),
  ('LA', 'motion-to-quash-service', 'STATE'),
  ('LA', 'motion-to-stay-proceedings', 'STATE'),
  ('LA', 'motion-to-seal-records', 'STATE'),
  ('LA', 'motion-for-protective-order-simple', 'STATE'),
  ('LA', 'motion-to-shorten-time', 'STATE'),
  ('LA', 'motion-for-service-by-publication', 'STATE'),
  ('LA', 'motion-for-leave-to-amend-simple', 'STATE'),
  ('LA', 'motion-to-strike-simple', 'STATE'),
  ('LA', 'ex-parte-application-routine', 'STATE'),
  ('LA', 'motion-to-relate-cases', 'STATE'),
  -- Tier B Universal (STATE)
  ('LA', 'motion-to-compel-discovery', 'STATE'),
  ('LA', 'motion-for-sanctions', 'STATE'),
  ('LA', 'motion-for-protective-order-complex', 'STATE'),
  ('LA', 'motion-to-quash-subpoena', 'STATE'),
  ('LA', 'motion-in-limine', 'STATE'),
  ('LA', 'motion-to-exclude-expert', 'STATE'),
  ('LA', 'motion-for-new-trial', 'STATE'),
  ('LA', 'motion-to-reconsider', 'STATE'),
  ('LA', 'motion-for-jnov', 'STATE'),
  ('LA', 'motion-to-vacate-judgment', 'STATE'),
  ('LA', 'motion-to-enforce-judgment', 'STATE'),
  ('LA', 'motion-for-contempt', 'STATE'),
  ('LA', 'motion-to-compel-arbitration', 'STATE'),
  ('LA', 'motion-for-leave-to-amend-complex', 'STATE'),
  ('LA', 'motion-to-strike-complex', 'STATE'),
  ('LA', 'motion-for-judgment-on-pleadings', 'STATE'),
  ('LA', 'motion-to-transfer-venue', 'STATE'),
  ('LA', 'motion-to-dismiss-simple', 'STATE'),
  ('LA', 'motion-for-attorneys-fees', 'STATE'),
  ('LA', 'motion-for-costs', 'STATE'),
  ('LA', 'motion-to-bifurcate', 'STATE'),
  ('LA', 'motion-to-intervene', 'STATE'),
  -- LA-Only Exceptions (STATE)
  ('LA', 'declinatory-exception', 'STATE'),
  ('LA', 'dilatory-exception', 'STATE'),
  ('LA', 'peremptory-exception-no-cause', 'STATE'),
  ('LA', 'peremptory-exception-no-right', 'STATE'),
  ('LA', 'peremptory-exception-prescription', 'STATE'),
  ('LA', 'peremptory-exception-res-judicata', 'STATE'),
  ('LA', 'exception-of-prematurity', 'STATE'),
  ('LA', 'exception-of-vagueness', 'STATE'),
  ('LA', 'peremptory-exception-complex', 'STATE'),
  -- Tier C/D Universal (STATE)
  ('LA', 'motion-for-writ-of-mandamus', 'STATE'),
  ('LA', 'motion-for-writ-of-prohibition', 'STATE'),
  ('LA', 'motion-for-writ-of-habeas-corpus', 'STATE'),
  ('LA', 'motion-for-interlocutory-appeal', 'STATE'),
  ('LA', 'motion-for-declaratory-judgment', 'STATE'),
  ('LA', 'motion-for-summary-judgment', 'STATE'),
  ('LA', 'motion-for-summary-adjudication', 'STATE'),
  ('LA', 'motion-for-partial-summary-judgment', 'STATE'),
  ('LA', 'motion-for-class-certification', 'STATE'),
  ('LA', 'motion-to-decertify-class', 'STATE'),
  ('LA', 'motion-for-preliminary-injunction', 'STATE'),
  ('LA', 'temporary-restraining-order', 'STATE'),
  ('LA', 'daubert-sargent-motion', 'STATE')
ON CONFLICT (state_code, motion_type, court_type) DO NOTHING;

-- LA FEDERAL
INSERT INTO state_motion_availability (state_code, motion_type, court_type) VALUES
  -- Tier A Universal (FEDERAL)
  ('LA', 'motion-to-extend-deadline', 'FEDERAL'),
  ('LA', 'motion-for-continuance', 'FEDERAL'),
  ('LA', 'motion-to-withdraw-as-counsel', 'FEDERAL'),
  ('LA', 'motion-for-leave-to-file', 'FEDERAL'),
  ('LA', 'motion-to-appear-pro-hac-vice', 'FEDERAL'),
  ('LA', 'motion-to-substitute-counsel', 'FEDERAL'),
  ('LA', 'motion-to-consolidate', 'FEDERAL'),
  ('LA', 'motion-to-sever', 'FEDERAL'),
  ('LA', 'motion-for-default-judgment', 'FEDERAL'),
  ('LA', 'motion-to-set-aside-default', 'FEDERAL'),
  ('LA', 'motion-to-quash-service', 'FEDERAL'),
  ('LA', 'motion-to-stay-proceedings', 'FEDERAL'),
  ('LA', 'motion-to-seal-records', 'FEDERAL'),
  ('LA', 'motion-for-protective-order-simple', 'FEDERAL'),
  ('LA', 'motion-to-shorten-time', 'FEDERAL'),
  ('LA', 'motion-for-service-by-publication', 'FEDERAL'),
  ('LA', 'motion-for-leave-to-amend-simple', 'FEDERAL'),
  ('LA', 'motion-to-strike-simple', 'FEDERAL'),
  ('LA', 'ex-parte-application-routine', 'FEDERAL'),
  ('LA', 'motion-to-relate-cases', 'FEDERAL'),
  -- Tier B Universal (FEDERAL)
  ('LA', 'motion-to-compel-discovery', 'FEDERAL'),
  ('LA', 'motion-for-sanctions', 'FEDERAL'),
  ('LA', 'motion-for-protective-order-complex', 'FEDERAL'),
  ('LA', 'motion-to-quash-subpoena', 'FEDERAL'),
  ('LA', 'motion-in-limine', 'FEDERAL'),
  ('LA', 'motion-to-exclude-expert', 'FEDERAL'),
  ('LA', 'motion-for-new-trial', 'FEDERAL'),
  ('LA', 'motion-to-reconsider', 'FEDERAL'),
  ('LA', 'motion-for-jnov', 'FEDERAL'),
  ('LA', 'motion-to-vacate-judgment', 'FEDERAL'),
  ('LA', 'motion-to-enforce-judgment', 'FEDERAL'),
  ('LA', 'motion-for-contempt', 'FEDERAL'),
  ('LA', 'motion-to-compel-arbitration', 'FEDERAL'),
  ('LA', 'motion-for-leave-to-amend-complex', 'FEDERAL'),
  ('LA', 'motion-to-strike-complex', 'FEDERAL'),
  ('LA', 'motion-for-judgment-on-pleadings', 'FEDERAL'),
  ('LA', 'motion-to-transfer-venue', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-simple', 'FEDERAL'),
  ('LA', 'motion-for-attorneys-fees', 'FEDERAL'),
  ('LA', 'motion-for-costs', 'FEDERAL'),
  ('LA', 'motion-to-bifurcate', 'FEDERAL'),
  ('LA', 'motion-to-intervene', 'FEDERAL'),
  ('LA', 'motion-for-summary-judgment-partial', 'FEDERAL'),
  -- Federal-Only (FEDERAL)
  ('LA', 'motion-to-dismiss-12b1', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b2', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b3', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b4', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b5', 'FEDERAL'),
  ('LA', 'motion-to-remand', 'FEDERAL'),
  ('LA', 'motion-for-abstention', 'FEDERAL'),
  ('LA', 'motion-for-more-definite-statement', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b6-complex', 'FEDERAL'),
  -- Tier C/D Universal (FEDERAL)
  ('LA', 'motion-for-writ-of-mandamus', 'FEDERAL'),
  ('LA', 'motion-for-writ-of-prohibition', 'FEDERAL'),
  ('LA', 'motion-for-writ-of-habeas-corpus', 'FEDERAL'),
  ('LA', 'motion-for-interlocutory-appeal', 'FEDERAL'),
  ('LA', 'motion-for-declaratory-judgment', 'FEDERAL'),
  ('LA', 'motion-for-summary-judgment', 'FEDERAL'),
  ('LA', 'motion-for-summary-adjudication', 'FEDERAL'),
  ('LA', 'motion-for-partial-summary-judgment', 'FEDERAL'),
  ('LA', 'motion-for-class-certification', 'FEDERAL'),
  ('LA', 'motion-to-decertify-class', 'FEDERAL'),
  ('LA', 'motion-for-preliminary-injunction', 'FEDERAL'),
  ('LA', 'temporary-restraining-order', 'FEDERAL'),
  ('LA', 'daubert-sargent-motion', 'FEDERAL')
ON CONFLICT (state_code, motion_type, court_type) DO NOTHING;
