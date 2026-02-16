-- D6 ST-033 v2: Add remaining D8-expected columns to delivery_packages
-- SP-7 added: delivered_at, completed_at, download_confirmed_at, urls_invalidated_at,
--             zip_storage_path, signed_urls, signed_urls_generated_at, signed_urls_expire_at
-- This migration adds: cp3_decision, cp3_decision_at, cp3_decided_by, cp3_revision_number,
--                       protocol10_triggered, archive_status, judge_simulation_grade
-- Using ADD COLUMN IF NOT EXISTS for idempotency

ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS cp3_decision TEXT;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS cp3_decision_at TIMESTAMPTZ;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS cp3_decided_by UUID;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS cp3_revision_number INTEGER DEFAULT 0;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS protocol10_triggered BOOLEAN DEFAULT FALSE;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS archive_status TEXT;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS judge_simulation_grade TEXT;
