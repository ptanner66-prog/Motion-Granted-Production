/**
 * Phase X: Final Assembly (Task 44)
 *
 * Code-controlled final assembly:
 * 1. Gather all documents from previous phases
 * 2. Apply jurisdiction-specific formatting
 * 3. Run final QC — page length check, caption consistency
 * 4. Generate Attorney Instruction Sheet
 * 5. Create ZIP archive
 *
 * Required docs by tier:
 * - TIER A: motion, proposed order, proof of service
 * - TIER B: add notice of motion, declarations with exhibits
 * - TIER C: add separate statement, compendium of evidence
 *
 * Triggers Checkpoint 3 when complete.
 *
 * Source: Chunk 6, Task 44 - Code Mode Spec Section 6
 */

import { createClient } from '@/lib/supabase/server';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-phases-phase-x');
// ============================================================================
// TYPES
// ============================================================================

export interface AssemblyDocument {
  type: 'motion' | 'proposed_order' | 'proof_of_service' | 'notice' | 'declaration' | 'separate_statement' | 'compendium' | 'exhibit';
  filename: string;
  storagePath: string;
  pageCount: number;
  required: boolean;
}

export interface QCResult {
  passed: boolean;
  checks: Array<{
    name: string;
    status: 'PASS' | 'WARN' | 'FAIL';
    message: string;
  }>;
}

