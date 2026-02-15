-- ============================================
-- MOTION GRANTED: Federal Circuits Reference Table
-- Migration: 20260215100001_create_federal_circuits.sql
-- SP-C Task 2: 13 federal circuits
-- ============================================

CREATE TABLE IF NOT EXISTS federal_circuits (
  circuit_number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  states TEXT[] NOT NULL
);

-- Seed all 13 circuits
INSERT INTO federal_circuits (circuit_number, name, states) VALUES
  ('1ST',     '1st Circuit',       ARRAY['ME','MA','NH','RI','PR']),
  ('2ND',     '2nd Circuit',       ARRAY['CT','NY','VT']),
  ('3RD',     '3rd Circuit',       ARRAY['DE','NJ','PA','VI']),
  ('4TH',     '4th Circuit',       ARRAY['MD','NC','SC','VA','WV']),
  ('5TH',     '5th Circuit',       ARRAY['LA','MS','TX']),
  ('6TH',     '6th Circuit',       ARRAY['KY','MI','OH','TN']),
  ('7TH',     '7th Circuit',       ARRAY['IL','IN','WI']),
  ('8TH',     '8th Circuit',       ARRAY['AR','IA','MN','MO','NE','ND','SD']),
  ('9TH',     '9th Circuit',       ARRAY['AK','AZ','CA','HI','ID','MT','NV','OR','WA','GU','MP']),
  ('10TH',    '10th Circuit',      ARRAY['CO','KS','NM','OK','UT','WY']),
  ('11TH',    '11th Circuit',      ARRAY['AL','FL','GA']),
  ('DC',      'D.C. Circuit',      ARRAY['DC']),
  ('FEDERAL', 'Federal Circuit',   ARRAY[])
ON CONFLICT (circuit_number) DO NOTHING;

-- RLS: public read, admin write
ALTER TABLE federal_circuits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view federal circuits"
  ON federal_circuits FOR SELECT
  USING (true);

CREATE POLICY "Admin can manage federal circuits"
  ON federal_circuits FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
