-- ============================================================================
-- SCHEMA DRIFT DETECTION SCRIPT
-- Run in Supabase SQL Editor to detect columns expected by code but missing
-- from the database.
--
-- Created: 2026-02-17
-- Purpose: Ongoing monitoring to prevent "column not found" errors
-- ============================================================================

-- ============================================================================
-- SECTION 1: Check expected columns exist
-- ============================================================================

WITH expected_columns AS (
  -- ORDERS TABLE — all columns referenced in TypeScript code
  SELECT 'orders' AS table_name, unnest(ARRAY[
    'id', 'order_number', 'client_id', 'clerk_id', 'motion_type', 'motion_tier',
    'tier', 'base_price', 'turnaround', 'rush_surcharge', 'total_price',
    'filing_deadline', 'expected_delivery', 'jurisdiction', 'court_division',
    'case_number', 'case_caption', 'statement_of_facts', 'procedural_history',
    'instructions', 'related_entities', 'status', 'stripe_payment_intent_id',
    'stripe_payment_status', 'stripe_checkout_session_id',
    'conflict_flagged', 'conflict_cleared', 'conflict_notes', 'conflict_status',
    'conflict_check_completed_at',
    'created_at', 'updated_at', 'deleted_at',
    -- HOLD tracking
    'hold_triggered_at', 'hold_phase', 'hold_reason', 'hold_resolved_at',
    'hold_reminder_sent', 'hold_escalated', 'hold_response', 'hold_expires_at',
    -- Revision tracking
    'revision_count', 'revision_notes', 'revision_requested_at',
    'protocol_10_triggered', 'protocol_10_disclosure',
    -- Phase tracking
    'current_phase', 'resume_phase', 'phase_outputs',
    -- Workflow
    'workflow_id', 'judge_grade',
    -- 50-state expansion
    'state', 'state_code', 'court_type', 'federal_district',
    'pricing_multiplier_applied',
    -- Status model
    'amount_paid', 'amount_paid_cents', 'status_version',
    'cp3_change_notes', 'cp3_entered_at',
    'cancel_reason', 'cancellation_type', 'cancellation_reason',
    'refund_amount', 'refund_amount_cents', 'refund_status',
    'refund_in_progress', 'refund_reason', 'refund_stripe_id', 'refunded_at',
    'delivered_at', 'completed_at', 'cancelled_at',
    -- Deliverables
    'deliverable_urls', 'deliverables_generated_at',
    -- Document generation
    'document_url', 'document_generated_at',
    'generation_started_at', 'generation_completed_at',
    'generation_attempts', 'generation_error',
    -- Disputes
    'stripe_dispute_active', 'dispute_id',
    -- Attorney info
    'attorney_email', 'attorney_rework_count',
    -- Data retention
    'retention_expires_at', 'retention_extended_by_customer',
    'deletion_reminder_sent', 'deletion_reminder_sent_at',
    'raw_uploads_purged', 'raw_uploads_purged_at',
    -- Payment
    'billing_payer', 'billing_contact_email',
    'last_workflow_trigger_at', 'cost_cap_triggered',
    'upgrade_to_tier', 'upgrade_from_tier', 'upgrade_resolved_at',
    'pending_inngest_jobs',
    -- Misc
    'opposing_party_name', 'deadline_warned', 'failure_type',
    'queue_position', 'rush_level', 'court_name'
  ]) AS column_name
  UNION ALL
  -- PROTOCOL_RESULTS TABLE
  SELECT 'protocol_results', unnest(ARRAY[
    'id', 'order_id', 'phase', 'protocol_number', 'citation_id',
    'triggered', 'severity', 'action_taken', 'ais_entry',
    'handler_version', 'input_hash', 'supersedes_id', 'created_at'
  ])
  UNION ALL
  -- ORDER_WORKFLOWS TABLE
  SELECT 'order_workflows', unnest(ARRAY[
    'id', 'order_id', 'motion_type_id', 'workflow_path',
    'current_phase', 'status', 'started_at', 'completed_at',
    'last_activity_at', 'final_document_id', 'quality_score',
    'citation_count', 'error_count', 'last_error', 'metadata',
    'created_at', 'updated_at',
    'hold_triggered_at', 'hold_reason', 'hold_response',
    'hold_response_at', 'hold_acknowledgment_text',
    'current_loop_count', 'max_loops_reached', 'loop_exit_triggered_at',
    'checkpoint_pending', 'protocol_10_disclosure'
  ])
  UNION ALL
  -- CHECKPOINTS TABLE
  SELECT 'checkpoints', unnest(ARRAY[
    'id', 'order_id', 'type', 'status', 'phase',
    'hold_reason', 'actor', 'resolved_at', 'resolved_by',
    'resolution_data', 'created_at', 'updated_at'
  ])
  UNION ALL
  -- CHECKPOINT_EVENTS TABLE
  SELECT 'checkpoint_events', unnest(ARRAY[
    'id', 'order_id', 'event_name', 'event_data', 'checkpoint_type',
    'actor_id', 'created_at', 'expires_at',
    'checkpoint_id', 'package_id', 'actor', 'metadata',
    'event_type', 'phase', 'data'
  ])
  UNION ALL
  -- ORDER_CITATIONS TABLE
  SELECT 'order_citations', unnest(ARRAY[
    'id', 'order_id', 'citation_string', 'case_name', 'case_name_short',
    'courtlistener_opinion_id', 'courtlistener_cluster_id', 'courtlistener_url',
    'court', 'court_short', 'date_filed', 'date_filed_display',
    'citation_type', 'proposition', 'location_in_motion', 'authority_level',
    'verification_status', 'verification_timestamp', 'verification_method',
    'admin_reviewed', 'admin_reviewed_at', 'admin_reviewed_by', 'admin_notes',
    'display_order', 'created_at', 'updated_at'
  ])
  UNION ALL
  -- DELIVERY_PACKAGES TABLE
  SELECT 'delivery_packages', unnest(ARRAY[
    'id', 'order_id', 'version', 'status', 'content',
    'created_at', 'updated_at',
    'delivered_at', 'completed_at', 'download_confirmed_at',
    'urls_invalidated_at', 'zip_storage_path',
    'signed_urls', 'signed_urls_generated_at', 'signed_urls_expire_at',
    'cp3_decision', 'cp3_decision_at', 'cp3_decided_by',
    'cp3_revision_number', 'protocol10_triggered',
    'archive_status', 'judge_simulation_grade',
    'stage', 'status_version', 'workflow_id'
  ])
  UNION ALL
  -- LOOP_COUNTERS TABLE
  SELECT 'loop_counters', unnest(ARRAY[
    'id', 'order_id', 'current_count', 'max_loops', 'created_at', 'updated_at'
  ])
  UNION ALL
  -- PAYMENT_EVENTS TABLE
  SELECT 'payment_events', unnest(ARRAY[
    'id', 'order_id', 'event_type', 'stripe_event_id',
    'amount_cents', 'status', 'metadata', 'created_at'
  ])
),
actual_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
)
SELECT
  e.table_name,
  e.column_name,
  CASE WHEN a.column_name IS NULL THEN '❌ MISSING' ELSE '✅ EXISTS' END AS status