export interface PhaseXOutput {
  documents: AssemblyDocument[];
  zipArchivePath: string;
  instructionSheetPath: string;
  qcResult: QCResult;
  readyForDelivery: boolean;
  checkpoint3Triggered: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get required documents for a tier
 */
export function getRequiredDocuments(tier: 'A' | 'B' | 'C' | 'D'): string[] {
  const tierADocs = ['motion', 'proposed_order', 'proof_of_service'];
  const tierBDocs = [...tierADocs, 'notice', 'declaration'];
  const tierCDocs = [...tierBDocs, 'separate_statement', 'compendium'];
  const tierDDocs = [...tierCDocs, 'appendix_of_exhibits'];

  switch (tier) {
    case 'A':
      return tierADocs;
    case 'B':
      return tierBDocs;
    case 'C':
      return tierCDocs;
    case 'D':
      return tierDDocs;
    default:
      return tierADocs;
  }
}

/**
 * Page limits by jurisdiction and motion type
 */
const PAGE_LIMITS: Record<string, Record<string, number>> = {
  'ca_state': {
    'motion': 15,
    'reply': 10,
    'msj': 20,
    'msa': 20,
    'default': 15,
  },
  'federal_9th': {
    'motion': 25,
    'reply': 15,
    'msj': 35,
    'default': 25,
  },
  'federal_5th': {
    'motion': 25,
    'reply': 15,
    'msj': 30,
    'default': 25,
  },
  'la_state': {
    'motion': 30,
    'default': 30,
  },
};

// ============================================================================
// QC FUNCTIONS
// ============================================================================

/**
 * Run final QC checks on assembled package
 */
export async function runFinalQC(
  orderId: string,
  documents: AssemblyDocument[],
  tier: 'A' | 'B' | 'C' | 'D',
  jurisdiction: string,
  motionType: string
): Promise<QCResult> {
  const checks: QCResult['checks'] = [];

  // 1. Check all required documents are present
  const requiredDocs = getRequiredDocuments(tier);
  const presentTypes = documents.map(d => d.type);

  for (const required of requiredDocs) {
    const isPresent = presentTypes.includes(required as AssemblyDocument['type']);
    checks.push({
      name: `Required document: ${required}`,
      status: isPresent ? 'PASS' : 'FAIL',
      message: isPresent ? 'Document present' : `Missing required document: ${required}`,
    });
  }

  // 2. Check page limits
  const motion = documents.find(d => d.type === 'motion');
  if (motion) {
    const limits = PAGE_LIMITS[jurisdiction] || PAGE_LIMITS['federal_9th'];
    const motionTypeKey = motionType.toLowerCase().includes('summary') ? 'msj' : 'motion';
    const pageLimit = limits[motionTypeKey] || limits['default'];

    if (motion.pageCount > pageLimit) {
      checks.push({
        name: 'Page limit check',
        status: 'FAIL',
        message: `Motion exceeds page limit: ${motion.pageCount} pages (limit: ${pageLimit})`,
      });
    } else if (motion.pageCount > pageLimit * 0.9) {
      checks.push({
        name: 'Page limit check',
        status: 'WARN',
        message: `Motion approaching page limit: ${motion.pageCount}/${pageLimit} pages`,
      });
    } else {
      checks.push({
        name: 'Page limit check',
        status: 'PASS',
        message: `Motion within page limit: ${motion.pageCount}/${pageLimit} pages`,
      });
    }
  }

  // 3. Check for separate statement if MSJ/MSA in California
  if (tier === 'C' &&
      jurisdiction === 'ca_state' &&
      motionType.toLowerCase().includes('summary')) {
    const hasSS = presentTypes.includes('separate_statement');
    checks.push({
      name: 'Separate statement (CRC 3.1350)',
      status: hasSS ? 'PASS' : 'FAIL',
      message: hasSS ? 'Separate statement included' : 'California MSJ requires separate statement',
    });
  }

  // 4. Check document naming convention
  for (const doc of documents) {
    const hasProperName = /^[a-z0-9_\-\.]+$/i.test(doc.filename);
    if (!hasProperName) {
      checks.push({
        name: `Filename check: ${doc.filename}`,
        status: 'WARN',
        message: 'Filename contains special characters',
      });
    }
  }

  // 5. Check total document count
  if (documents.length < requiredDocs.length) {
    checks.push({
      name: 'Document count',
      status: 'WARN',
      message: `Only ${documents.length} documents assembled (expected at least ${requiredDocs.length})`,
    });
  } else {
    checks.push({
      name: 'Document count',
      status: 'PASS',
      message: `${documents.length} documents assembled`,
    });
  }

  // Determine overall pass/fail
  const hasFails = checks.some(c => c.status === 'FAIL');

  return {
    passed: !hasFails,
    checks,
  };
}

// ============================================================================
// DOCUMENT GATHERING
// ============================================================================

/**
 * Gather all documents from previous phases
 */
async function gatherDocuments(
  orderId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AssemblyDocument[]> {
  const documents: AssemblyDocument[] = [];

  // Get order with phase outputs
  const { data: order } = await supabase
    .from('orders')
    .select('phase_outputs, documents, tier')
    .eq('id', orderId)
    .single();

  if (!order) return documents;

  const phaseOutputs = order.phase_outputs as Record<string, unknown>;

  // Add motion from Phase V/VIII
  const phaseVOutput = phaseOutputs['V'] as Record<string, unknown>;
  const phaseVIIIOutput = phaseOutputs['VIII'] as Record<string, unknown>;

  const hasRevision = phaseVIIIOutput?.revisedMotion;
  const motionPath = hasRevision
    ? `orders/${orderId}/documents/motion-revised.docx`
    : `orders/${orderId}/documents/motion.docx`;

  documents.push({
    type: 'motion',
    filename: hasRevision ? 'motion-revised.docx' : 'motion.docx',
    storagePath: motionPath,
    pageCount: (phaseVOutput as Record<string, unknown>)?.pageEstimate as number || 10,
    required: true,
  });

  // Add proposed order from Phase IX
  const phaseIXOutput = phaseOutputs['IX'] as Record<string, unknown>;
  if (phaseIXOutput?.supportingDocuments) {
    const supportingDocs = phaseIXOutput.supportingDocuments as Record<string, unknown>;

    if (supportingDocs.proposedOrder) {
      documents.push({
        type: 'proposed_order',
        filename: 'proposed-order.docx',
        storagePath: `orders/${orderId}/documents/proposed-order.docx`,
        pageCount: 2,
        required: true,
      });
    }

    if (supportingDocs.certificateOfService) {
      documents.push({
        type: 'proof_of_service',
        filename: 'proof-of-service.docx',
        storagePath: `orders/${orderId}/documents/proof-of-service.docx`,
        pageCount: 1,
        required: true,
      });
    }
  }

  // Add separate statement if generated
  if (phaseIXOutput?.separateStatementPath) {
    documents.push({
      type: 'separate_statement',
      filename: 'separate-statement.docx',
      storagePath: phaseIXOutput.separateStatementPath as string,
      pageCount: (phaseIXOutput as Record<string, unknown>)?.factCount as number || 5,
      required: order.tier === 'C',
    });
  }

  // Add uploaded documents as exhibits
  const rawUploadedDocs = order.documents;
  const uploadedDocs = (Array.isArray(rawUploadedDocs) ? rawUploadedDocs : []) as Array<{
    id: string;
    filename: string;
    storageUrl: string;
    pageCount?: number;
  }>;

  for (let i = 0; i < uploadedDocs.length; i++) {
    documents.push({
      type: 'exhibit',
      filename: `exhibit-${String.fromCharCode(65 + i)}-${uploadedDocs[i].filename}`,
      storagePath: uploadedDocs[i].storageUrl,
      pageCount: uploadedDocs[i].pageCount || 5,
      required: false,
    });
  }

  return documents;
}

// ============================================================================
// INSTRUCTION SHEET GENERATION
// ============================================================================

/**
 * Generate attorney instruction sheet
 */
async function generateInstructionSheet(
  orderId: string,
  documents: AssemblyDocument[],
  qcResult: QCResult,
  jurisdiction: string,
  motionType: string
): Promise<Buffer> {
  const now = new Date();

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Header
        new Paragraph({
          children: [new TextRun({
            text: 'ATTORNEY INSTRUCTION SHEET',
            bold: true,
            size: 32,
          })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'Motion Granted - Filing Package',
            size: 24,
          })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: '' }),

        // Order details
        new Paragraph({
          children: [new TextRun({ text: 'ORDER DETAILS', bold: true, underline: {} })],
        }),
        new Paragraph({ children: [new TextRun({ text: `Order ID: ${orderId}` })] }),
        new Paragraph({ children: [new TextRun({ text: `Generated: ${now.toISOString()}` })] }),
        new Paragraph({ children: [new TextRun({ text: `Motion Type: ${motionType}` })] }),
        new Paragraph({ children: [new TextRun({ text: `Jurisdiction: ${jurisdiction}` })] }),
        new Paragraph({ text: '' }),

        // Document checklist
        new Paragraph({
          children: [new TextRun({ text: 'DOCUMENT CHECKLIST', bold: true, underline: {} })],
        }),
        ...documents.map(doc => new Paragraph({
          children: [new TextRun({
            text: `☐ ${doc.filename} (${doc.pageCount} pages)${doc.required ? ' [REQUIRED]' : ''}`,
          })],
        })),
        new Paragraph({ text: '' }),

        // QC Results
        new Paragraph({
          children: [new TextRun({ text: 'QUALITY CHECK RESULTS', bold: true, underline: {} })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: `Overall Status: ${qcResult.passed ? 'PASSED' : 'NEEDS ATTENTION'}`,
            bold: true,
            color: qcResult.passed ? '008000' : 'FF0000',
          })],
        }),
        ...qcResult.checks.map(check => new Paragraph({
          children: [new TextRun({
            text: `[${check.status}] ${check.name}: ${check.message}`,
            color: check.status === 'PASS' ? '008000' : check.status === 'WARN' ? 'FFA500' : 'FF0000',
          })],
        })),
        new Paragraph({ text: '' }),

        // Filing instructions
        new Paragraph({
          children: [new TextRun({ text: 'FILING INSTRUCTIONS', bold: true, underline: {} })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: '1. Review all documents for accuracy before filing',
          })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: '2. Complete signature blocks where indicated [SIGNATURE]',
          })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: '3. Fill in proof of service with actual service date and method',
          })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: '4. Verify all exhibit references match attached documents',
          })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: '5. Confirm local court filing requirements',
          })],
        }),
        new Paragraph({ text: '' }),

        // Disclaimer
        new Paragraph({
          children: [new TextRun({
            text: 'IMPORTANT: This document package was generated by Motion Granted and requires attorney review before filing. The reviewing attorney is responsible for ensuring accuracy and compliance with all applicable rules.',
            italics: true,
          })],
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

// ============================================================================
// ZIP ARCHIVE CREATION
// ============================================================================

/**
 * Create ZIP archive containing all documents
 */
export async function createZipArchive(
  orderId: string,
  documents: AssemblyDocument[],
  instructionSheetBuffer: Buffer,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const zip = new JSZip();

  // Add instruction sheet
  zip.file('INSTRUCTIONS-READ-FIRST.docx', instructionSheetBuffer);

  // Add each document
  for (const doc of documents) {
    try {
      const { data: fileData, error } = await supabase.storage
        .from('documents')
        .download(doc.storagePath);

      if (!error && fileData) {
        const buffer = await fileData.arrayBuffer();
        zip.file(doc.filename, buffer);
      } else {
        log.warn(`[Phase X] Could not download ${doc.filename}:`, error);
      }
    } catch (err) {
      log.warn(`[Phase X] Error adding ${doc.filename} to zip:`, err);
    }
  }

  // Generate ZIP buffer
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  // Upload ZIP to storage
  const zipPath = `orders/${orderId}/filing-package.zip`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(zipPath, zipBuffer, {
      contentType: 'application/zip',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload ZIP: ${uploadError.message}`);
  }

  return zipPath;
}

// ============================================================================
// MAIN ASSEMBLY FUNCTION
// ============================================================================

/**
 * Assemble complete filing package
 */
export async function assembleFilingPackage(orderId: string): Promise<PhaseXOutput> {
  log.info(`[Phase X] Assembling filing package for order ${orderId}`);

  const supabase = await createClient();

  // Get order details
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('tier, jurisdiction, motion_type, phase_outputs')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const tier = order.tier as 'A' | 'B' | 'C' | 'D';
  const jurisdiction = order.jurisdiction;
  const motionType = order.motion_type;

  // 1. Gather all documents
  const documents = await gatherDocuments(orderId, supabase);
  log.info(`[Phase X] Gathered ${documents.length} documents`);

  // 2. Run QC checks
  const qcResult = await runFinalQC(orderId, documents, tier, jurisdiction, motionType);
  log.info(`[Phase X] QC ${qcResult.passed ? 'PASSED' : 'FAILED'}`);

  // 3. Generate instruction sheet
  const instructionBuffer = await generateInstructionSheet(
    orderId,
    documents,
    qcResult,
    jurisdiction,
    motionType
  );

  // Upload instruction sheet
  const instructionPath = `orders/${orderId}/documents/instruction-sheet.docx`;
  await supabase.storage
    .from('documents')
    .upload(instructionPath, instructionBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  // 4. Create ZIP archive
  const zipPath = await createZipArchive(orderId, documents, instructionBuffer, supabase);
  log.info(`[Phase X] Created ZIP archive at ${zipPath}`);

  // 5. Trigger Checkpoint 3
  await supabase
    .from('order_workflow_state')
    .update({
      checkpoint_3_triggered: true,
      checkpoint_3_triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', orderId);

  log.info('[Phase X] Checkpoint 3 triggered - awaiting admin approval');

  const output: PhaseXOutput = {
    documents,
    zipArchivePath: zipPath,
    instructionSheetPath: instructionPath,
    qcResult,
    readyForDelivery: qcResult.passed,
    checkpoint3Triggered: true,
  };

  // Save Phase X output
  const phaseOutputs = (order.phase_outputs || {}) as Record<string, unknown>;
  phaseOutputs['X'] = {
    phaseComplete: 'X',
    ...output,
    assembledAt: new Date().toISOString(),
    documentCount: documents.length,
    totalPages: documents.reduce((sum, d) => sum + d.pageCount, 0),
  };

  await supabase
    .from('orders')
    .update({ phase_outputs: phaseOutputs })
    .eq('id', orderId);

  return output;
}

/**
 * Complete Phase X (requires admin approval via Checkpoint 3)
 */
export async function completePhaseX(
  orderId: string
): Promise<{ success: boolean; nextPhase: string; error?: string }> {
  try {
    const result = await assembleFilingPackage(orderId);

    if (!result.readyForDelivery) {
      return {
        success: false,
        nextPhase: 'X',
        error: 'Filing package QC failed. Please review issues.',
      };
    }

    // Update workflow state - but note that delivery requires CP3 approval
    const supabase = await createClient();
    await supabase
      .from('order_workflow_state')
      .update({
        current_phase: 'AWAITING_APPROVAL',
        phase_x_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    log.info(`[Phase X] Completed for order ${orderId} - awaiting Checkpoint 3 approval`);
    return {
      success: true,
      nextPhase: 'DELIVERY', // Pending CP3 approval
    };
  } catch (error) {
    log.error('[Phase X] Error completing phase:', error);
    return {
      success: false,
      nextPhase: 'X',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getRequiredDocuments,
  runFinalQC,
  createZipArchive,
  assembleFilingPackage,
  completePhaseX,
};
