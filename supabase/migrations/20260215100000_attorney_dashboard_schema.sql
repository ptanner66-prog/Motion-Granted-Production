-- SP-D: Attorney Dashboard Schema Updates
-- Adds columns for 7-status model, CP3 approval, HOLD, revision tracking, cancellation

-- Add new columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount_paid bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_response text,
  ADD COLUMN IF NOT EXISTS cp3_change_notes text,
  ADD COLUMN IF NOT EXISTS revision_notes text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS refund_amount bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_version integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

-- Ensure revision_count exists (may already exist from earlier migrations)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS revision_count integer DEFAULT 0 NOT NULL;

-- Ensure hold_reason exists
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS hold_reason text;

-- Create intake_drafts table for Save & Finish Later (Task 23)
CREATE TABLE IF NOT EXISTS intake_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motion_type text,
  form_data jsonb DEFAULT '{}'::jsonb,
  current_step integer DEFAULT 1,
  total_steps integer DEFAULT 6,
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Only one active draft per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_drafts_user_active
  ON intake_drafts (user_id)
  WHERE expires_at > now();

-- RLS for intake_drafts
ALTER TABLE intake_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own drafts" ON intake_drafts;
CREATE POLICY "Users can view own drafts" ON intake_drafts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own drafts" ON intake_drafts;
CREATE POLICY "Users can insert own drafts" ON intake_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own drafts" ON intake_drafts;
CREATE POLICY "Users can update own drafts" ON intake_drafts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own drafts" ON intake_drafts;
CREATE POLICY "Users can delete own drafts" ON intake_drafts
  FOR DELETE USING (auth.uid() = user_id);

-- Enable pg_trgm for conflict check similarity search (Task 24)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create conflict_check_log for audit trail
CREATE TABLE IF NOT EXISTS conflict_check_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  client_name text,
  opposing_party text,
  opposing_counsel text,
  match_found boolean DEFAULT false,
  match_details jsonb,
  user_decision text, -- 'proceed' or 'cancel'
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE conflict_check_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conflict checks" ON conflict_check_log;
CREATE POLICY "Users can view own conflict checks" ON conflict_check_log
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own conflict checks" ON conflict_check_log;
CREATE POLICY "Users can insert own conflict checks" ON conflict_check_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_client_status ON orders (client_id, status);

-- Add trgm indexes for similarity search on parties
CREATE INDEX IF NOT EXISTS idx_parties_name_trgm ON parties USING gin (party_name gin_trgm_ops);
