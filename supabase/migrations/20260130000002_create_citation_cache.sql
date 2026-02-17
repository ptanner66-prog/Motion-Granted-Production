-- ============================================================================
-- Migration: 20260130_create_citation_cache.sql
-- Citation Viewer Feature: Citation Cache Table
--
-- Caches CourtListener API responses to reduce API calls and speed up page loads.
-- 30-day TTL with automatic cleanup function.
-- ============================================================================

-- citation_cache table: Cached CourtListener responses
CREATE TABLE IF NOT EXISTS citation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CourtListener identification
  courtlistener_opinion_id VARCHAR(50) UNIQUE,
  courtlistener_cluster_id VARCHAR(50),

  -- Cached data (full CourtListener response)
  opinion_data JSONB,                            -- Full opinion object
  cluster_data JSONB,                            -- Full cluster object (case metadata)

  -- Extracted fields for quick access
  case_name TEXT,
  case_name_short VARCHAR(255),
  citation_string VARCHAR(255),
  court VARCHAR(255),
  court_short VARCHAR(50),
  date_filed DATE,
  date_filed_display VARCHAR(50),

  -- Opinion text (can be large)
  opinion_text TEXT,                             -- Full opinion text (HTML or plain)
  opinion_text_type VARCHAR(20),                 -- 'html' | 'plain' | 'pdf_url'

  -- Holding/summary (extracted or from CourtListener)
  headnotes TEXT,
  syllabus TEXT,

  -- Treatment history
  citing_count INTEGER DEFAULT 0,
  cited_by_count INTEGER DEFAULT 0,
  treatment_history JSONB,                       -- Overruled, distinguished, etc.

  -- Cache management
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
  fetch_source VARCHAR(50),                      -- 'opinion_endpoint' | 'cluster_endpoint' | 'search'

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient cache lookups
CREATE INDEX IF NOT EXISTS idx_citation_cache_cluster_id ON citation_cache(courtlistener_cluster_id);
CREATE INDEX IF NOT EXISTS idx_citation_cache_expires ON citation_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_citation_cache_citation ON citation_cache(citation_string);
CREATE INDEX IF NOT EXISTS idx_citation_cache_fetched ON citation_cache(fetched_at DESC);

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_citation_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM citation_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh cache entry (extends expiry by 30 days)
CREATE OR REPLACE FUNCTION refresh_citation_cache(opinion_id VARCHAR(50))
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE citation_cache
  SET
    expires_at = NOW() + INTERVAL '30 days',
    updated_at = NOW()
  WHERE courtlistener_opinion_id = opinion_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_citation_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_citation_cache_updated_at ON citation_cache;
CREATE TRIGGER update_citation_cache_updated_at
  BEFORE UPDATE ON citation_cache
  FOR EACH ROW EXECUTE FUNCTION update_citation_cache_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE citation_cache ENABLE ROW LEVEL SECURITY;

-- Cache is readable by all authenticated users (it's public legal data)
CREATE POLICY "Citation cache is readable by all authenticated users"
  ON citation_cache FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can write to cache (server-side only)
CREATE POLICY "Service role full access to citation_cache"
  ON citation_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can manage cache (for manual refresh/cleanup)
CREATE POLICY "Admins can manage citation cache"
  ON citation_cache FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
