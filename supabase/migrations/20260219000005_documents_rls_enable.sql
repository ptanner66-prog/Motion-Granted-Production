-- A-014: Enable RLS on documents table
-- Policies already exist from 006_fix_security_and_performance.sql
-- but were never enforced because ENABLE ROW LEVEL SECURITY was missing.
-- This is a cross-customer data exposure without this fix.
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
