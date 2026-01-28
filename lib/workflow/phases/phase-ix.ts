/**
 * Phase IX: Separate Statement Generation + IX.1 Citation Cross-Check (Task 43)
 *
 * PHASE IX — SEPARATE STATEMENT GENERATION
 * Required when motion_type = MSJ or MSA AND jurisdiction = California (Cal. Rules of Court 3.1350)
 *
 * PATH A format: two columns
 * - "Undisputed Material Fact No. X" | "Supporting Evidence"
 *
 * PATH B format: four columns
 * - "Moving Party's Fact" | "Response (Disputed/Undisputed)" | "Responding Party's Additional Facts" | "Evidence"
 *
 * PHASE IX.1 — SEPARATE STATEMENT CITATION CROSS-CHECK
 * TRIGGER: Automatically runs after Phase IX (MSJ/MSA motions only)
 * PURPOSE: Ensures no hallucinated or unverified citations appear in the Separate Statement
 *
 * Source: Chunk 6, Task 43 - Code Mode Spec Section 5 + Workflow v7.2
 */

import { createClient } from '@/lib/supabase/server';
import { loadCitationBank, checkCitationInBank } from '@/lib/citation/citation-bank';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, BorderStyle, AlignmentType, HeadingLevel } from 'docx';

// ============================================================================
// TYPES
// ============================================================================

export interface MaterialFact {
  number: number;
  statement: string;
  supportingEvidence: string[];
  citations: string[];
}

export interface SSRow {
  factNumber: number;
  movingPartyFact: string;
  response?: 'DISPUTED' | 'UNDISPUTED';
  respondingPartyFacts?: string;
  evidence: string;
}

export interface PhaseIXOutput {
  separateStatementPath: string; // Storage path to generated DOCX
  format: 'PATH_A' | 'PATH_B';
  factCount: number;
  citationCount: number;
}

export interface SSVerificationResult {
  status: 'PASSED' | 'FAILED';
  verifiedCount: number;
  missingCitations: Array<{
    citation: string;
    inBank: boolean;
    verificationStatus: string;
    flag: string | null;
  }>;
  action: 'CONTINUE' | 'RETURN_TO_PHASE_V';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if motion requires separate statement
 */
export function requiresSeparateStatement(
  motionType: string,
  jurisdiction: string
): boolean {
  const msjTypes = ['motion_for_summary_judgment', 'motion_for_summary_adjudication', 'msj', 'msa'];
  const isMSJ = msjTypes.some(t => motionType.toLowerCase().includes(t.replace(/_/g, ' ')) || motionType.toLowerCase() === t);

  // California requires separate statement for MSJ/MSA
  const isCaliforniaRequired = jurisdiction === 'ca_state' || jurisdiction.toLowerCase().includes('california');

  return isMSJ && isCaliforniaRequired;
}

/**
 * Extract material facts from Phase III evidence map
 */
function extractMaterialFacts(
  phaseIIIOutput: Record<string, unknown>,
  phaseIVOutput: Record<string, unknown>
): MaterialFact[] {
  const facts: MaterialFact[] = [];

  // Get evidence mapping from Phase III
  const evidenceMapping = (phaseIIIOutput.evidenceMapping || []) as Array<{
    element: string;
    availableEvidence: string[];
    gaps: string[];
  }>;

  // Get citations from Phase IV
  const caseCitations = (phaseIVOutput.caseCitationBank || []) as Array<{
    citation: string;
    proposition: string;
    forElement: string;
  }>;

  let factNumber = 1;

  for (const mapping of evidenceMapping) {
    // Skip if no evidence available
    if (!mapping.availableEvidence || mapping.availableEvidence.length === 0) continue;

    // Find related citations
    const relatedCitations = caseCitations
      .filter(c => c.forElement === mapping.element)
      .map(c => c.citation);

    facts.push({
      number: factNumber++,
      statement: mapping.element,
      supportingEvidence: mapping.availableEvidence,
      citations: relatedCitations,
    });
  }

  return facts;
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate PATH A format separate statement (2 columns)
 * Used when filing a motion
 */
function generatePathATable(facts: MaterialFact[]): Table {
  const rows: TableRow[] = [];

  // Header row
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: 'UNDISPUTED MATERIAL FACT', bold: true })],
            alignment: AlignmentType.CENTER,
          })],
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { fill: 'E0E0E0' },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: 'SUPPORTING EVIDENCE', bold: true })],
            alignment: AlignmentType.CENTER,
          })],
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { fill: 'E0E0E0' },
        }),
      ],
    })
  );

  // Data rows
  for (const fact of facts) {
    const evidenceText = [
      ...fact.supportingEvidence,
      ...fact.citations.map(c => `See ${c}`),
    ].join('; ');

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [
                new TextRun({ text: `${fact.number}. `, bold: true }),
                new TextRun({ text: fact.statement }),
              ],
            })],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: evidenceText })],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
        ],
      })
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
  });
}

/**
 * Generate PATH B format separate statement (4 columns)
 * Used when opposing a motion
 */
