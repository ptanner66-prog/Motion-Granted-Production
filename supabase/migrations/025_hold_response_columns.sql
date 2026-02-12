-- ============================================================================
-- HOLD Response Columns Migration
-- Adds columns to order_workflows for HOLD checkpoint handling
-- Version: 1.0 | January 25, 2026
-- ============================================================================

-- Add HOLD response columns to order_workflows if they don't exist
DO $$
BEGIN
    -- hold_reason column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_reason'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_reason TEXT;
    END IF;

    -- hold_triggered_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_triggered_at'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_triggered_at TIMESTAMPTZ;
    END IF;

    -- hold_response column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_response'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_response VARCHAR(50);
    END IF;

    -- hold_response_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_response_at'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_response_at TIMESTAMPTZ;
    END IF;

    -- hold_acknowledgment_text column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_acknowledgment_text'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_acknowledgment_text TEXT;
    END IF;
END $$;

-- Add index for querying orders on HOLD
CREATE INDEX IF NOT EXISTS idx_workflows_hold_status ON order_workflows(hold_checkpoint_triggered)
WHERE hold_checkpoint_triggered = TRUE;

-- Add constraint for hold_response values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'valid_hold_response'
    ) THEN
        ALTER TABLE order_workflows ADD CONSTRAINT valid_hold_response
        CHECK (hold_response IS NULL OR hold_response IN ('PROVIDE_EVIDENCE', 'PROCEED_WITH_ACKNOWLEDGMENT', 'CANCEL'));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- Comment for documentation
COMMENT ON COLUMN order_workflows.hold_reason IS 'Description of why HOLD was triggered (Protocol 8)';
COMMENT ON COLUMN order_workflows.hold_triggered_at IS 'Timestamp when HOLD checkpoint was triggered';
COMMENT ON COLUMN order_workflows.hold_response IS 'Customer response to HOLD: PROVIDE_EVIDENCE, PROCEED_WITH_ACKNOWLEDGMENT, or CANCEL';
COMMENT ON COLUMN order_workflows.hold_response_at IS 'Timestamp when customer responded to HOLD';
COMMENT ON COLUMN order_workflows.hold_acknowledgment_text IS 'Customer acknowledgment text if proceeding despite weakness';
