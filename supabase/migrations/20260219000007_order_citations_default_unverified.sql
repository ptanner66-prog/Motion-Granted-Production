-- A12 CS-P2-004: Defense-in-depth fix
-- DB column default must be 'unverified', not 'verified'
-- This prevents any INSERT that omits verification_status from
-- silently marking a citation as verified.
ALTER TABLE order_citations ALTER COLUMN verification_status SET DEFAULT 'unverified';
