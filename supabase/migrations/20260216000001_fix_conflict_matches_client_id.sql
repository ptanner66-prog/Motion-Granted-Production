-- ============================================================================
-- SP-1 R4-09: Fix conflict_matches RLS policy — orders.attorney_id -> orders.client_id
-- Date: 2026-02-16
--
-- Problem: The "Attorneys can view own conflicts" policy references
-- orders.attorney_id which does not exist. The correct column is
-- orders.client_id (P0 fix from CST-01).
--
-- This migration drops and recreates the affected RLS policy with the
-- correct column reference.
-- ============================================================================

-- Fix: Replace orders.attorney_id with orders.client_id in conflict_matches RLS
DROP POLICY IF EXISTS "Attorneys can view own conflicts" ON conflict_matches;
CREATE POLICY "Attorneys can view own conflicts"
  ON conflict_matches FOR SELECT
  TO authenticated
  USING (
    current_attorney_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = conflict_matches.current_order_id
      AND orders.client_id = auth.uid()
    )
  );
