-- CS-T014: Fix defense-in-depth — default must be 'unverified', not 'verified'
-- Any row inserted without an explicit verification_status should default to 'unverified'
-- to prevent the Cardinal Sin of claiming citations are verified when they haven't been checked.
ALTER TABLE order_citations ALTER COLUMN verification_status SET DEFAULT 'unverified';
