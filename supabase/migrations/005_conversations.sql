-- ============================================================================
-- Conversations Table for Claude Chat
-- ============================================================================
-- Stores chat conversations between admin and Claude for each order.
-- Each order has one conversation that persists across revisions.

-- Main conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Conversation state
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),

  -- The initial context sent to Claude (superprompt + order data + docs)
  initial_context TEXT,

  -- Generated motion content (latest version)
  generated_motion TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One conversation per order
  UNIQUE(order_id)
);

-- Messages within a conversation
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Message details
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,

  -- For tracking which message contains the motion draft
  is_motion_draft BOOLEAN DEFAULT FALSE,

  -- Token usage tracking
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- Ordering
  sequence_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Client revision requests
CREATE TABLE IF NOT EXISTS revision_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Client's feedback
  feedback TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),

  -- Admin notes
  admin_response TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_order_id ON conversations(order_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_sequence ON conversation_messages(conversation_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_revision_requests_order_id ON revision_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_revision_requests_status ON revision_requests(status);

-- RLS Policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_requests ENABLE ROW LEVEL SECURITY;

-- Admins can see all conversations
CREATE POLICY "Admins can manage conversations" ON conversations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Admins can see all messages
CREATE POLICY "Admins can manage messages" ON conversation_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Clients can create revision requests for their orders
CREATE POLICY "Clients can create revision requests" ON revision_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = revision_requests.order_id
      AND orders.client_id = auth.uid()
    )
  );

-- Clients can view their own revision requests
CREATE POLICY "Clients can view own revision requests" ON revision_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = revision_requests.order_id
      AND orders.client_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Admins can manage all revision requests
CREATE POLICY "Admins can manage revision requests" ON revision_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Update trigger for conversations
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();
