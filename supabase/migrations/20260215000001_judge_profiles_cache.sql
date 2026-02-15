-- Judge Profile Cache Table with RLS
-- Stores CourtListener judge profile data to reduce API calls
--
-- ST-005: judge_profiles_cache table missing RLS policies
-- BATCH_11_JUDGE_LOOKUP

CREATE TABLE IF NOT EXISTS judge_profiles_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cl_person_id INTEGER NOT NULL UNIQUE,
  profile_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lookups by CL person ID
CREATE INDEX idx_judge_profiles_cl_person_id ON judge_profiles_cache(cl_person_id);

-- Index for cache expiration cleanup
CREATE INDEX idx_judge_profiles_expires_at ON judge_profiles_cache(expires_at);

-- Enable Row Level Security
ALTER TABLE judge_profiles_cache ENABLE ROW LEVEL SECURITY;

-- All authenticated users can READ (judge data is public)
CREATE POLICY judge_cache_authenticated_read ON judge_profiles_cache
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- Only service_role can INSERT (backend/Inngest writes)
CREATE POLICY judge_cache_service_insert ON judge_profiles_cache
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Only service_role can UPDATE
CREATE POLICY judge_cache_service_update ON judge_profiles_cache
  FOR UPDATE USING (auth.role() = 'service_role');

-- Only service_role can DELETE
CREATE POLICY judge_cache_service_delete ON judge_profiles_cache
  FOR DELETE USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_judge_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER judge_cache_updated_at
  BEFORE UPDATE ON judge_profiles_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_judge_cache_timestamp();