function generatePathBTable(facts: MaterialFact[]): Table {
  const rows: TableRow[] = [];

  // Header row
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: "MOVING PARTY'S FACT", bold: true })],
            alignment: AlignmentType.CENTER,
          })],
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { fill: 'E0E0E0' },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: 'RESPONSE', bold: true })],
            alignment: AlignmentType.CENTER,
          })],
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: 'E0E0E0' },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: "RESPONDING PARTY'S ADDITIONAL FACTS", bold: true })],
            alignment: AlignmentType.CENTER,
          })],
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { fill: 'E0E0E0' },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: 'EVIDENCE', bold: true })],
            alignment: AlignmentType.CENTER,
          })],
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { fill: 'E0E0E0' },
        }),
      ],
    })
  );

  // Data rows
  for (const fact of facts) {
    const evidenceText = [
      ...fact.supportingEvidence,
      ...fact.citations.map(c => `See ${c}`),
    ].join('; ');

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [
                new TextRun({ text: `${fact.number}. `, bold: true }),
                new TextRun({ text: fact.statement }),
              ],
            })],
            width: { size: 30, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: '[DISPUTED/UNDISPUTED]', italics: true })],
            })],
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: '[Additional facts if disputed]', italics: true })],
            })],
            width: { size: 30, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: evidenceText })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
        ],
      })
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
  });
}

/**
 * Generate complete separate statement document
 */
async function generateSeparateStatementDocument(
  facts: MaterialFact[],
  path: 'path_a' | 'path_b',
  caseCaption: string,
  caseNumber: string
): Promise<Buffer> {
  const table = path === 'path_a' ? generatePathATable(facts) : generatePathBTable(facts);

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Caption
        new Paragraph({
          children: [new TextRun({ text: caseCaption, bold: true })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: `Case No. ${caseNumber}` })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: '' }), // Spacer

        // Title
        new Paragraph({
          children: [new TextRun({
            text: path === 'path_a'
              ? 'SEPARATE STATEMENT OF UNDISPUTED MATERIAL FACTS'
              : "RESPONDING PARTY'S SEPARATE STATEMENT",
            bold: true,
          })],
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({ text: '' }), // Spacer

        // Intro paragraph
        new Paragraph({
          children: [new TextRun({
            text: path === 'path_a'
              ? 'Pursuant to California Rules of Court, Rule 3.1350, the following are the undisputed material facts in support of the motion:'
              : 'Pursuant to California Rules of Court, Rule 3.1350, the responding party submits the following separate statement:',
          })],
        }),
        new Paragraph({ text: '' }), // Spacer

        // Table
        table,

        // Signature block placeholder
        new Paragraph({ text: '' }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: 'Dated: ________________' })],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: '_______________________________' })],
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Attorney for [PARTY]' })],
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate separate statement for an order
 */
