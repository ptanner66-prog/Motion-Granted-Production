-- Superprompt Templates Table
-- Stores the lawyer's AI motion generation templates
-- Templates can be updated anytime to improve accuracy

CREATE TABLE IF NOT EXISTS superprompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  motion_types TEXT[] DEFAULT ARRAY['*']::TEXT[], -- Which motion types this handles, '*' = all
  template TEXT NOT NULL, -- The actual superprompt with {{PLACEHOLDERS}}
  system_prompt TEXT, -- Optional system prompt for Claude
  max_tokens INTEGER DEFAULT 16000,
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding templates by motion type
CREATE INDEX IF NOT EXISTS idx_superprompt_templates_motion_types
  ON superprompt_templates USING GIN (motion_types);

-- Index for default template lookup
CREATE INDEX IF NOT EXISTS idx_superprompt_templates_is_default
  ON superprompt_templates (is_default)
  WHERE is_default = TRUE;

-- RLS Policies
ALTER TABLE superprompt_templates ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage superprompt templates"
  ON superprompt_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Clerks can read templates
CREATE POLICY "Clerks can read superprompt templates"
  ON superprompt_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_superprompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER superprompt_templates_updated_at
  BEFORE UPDATE ON superprompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_superprompt_templates_updated_at();

-- Order feedback table (for reject/revision feedback)
CREATE TABLE IF NOT EXISTS order_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL, -- 'reject', 'request_revision', 'client_revision'
  feedback_content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_feedback_order_id
  ON order_feedback (order_id);

ALTER TABLE order_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and clerk can manage order feedback"
  ON order_feedback
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Add comment
COMMENT ON TABLE superprompt_templates IS 'Stores lawyer AI motion generation templates that can be updated anytime';
COMMENT ON COLUMN superprompt_templates.template IS 'The superprompt with placeholders like {{CASE_NUMBER}}, {{STATEMENT_OF_FACTS}}, etc.';
COMMENT ON COLUMN superprompt_templates.motion_types IS 'Array of motion types this template handles. Use [''*''] for all types.';
