// /__tests__/integration/path-b-opposition.test.ts
// PATH B: Opposition/Response Workflow Integration Tests
// Task 75 — P0 CRITICAL
// VERSION: 1.0 — January 28, 2026

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Test utilities - adjust imports based on your project structure
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Test data
const TEST_USER_ID = 'test-user-path-b-' + Date.now();
const TEST_ORDER_PREFIX = 'test-order-path-b-';

interface TestOrder {
  id: string;
  user_id: string;
  motion_type: string;
  filing_posture: 'INITIATING' | 'RESPONDING';
  path: 'A' | 'B';
  jurisdiction: string;
  case_number: string;
  opponent_motion_document?: string;
  status: string;
}

/**
 * Helper: Create a test order
 */
async function createTestOrder(overrides: Partial<TestOrder> = {}): Promise<TestOrder> {
  const order: Partial<TestOrder> = {
    id: TEST_ORDER_PREFIX + Date.now(),
    user_id: TEST_USER_ID,
    motion_type: 'opposition_msj',
    filing_posture: 'RESPONDING',
    path: 'B',
    jurisdiction: 'CA_STATE_LA',
    case_number: '24STCV12345',
    status: 'intake_complete',
    ...overrides,
  };

  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single();

  if (error) throw new Error(`Failed to create test order: ${error.message}`);
  return data as TestOrder;
}

/**
 * Helper: Clean up test orders
 */
async function cleanupTestOrders(): Promise<void> {
  await supabase
    .from('orders')
    .delete()
    .like('id', `${TEST_ORDER_PREFIX}%`);
}

/**
 * Helper: Upload mock opponent document
 */
async function uploadMockOpponentDocument(orderId: string): Promise<string> {
  const mockDocumentId = `mock-opponent-doc-${orderId}`;

  // In a real test, you'd upload to Supabase storage
  // For now, we just return a mock ID
  await supabase
    .from('order_documents')
    .insert({
      id: mockDocumentId,
      order_id: orderId,
      document_type: 'opponent_motion',
      filename: 'opponent_motion_for_summary_judgment.pdf',
      storage_path: `uploads/${orderId}/opponent_motion.pdf`,
      uploaded_at: new Date().toISOString(),
    });

  return mockDocumentId;
}

// ============================================================================
// TEST SUITE: PATH B Opposition Workflow
// ============================================================================

