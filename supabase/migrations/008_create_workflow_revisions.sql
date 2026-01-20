-- Migration: Create workflow_revisions table
-- Date: January 2026
-- Description: Track individual revision requests with pricing for v6.3

-- ============================================================================
-- STEP 1: Create workflow_revisions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_workflow_id UUID REFERENCES order_workflows(id) ON DELETE CASCADE NOT NULL,

  -- Revision details
  revision_number INTEGER NOT NULL,
  revision_type TEXT NOT NULL CHECK (revision_type IN ('free', 'paid')),

  -- Pricing (v6.3: Tier A=$75, Tier B=$125, Tier C=$200)
  tier TEXT NOT NULL CHECK (tier IN ('A', 'B', 'C')),
  charge_amount DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Payment tracking
  payment_status TEXT DEFAULT 'not_required' CHECK (payment_status IN (
    'not_required',  -- Free revision
    'pending',       -- Awaiting payment
    'completed',     -- Payment received
    'waived',        -- Admin waived fee
    'failed'         -- Payment failed
  )),
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  paid_at TIMESTAMPTZ,

  -- Revision content
  customer_notes TEXT NOT NULL DEFAULT '',
  admin_notes TEXT,

  -- Revision feedback (what customer wants changed)
  feedback_categories JSONB DEFAULT '[]', -- ['legal_arguments', 'citations', 'formatting', 'tone', 'other']
  specific_changes_requested TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',       -- Waiting for payment (if paid) or processing
    'in_progress',   -- Being worked on
    'completed',     -- Revision done
    'cancelled'      -- Cancelled
  )),

  -- Timestamps
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Quality tracking
  pre_revision_grade VARCHAR(3),
  post_revision_grade VARCHAR(3),

  -- Constraints
  UNIQUE(order_workflow_id, revision_number)
);

-- ============================================================================
-- STEP 2: Create indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_workflow_revisions_workflow
ON workflow_revisions(order_workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_revisions_payment_status
ON workflow_revisions(payment_status)
WHERE payment_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_workflow_revisions_status
ON workflow_revisions(status);

-- ============================================================================
-- STEP 3: Create RLS policies
-- ============================================================================

ALTER TABLE workflow_revisions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage revisions"
ON workflow_revisions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'clerk')
  )
);

-- Clients can view their own revisions
CREATE POLICY "Clients can view own revisions"
ON workflow_revisions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_workflows ow
    JOIN orders o ON o.id = ow.order_id
    WHERE ow.id = workflow_revisions.order_workflow_id
    AND o.client_id = auth.uid()
  )
);

-- Clients can insert revision requests
CREATE POLICY "Clients can request revisions"
ON workflow_revisions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM order_workflows ow
    JOIN orders o ON o.id = ow.order_id
    WHERE ow.id = order_workflow_id
    AND o.client_id = auth.uid()
  )
);

-- ============================================================================
-- STEP 4: Add comments
-- ============================================================================

COMMENT ON TABLE workflow_revisions IS 'v6.3: Tracks individual revision requests. 1 free revision included, then paid at tier-based pricing.';
COMMENT ON COLUMN workflow_revisions.tier IS 'Motion tier: A=$75, B=$125, C=$200 per revision';
COMMENT ON COLUMN workflow_revisions.revision_type IS 'free = included with order, paid = requires payment';
COMMENT ON COLUMN workflow_revisions.feedback_categories IS 'Categories of changes requested: legal_arguments, citations, formatting, tone, other';
