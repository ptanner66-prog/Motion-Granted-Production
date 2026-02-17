-- Backfill case_name from citation_string for existing records with 'Unknown Case'
-- These columns already exist in the schema but may not be populated

-- Backfill case_name by extracting from citation_string
-- Pattern: "Name v. Name, 123 So. 3d 456" → "Name v. Name"
UPDATE order_citations
SET case_name =
  CASE
    -- Pattern: "Name v. Name, 123 Reporter 456" (with comma before volume)
    WHEN citation_string ~ '^.+\s+v\.?\s+.+,\s*\d+' THEN
      trim(regexp_replace(citation_string, ',\s*\d+.*$', ''))
    -- Pattern: "Name v. Name 123 Reporter 456" (no comma, reporter follows)
    WHEN citation_string ~ '^.+\s+v\.?\s+.+\s+\d+\s+(So|F|S\.W|N\.E|P)\.' THEN
      trim(regexp_replace(citation_string, '\s+\d+\s+(So|F|S\.W|N\.E|P)\..*$', ''))
    -- Pattern: "In re Name, 123 Reporter 456"
    WHEN citation_string ~* '^In\s+[Rr]e\s+.+,\s*\d+' THEN
      trim(regexp_replace(citation_string, ',\s*\d+.*$', ''))
    ELSE case_name  -- Keep existing value if no pattern matches
  END
WHERE case_name IS NULL OR case_name = '' OR case_name = 'Unknown Case';

-- Backfill case_name_short from case_name (first party before "v.")
UPDATE order_citations
SET case_name_short =
  CASE
    WHEN case_name ~ '\s+v\.?\s+' THEN
      trim(split_part(case_name, ' v', 1))
    ELSE
      split_part(case_name, ',', 1)
  END
WHERE (case_name_short IS NULL OR case_name_short = '')
  AND case_name IS NOT NULL
  AND case_name != ''
  AND case_name != 'Unknown Case';
