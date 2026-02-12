-- ============================================================================
-- Migration 014: Legal Compliance & Data Integrity Fixes
-- ============================================================================
-- CRITICAL: This is a legal platform. Data integrity and audit trails are paramount.
-- This migration addresses:
-- 1. Missing updated_at timestamps
-- 2. Missing CHECK constraints for logical consistency
-- 3. Missing indexes for common queries
-- 4. Missing soft delete capabilities
-- 5. Audit trail improvements
-- 6. Data retention support
-- ============================================================================

-- ============================================================================
-- PART 1: ADD MISSING UPDATED_AT COLUMNS AND TRIGGERS
-- ============================================================================

-- automation_logs
ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- automation_tasks
ALTER TABLE automation_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_automation_tasks_timestamp
  BEFORE UPDATE ON automation_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- approval_queue
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_approval_queue_timestamp
  BEFORE UPDATE ON approval_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- notification_queue
ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_notification_queue_timestamp
  BEFORE UPDATE ON notification_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- conflict_matches
ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_conflict_matches_timestamp
  BEFORE UPDATE ON conflict_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- webhook_events
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_webhook_events_timestamp
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- revision_requests (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'revision_requests') THEN
    EXECUTE 'ALTER TABLE revision_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
  END IF;
END $$;

-- superprompt_templates
ALTER TABLE superprompt_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_superprompt_templates_timestamp
  BEFORE UPDATE ON superprompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_superprompt_templates_updated_at();

-- workflow_phase_definitions
ALTER TABLE workflow_phase_definitions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_workflow_phase_definitions_timestamp
  BEFORE UPDATE ON workflow_phase_definitions
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

-- conversation_messages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_messages') THEN
    EXECUTE 'ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
  END IF;
END $$;

-- workflow_revisions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_revisions') THEN
    EXECUTE 'ALTER TABLE workflow_revisions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
  END IF;
END $$;

-- handoff_files
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'handoff_files') THEN
    EXECUTE 'ALTER TABLE handoff_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
  END IF;
END $$;

-- ============================================================================
-- PART 2: ADD SOFT DELETE COLUMNS TO CRITICAL TABLES
-- ============================================================================

-- Orders table - never physically delete, only soft delete
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- Create index for soft delete queries
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted ON orders(is_deleted) WHERE is_deleted = false;

-- Conversations - preserve work product
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    EXECUTE 'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE';
    EXECUTE 'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ';
  END IF;
END $$;

-- Documents - preserve case records
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_documents_is_deleted ON documents(is_deleted) WHERE is_deleted = false;