FROM expected_columns e
LEFT JOIN actual_columns a
  ON e.table_name = a.table_name AND e.column_name = a.column_name
WHERE a.column_name IS NULL
ORDER BY e.table_name, e.column_name;

-- ============================================================================
-- SECTION 2: Check expected tables exist
-- ============================================================================

WITH expected_tables AS (
  SELECT unnest(ARRAY[
    'orders', 'profiles', 'documents', 'parties', 'clerks',
    'order_workflows', 'workflow_phase_definitions', 'workflow_phase_executions',
    'workflow_citations', 'citation_verification_log', 'parsed_documents',
    'motion_types', 'order_citations', 'verified_citations',
    'protocol_results', 'checkpoints', 'checkpoint_events',
    'checkpoint_reminders', 'cp3_rejections',
    'delivery_packages', 'order_deliverables',
    'loop_counters', 'loop_sources',
    'payment_events', 'order_workflow_state',
    'automation_logs', 'automation_tasks', 'automation_settings',
    'approval_queue', 'notification_queue',
    'conflict_matches', 'conflict_checks', 'conflict_parties',
    'webhook_events', 'superprompt_templates',
    'conversations', 'conversation_messages',
    'anonymized_analytics', 'refunds',
    'intake_drafts', 'promo_redemptions',
    'user_roles', 'user_sessions',
    'archive_log', 'citation_approvals'
  ]) AS table_name
),
actual_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  UNION
  SELECT table_name
  FROM information_schema.views
  WHERE table_schema = 'public'
)
SELECT
  e.table_name,
  CASE WHEN a.table_name IS NULL THEN '❌ MISSING' ELSE '✅ EXISTS' END AS status
FROM expected_tables e
LEFT JOIN actual_tables a ON e.table_name = a.table_name
ORDER BY status DESC, e.table_name;

-- ============================================================================
-- SECTION 3: Summary
-- ============================================================================

SELECT
  'Tables' AS category,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE table_type = 'BASE TABLE') AS tables,
  COUNT(*) FILTER (WHERE table_type = 'VIEW') AS views
FROM information_schema.tables
WHERE table_schema = 'public';

SELECT table_name, COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