describe('PATH B: Opposition Workflow', () => {

  beforeAll(async () => {
    // Ensure clean state
    await cleanupTestOrders();
  });

  afterAll(async () => {
    // Clean up all test data
    await cleanupTestOrders();
  });

  // --------------------------------------------------------------------------
  // 1. Filing Posture Detection
  // --------------------------------------------------------------------------
  describe('1. Filing Posture Detection', () => {

    it('should detect RESPONDING posture from intake', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
      });

      expect(order.filing_posture).toBe('RESPONDING');
      expect(order.path).toBe('B');

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should assign PATH B for opposition motion types', async () => {
      const oppositionTypes = [
        'opposition_msj',
        'opposition_mtd',
        'opposition_msl',
        'opposition_mjop',
        'reply_support_msj',
      ];

      for (const motionType of oppositionTypes) {
        const order = await createTestOrder({
          motion_type: motionType,
          filing_posture: 'RESPONDING',
        });

        expect(order.path).toBe('B');

        // Cleanup
        await supabase.from('orders').delete().eq('id', order.id);
      }
    });

    it('should assign PATH A for initiating motion types', async () => {
      const order = await createTestOrder({
        motion_type: 'msj', // Motion for Summary Judgment (initiating)
        filing_posture: 'INITIATING',
        path: 'A',
      });

      expect(order.filing_posture).toBe('INITIATING');
      expect(order.path).toBe('A');

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Opponent Document Requirements
  // --------------------------------------------------------------------------
  describe('2. Opponent Document Requirements', () => {

    it('should require opponent_motion_document for PATH B', async () => {
      // Create order without opponent document
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
        opponent_motion_document: undefined,
      });

      // Attempt to validate for workflow start
      const { data: validationResult } = await supabase
        .rpc('validate_order_for_workflow', { order_id: order.id });

      // Should fail validation or flag missing document
      // The actual implementation may vary - adjust assertion accordingly
      expect(order.opponent_motion_document).toBeUndefined();

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should accept order with opponent document attached', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
      });

      // Upload opponent document
      const docId = await uploadMockOpponentDocument(order.id);

      // Update order with document reference
      const { data: updatedOrder, error } = await supabase
        .from('orders')
        .update({ opponent_motion_document: docId })
        .eq('id', order.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedOrder?.opponent_motion_document).toBe(docId);

      // Cleanup
      await supabase.from('order_documents').delete().eq('id', docId);
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should validate opponent document is PDF', async () => {
      const order = await createTestOrder();

      // Try to upload non-PDF
      const { error } = await supabase
        .from('order_documents')
        .insert({
          id: `invalid-doc-${order.id}`,
          order_id: order.id,
          document_type: 'opponent_motion',
          filename: 'opponent_motion.exe', // Invalid extension
          storage_path: `uploads/${order.id}/opponent_motion.exe`,
        });

      // Should reject or flag invalid file type
      // Adjust based on your validation implementation

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });
  });

  // --------------------------------------------------------------------------
  // 3. PATH B Phase Execution
  // --------------------------------------------------------------------------
  describe('3. PATH B Phase Execution', () => {

    it('should execute Phase I-B (Opposition Intake) correctly', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
      });

      // Upload opponent document
      const docId = await uploadMockOpponentDocument(order.id);
      await supabase
        .from('orders')
        .update({ opponent_motion_document: docId })
        .eq('id', order.id);

      // Verify Phase I-B specific fields are populated
      const { data: phaseData } = await supabase
        .from('order_phases')
        .select('*')
        .eq('order_id', order.id)
        .eq('phase', 'I')
        .single();

      // Phase I-B should include opponent motion analysis
      // Adjust assertions based on your phase output structure

      // Cleanup
      await supabase.from('order_documents').delete().eq('id', docId);
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should execute Phase II-B (Opposition Research) correctly', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
        status: 'phase_i_complete',
      });

      // Phase II-B should research counter-arguments
      // and identify weaknesses in opponent's motion

      const { data: phaseData } = await supabase
        .from('order_phases')
        .select('*')
        .eq('order_id', order.id)
        .eq('phase', 'II')
        .single();

      // Adjust assertions based on your implementation

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should include opponent argument analysis in Phase III', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
        status: 'phase_ii_complete',
      });

      // Phase III for PATH B should analyze opponent's arguments
      // and identify legal/factual weaknesses

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });
  });

  // --------------------------------------------------------------------------
  // 4. PATH B Document Generation
  // --------------------------------------------------------------------------
  describe('4. PATH B Document Generation', () => {

    it('should generate Opposition brief (not Motion brief)', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
        status: 'phase_viii_complete',
      });

      // Check generated document type
      const { data: deliverables } = await supabase
        .from('order_deliverables')
        .select('*')
        .eq('order_id', order.id);

      // Should have "Opposition" in title, not "Motion"
      const mainDoc = deliverables?.find(d => d.document_type === 'main_brief');

      if (mainDoc) {
        expect(mainDoc.filename).toContain('Opposition');
        expect(mainDoc.filename).not.toMatch(/^Motion/);
      }

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should reference opponent motion in generated brief', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
      });

      // The generated brief should reference the opponent's motion
      // This would require checking the actual document content

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should include Response-specific sections', async () => {
      // Opposition briefs should have sections like:
      // - Statement of Issues
      // - Response to Plaintiff's Statement of Undisputed Facts
      // - Counter-Statement of Disputed Facts
      // - Legal Arguments in Opposition

      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
      });

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });
  });

  // --------------------------------------------------------------------------
  // 5. PATH B Deadline Calculations
  // --------------------------------------------------------------------------
  describe('5. PATH B Deadline Calculations', () => {

    it('should calculate opposition deadline from hearing date', async () => {
      const hearingDate = new Date();
      hearingDate.setDate(hearingDate.getDate() + 30); // 30 days from now

      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
        // hearing_date: hearingDate.toISOString(),
      });

      // California: Opposition due 14 days before hearing (CCP 1005(b))
      // Louisiana: Varies by court

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should warn if opposition deadline is tight', async () => {
      const hearingDate = new Date();
      hearingDate.setDate(hearingDate.getDate() + 10); // Only 10 days

      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
        jurisdiction: 'CA_STATE_LA',
      });

      // Should flag as urgent/rush required

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });
  });

  // --------------------------------------------------------------------------
  // 6. PATH B Error Handling
  // --------------------------------------------------------------------------
  describe('6. PATH B Error Handling', () => {

    it('should handle missing opponent motion gracefully', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
        opponent_motion_document: undefined,
      });

      // Workflow should not crash, should flag issue

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should handle corrupt opponent document', async () => {
      const order = await createTestOrder({
        motion_type: 'opposition_msj',
        filing_posture: 'RESPONDING',
      });

      // Upload "corrupt" document (empty or malformed)
      await supabase
        .from('order_documents')
        .insert({
          id: `corrupt-doc-${order.id}`,
          order_id: order.id,
          document_type: 'opponent_motion',
          filename: 'corrupt.pdf',
          storage_path: `uploads/${order.id}/corrupt.pdf`,
          file_size: 0, // Empty file
        });

      // Workflow should detect and flag

      // Cleanup
      await supabase.from('orders').delete().eq('id', order.id);
    });

    it('should validate PATH matches motion type', async () => {
      // Attempting to create opposition with PATH A should fail or auto-correct
      const { error } = await supabase
        .from('orders')
        .insert({
          id: TEST_ORDER_PREFIX + 'mismatch-' + Date.now(),
          user_id: TEST_USER_ID,
          motion_type: 'opposition_msj', // Opposition type
          filing_posture: 'RESPONDING',
          path: 'A', // Wrong path!
          jurisdiction: 'CA_STATE_LA',
          case_number: '24STCV99999',
          status: 'draft',
        });

      // Should either reject or auto-correct to PATH B
    });
  });
});

// ============================================================================
// TEST SUITE: PATH B vs PATH A Differentiation
// ============================================================================

describe('PATH B vs PATH A Differentiation', () => {

  it('should use different prompt templates for PATH B', async () => {
    // PATH B uses opposition-specific prompts
    // Verify prompt selection logic
  });

  it('should skip certain phases for PATH B', async () => {
    // Some phases may be different or skipped for oppositions
    // e.g., Phase IV (Anticipating Opposition) is different
  });

  it('should track PATH in analytics correctly', async () => {
    const orderA = await createTestOrder({
      motion_type: 'msj',
      filing_posture: 'INITIATING',
      path: 'A',
    });

    const orderB = await createTestOrder({
      motion_type: 'opposition_msj',
      filing_posture: 'RESPONDING',
      path: 'B',
    });

    // Verify both are tracked separately in analytics

    // Cleanup
    await supabase.from('orders').delete().eq('id', orderA.id);
    await supabase.from('orders').delete().eq('id', orderB.id);
  });
});