-- ============================================================================
-- PART 3: LEGAL HOLDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('order', 'conversation', 'document', 'parsed_document')),
  entity_id UUID NOT NULL,
  hold_reason TEXT NOT NULL,
  case_reference VARCHAR(255),
  held_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  held_by UUID NOT NULL REFERENCES profiles(id),
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES profiles(id),
  release_reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_entity ON legal_holds(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_legal_holds_active ON legal_holds(is_active) WHERE is_active = true;

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage legal holds" ON legal_holds
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================================
-- PART 4: ADD CHECK CONSTRAINTS FOR DATA INTEGRITY
-- ============================================================================

-- Conflict matches: If cleared, must have who and when
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conflict_matches_cleared_logic') THEN
    ALTER TABLE conflict_matches ADD CONSTRAINT conflict_matches_cleared_logic
      CHECK (is_cleared = false OR (cleared_by IS NOT NULL AND cleared_at IS NOT NULL));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notification queue: If sent, must have sent_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_queue_sent_logic') THEN
    ALTER TABLE notification_queue ADD CONSTRAINT notification_queue_sent_logic
      CHECK (status != 'sent' OR sent_at IS NOT NULL);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Automation tasks: If failed, should have error
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_tasks_failed_logic') THEN
    ALTER TABLE automation_tasks ADD CONSTRAINT automation_tasks_failed_logic
      CHECK (status != 'failed' OR last_error IS NOT NULL);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Orders: Prices must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_prices_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_prices_positive
      CHECK (total_price >= 0 AND (base_price IS NULL OR base_price >= 0) AND (rush_surcharge IS NULL OR rush_surcharge >= 0));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 5: ADD MISSING INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Approval queue indexes
CREATE INDEX IF NOT EXISTS idx_approval_queue_reviewed_by ON approval_queue(reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_queue_expires ON approval_queue(expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;

-- Notification queue indexes
CREATE INDEX IF NOT EXISTS idx_notification_queue_email ON notification_queue(recipient_email);

-- Workflow revisions payment tracking (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_revisions') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_revisions_payment ON workflow_revisions(payment_status) WHERE payment_status = ''pending''';
  END IF;
END $$;

-- Conversations status (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)';
  END IF;
END $$;

-- ============================================================================
-- PART 6: SUPERPROMPT TEMPLATE VERSIONING (AUDIT TRAIL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS superprompt_templates_audit (
  id BIGSERIAL PRIMARY KEY,
  template_id UUID NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted', 'restored')),
  old_template TEXT,
  new_template TEXT,
  old_system_prompt TEXT,
  new_system_prompt TEXT,
  change_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_superprompt_audit_template ON superprompt_templates_audit(template_id);
CREATE INDEX IF NOT EXISTS idx_superprompt_audit_time ON superprompt_templates_audit(changed_at DESC);

-- Trigger to log superprompt changes
CREATE OR REPLACE FUNCTION log_superprompt_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.superprompt_templates_audit (
      template_id, changed_by, change_type,
      old_template, new_template,
      old_system_prompt, new_system_prompt
    ) VALUES (
      NEW.id, auth.uid(), 'updated',
      OLD.template, NEW.template,
      OLD.system_prompt, NEW.system_prompt
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.superprompt_templates_audit (
      template_id, changed_by, change_type, new_template, new_system_prompt
    ) VALUES (
      NEW.id, auth.uid(), 'created', NEW.template, NEW.system_prompt
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_superprompt_audit ON superprompt_templates;
CREATE TRIGGER trg_superprompt_audit
  AFTER INSERT OR UPDATE ON superprompt_templates
  FOR EACH ROW EXECUTE FUNCTION log_superprompt_changes();

-- ============================================================================
-- PART 7: APPROVAL QUEUE AUDIT TRAIL
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_queue_audit (
  id BIGSERIAL PRIMARY KEY,
  approval_id UUID NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  review_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_audit_id ON approval_queue_audit(approval_id);

-- Trigger to log approval status changes
CREATE OR REPLACE FUNCTION log_approval_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.approval_queue_audit (
      approval_id, changed_by, old_status, new_status, review_notes
    ) VALUES (
      NEW.id, auth.uid(), OLD.status, NEW.status, NEW.review_notes
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_audit ON approval_queue;
CREATE TRIGGER trg_approval_audit
  AFTER UPDATE ON approval_queue
  FOR EACH ROW EXECUTE FUNCTION log_approval_changes();

-- ============================================================================
-- PART 8: DATA RETENTION SUPPORT FUNCTIONS
-- ============================================================================

-- Function to check if entity is on legal hold
CREATE OR REPLACE FUNCTION is_on_legal_hold(p_entity_type VARCHAR, p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.legal_holds
    WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND is_active = true
  );
END;
$$;

-- Function to prevent deletion of items on legal hold
CREATE OR REPLACE FUNCTION prevent_delete_on_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  entity_type_name VARCHAR(50);
BEGIN
  entity_type_name := TG_TABLE_NAME;

  IF public.is_on_legal_hold(entity_type_name, OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete % with id %: item is on legal hold', entity_type_name, OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

-- Apply to orders table
DROP TRIGGER IF EXISTS trg_prevent_order_delete ON orders;
CREATE TRIGGER trg_prevent_order_delete
  BEFORE DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION prevent_delete_on_hold();

-- ============================================================================
-- PART 9: ADD "WHO" FIELDS FOR AUDIT TRAIL
-- ============================================================================

-- Add triggered_by to automation_logs
ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS triggered_by UUID REFERENCES profiles(id);

-- Add started_by/completed_by to automation_tasks
ALTER TABLE automation_tasks ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES profiles(id);
ALTER TABLE automation_tasks ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id);

-- Add updated_by to approval_queue
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

-- ============================================================================
-- PART 10: RLS FOR NEW TABLES
-- ============================================================================

ALTER TABLE superprompt_templates_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view superprompt audit" ON superprompt_templates_audit
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

ALTER TABLE approval_queue_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view approval audit" ON approval_queue_audit
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify the migration was successful:

-- Check updated_at columns exist
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE column_name = 'updated_at' AND table_schema = 'public';

-- Check legal holds table exists
-- SELECT * FROM legal_holds LIMIT 1;

-- Check audit tables exist
-- SELECT * FROM superprompt_templates_audit LIMIT 1;
-- SELECT * FROM approval_queue_audit LIMIT 1;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
