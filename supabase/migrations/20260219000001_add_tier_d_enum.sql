-- T-08: Add Tier D to motion_tier enum
-- Without this, all MSJ/PI/Class Cert/Daubert orders fail on INSERT
ALTER TYPE motion_tier ADD VALUE IF NOT EXISTS 'D';