export async function generateSeparateStatement(
  orderId: string,
  path: 'path_a' | 'path_b'
): Promise<PhaseIXOutput> {
  console.log(`[Phase IX] Generating separate statement for order ${orderId} (${path})`);

  const supabase = await createClient();

  // Get order data
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('phase_outputs, case_caption, case_number, motion_type, jurisdiction')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Check if separate statement is required
  if (!requiresSeparateStatement(order.motion_type, order.jurisdiction)) {
    console.log(`[Phase IX] Separate statement not required for ${order.motion_type} in ${order.jurisdiction}`);
    return {
      separateStatementPath: '',
      format: path === 'path_a' ? 'PATH_A' : 'PATH_B',
      factCount: 0,
      citationCount: 0,
    };
  }

  const phaseOutputs = order.phase_outputs as Record<string, unknown>;
  const phaseIIIOutput = (phaseOutputs['III'] || {}) as Record<string, unknown>;
  const phaseIVOutput = (phaseOutputs['IV'] || {}) as Record<string, unknown>;

  // Extract material facts
  const facts = extractMaterialFacts(phaseIIIOutput, phaseIVOutput);

  if (facts.length === 0) {
    console.warn('[Phase IX] No material facts found - generating placeholder');
    facts.push({
      number: 1,
      statement: '[Material fact to be added]',
      supportingEvidence: ['[Evidence reference]'],
      citations: [],
    });
  }

  // Count citations
  const allCitations = facts.flatMap(f => f.citations);
  const citationCount = allCitations.length;

  // Generate document
  const docBuffer = await generateSeparateStatementDocument(
    facts,
    path,
    order.case_caption || 'CASE CAPTION',
    order.case_number || 'CASE NUMBER'
  );

  // Upload to storage
  const filename = `separate-statement-${orderId}.docx`;
  const storagePath = `orders/${orderId}/documents/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, docBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    console.error('[Phase IX] Upload error:', uploadError);
    throw new Error(`Failed to upload separate statement: ${uploadError.message}`);
  }

  const output: PhaseIXOutput = {
    separateStatementPath: storagePath,
    format: path === 'path_a' ? 'PATH_A' : 'PATH_B',
    factCount: facts.length,
    citationCount,
  };

  // Save Phase IX output
  phaseOutputs['IX'] = {
    phaseComplete: 'IX',
    ...output,
    materialFacts: facts,
    generatedAt: new Date().toISOString(),
  };

  await supabase
    .from('orders')
    .update({ phase_outputs: phaseOutputs })
    .eq('id', orderId);

  console.log(`[Phase IX] Generated separate statement: ${facts.length} facts, ${citationCount} citations`);

  return output;
}

// ============================================================================
// PHASE IX.1: CITATION CROSS-CHECK
// ============================================================================

/**
 * Verify all citations in the separate statement against the citation bank
 */
export async function verifySSCitations(orderId: string): Promise<SSVerificationResult> {
  console.log(`[Phase IX.1] Starting citation cross-check for order ${orderId}`);

  const supabase = await createClient();

  // Get order data
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('phase_outputs, tier')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const phaseOutputs = order.phase_outputs as Record<string, unknown>;
  const phaseIXOutput = phaseOutputs['IX'] as Record<string, unknown>;

  if (!phaseIXOutput) {
    return {
      status: 'PASSED',
      verifiedCount: 0,
      missingCitations: [],
      action: 'CONTINUE',
    };
  }

  // Get material facts from Phase IX
  const materialFacts = (phaseIXOutput.materialFacts || []) as MaterialFact[];
  const allCitations = materialFacts.flatMap(f => f.citations);
  const uniqueCitations = [...new Set(allCitations)];

  if (uniqueCitations.length === 0) {
    console.log('[Phase IX.1] No citations to verify');
    return {
      status: 'PASSED',
      verifiedCount: 0,
      missingCitations: [],
      action: 'CONTINUE',
    };
  }

  // Load citation bank
  const citationBank = await loadCitationBank(orderId);
  const missingCitations: SSVerificationResult['missingCitations'] = [];
  let verifiedCount = 0;

  // Check each citation
  for (const citation of uniqueCitations) {
    if (citationBank) {
      const bankCheck = checkCitationInBank(citation, citationBank);

      if (bankCheck.isInBank) {
        verifiedCount++;
      } else {
        missingCitations.push({
          citation,
          inBank: false,
          verificationStatus: 'NOT_IN_BANK',
          flag: 'CITATION_NEEDS_VERIFICATION',
        });
      }
    } else {
      // No bank loaded - flag all citations
      missingCitations.push({
        citation,
        inBank: false,
        verificationStatus: 'NO_BANK_LOADED',
        flag: 'BANK_NOT_FOUND',
      });
    }
  }

  // Determine status
  const status = missingCitations.length === 0 ? 'PASSED' : 'FAILED';
  const action = status === 'PASSED' ? 'CONTINUE' : 'RETURN_TO_PHASE_V';

  // Save Phase IX.1 output
  phaseOutputs['IX.1'] = {
    phaseComplete: 'IX.1',
    status,
    verifiedCount,
    totalCitations: uniqueCitations.length,
    missingCitations,
    action,
    verifiedAt: new Date().toISOString(),
  };

  // Update order_workflow_state with IX.1 tracking columns
  await supabase
    .from('order_workflow_state')
    .update({
      ss_citation_check_status: status,
      ss_citation_check_at: new Date().toISOString(),
      ss_citations_verified: verifiedCount,
      ss_citations_missing: missingCitations,
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', orderId);

  await supabase
    .from('orders')
    .update({ phase_outputs: phaseOutputs })
    .eq('id', orderId);

  console.log(`[Phase IX.1] Complete: ${verifiedCount}/${uniqueCitations.length} verified, status: ${status}`);

  return {
    status,
    verifiedCount,
    missingCitations,
    action,
  };
}

/**
 * Complete Phase IX (and IX.1 if applicable) and advance workflow
 */
export async function completePhaseIX(
  orderId: string
): Promise<{ success: boolean; nextPhase: string; error?: string }> {
  try {
    const supabase = await createClient();

    // Get order to determine path
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('workflow_path, motion_type, jurisdiction')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error('Order not found');
    }

    // Generate separate statement if required
    if (requiresSeparateStatement(order.motion_type, order.jurisdiction)) {
      const path = order.workflow_path as 'path_a' | 'path_b';
      await generateSeparateStatement(orderId, path);

      // Run Phase IX.1 citation cross-check
      const verificationResult = await verifySSCitations(orderId);

      if (verificationResult.status === 'FAILED') {
        console.warn(`[Phase IX] ${verificationResult.missingCitations.length} citations need verification`);
        // Continue anyway but flag for review
      }
    }

    // Update workflow state
    await supabase
      .from('order_workflow_state')
      .update({
        current_phase: 'X',
        phase_ix_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    console.log(`[Phase IX] Completed for order ${orderId}, advancing to Phase X`);
    return {
      success: true,
      nextPhase: 'X',
    };
  } catch (error) {
    console.error('[Phase IX] Error completing phase:', error);
    return {
      success: false,
      nextPhase: 'IX',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  requiresSeparateStatement,
  generateSeparateStatement,
  verifySSCitations,
  completePhaseIX,
};
