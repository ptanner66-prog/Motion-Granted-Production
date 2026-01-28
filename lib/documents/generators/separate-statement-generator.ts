/**
 * Separate Statement Generator (Task 18)
 *
 * Generates Separate Statement of Undisputed/Disputed Facts
 * for MSJ/MSA motions with evidence validation.
 *
 * Per California Rules of Court 3.1350:
 * - (a) Format requirements
 * - (b) Two-column format (fact | evidence)
 * - (c) Every fact MUST have at least one supporting evidence citation
 * - (d) Response format for opposition
 *
 * Source: Chen Legal & Compliance Megaprompt - Task 18
 * VERSION: 1.0 — January 28, 2026
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  HeadingLevel,
} from 'docx';
import { createClient } from '@/lib/supabase/server';
import { JURISDICTION_RULES } from '@/lib/documents/formatting-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface EvidenceCitation {
  /** Reference to exhibit (e.g., "Exhibit A", "Deposition of Smith, 45:10-15") */
  reference: string;
  /** Description of the evidence */
  description: string;
  /** Page/line references if applicable */
  pageLines?: string;
}

export interface MaterialFact {
  /** Unique fact number */
  number: number;
  /** The material fact statement */
  statement: string;
  /** Supporting evidence citations - REQUIRED per CRC 3.1350(c) */
  supportingEvidence: EvidenceCitation[];
  /** Whether this fact is disputed (for opposition separate statements) */
  disputed?: boolean;
  /** If disputed, the response/dispute explanation */
  disputeResponse?: string;
  /** Evidence supporting the dispute (for opposition) */
  disputeEvidence?: EvidenceCitation[];
}

export interface SeparateStatementData {
  orderId: string;
  jurisdiction: string;
  isOpposition: boolean;
  motionType: 'MSJ' | 'MSA';
  materialFacts: MaterialFact[];
  caseCaption?: {
    caseNumber: string;
    plaintiffs: string[];
    defendants: string[];
    courtName: string;
  };
  movingParty?: string;
  respondingParty?: string;
}

export interface SeparateStatementResult {
  path: string;
  pageCount: number;
  factCount: number;
  evidenceCount: number;
  validationPassed: boolean;
  validationErrors: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// CRC 3.1350(c) EVIDENCE VALIDATION
// ============================================================================

/**
 * Validate that every fact has at least one supporting evidence citation
 * per California Rules of Court 3.1350(c)
 *
 * @param facts - Array of material facts to validate
 * @returns ValidationResult with errors for any facts missing evidence
 */
export function validateEvidence(facts: MaterialFact[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (facts.length === 0) {
    errors.push('Separate statement must contain at least one material fact');
    return { valid: false, errors, warnings };
  }

  for (const fact of facts) {
    // CRC 3.1350(c): Each material fact must have supporting evidence
    if (!fact.supportingEvidence || fact.supportingEvidence.length === 0) {
      errors.push(
        `Fact #${fact.number}: No supporting evidence citation. ` +
        `Per CRC 3.1350(c), every fact must cite at least one piece of supporting evidence.`
      );
    }

    // Validate evidence citations have required fields
    for (let i = 0; i < (fact.supportingEvidence?.length || 0); i++) {
      const evidence = fact.supportingEvidence[i];
      if (!evidence.reference || evidence.reference.trim() === '') {
        errors.push(
          `Fact #${fact.number}, Evidence #${i + 1}: Missing evidence reference`
        );
      }
    }

    // Validate fact statement is not empty
    if (!fact.statement || fact.statement.trim() === '') {
      errors.push(`Fact #${fact.number}: Material fact statement cannot be empty`);
    }

    // Warning for very long fact statements (may need splitting)
    if (fact.statement && fact.statement.length > 500) {
      warnings.push(
        `Fact #${fact.number}: Statement exceeds 500 characters. ` +
        `Consider breaking into multiple discrete facts for clarity.`
      );
    }

    // For disputed facts in opposition, validate dispute evidence exists
    if (fact.disputed && (!fact.disputeEvidence || fact.disputeEvidence.length === 0)) {
      warnings.push(
        `Fact #${fact.number}: Disputed but no controverting evidence cited. ` +
        `Consider adding evidence to support the dispute.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Pre-generation validation check
 * Called before document generation to ensure compliance
 */
export function validateSeparateStatement(data: SeparateStatementData): ValidationResult {
  const baseValidation = validateEvidence(data.materialFacts);
  const errors = [...baseValidation.errors];
  const warnings = [...baseValidation.warnings];

  // Additional validation checks
  if (!data.jurisdiction) {
    errors.push('Jurisdiction is required');
  }

  if (!data.motionType) {
    errors.push('Motion type (MSJ or MSA) is required');
  }

  // Check for duplicate fact numbers
  const factNumbers = data.materialFacts.map(f => f.number);
  const duplicates = factNumbers.filter((n, i) => factNumbers.indexOf(n) !== i);
  if (duplicates.length > 0) {
    errors.push(`Duplicate fact numbers found: ${[...new Set(duplicates)].join(', ')}`);
  }

  // Verify facts are numbered sequentially starting from 1
  const sortedNumbers = [...factNumbers].sort((a, b) => a - b);
  for (let i = 0; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] !== i + 1) {
      warnings.push(`Fact numbering is not sequential. Expected ${i + 1}, found ${sortedNumbers[i]}`);
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

/**
 * Generate caption paragraphs
 */
function generateCaption(
  caption: SeparateStatementData['caseCaption']
): Paragraph[] {
  if (!caption) return [];

  const paragraphs: Paragraph[] = [];

  // Court name
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: caption.courtName.toUpperCase(), bold: true })],
      alignment: AlignmentType.CENTER,
    })
  );

  // Parties
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caption.plaintiffs.join(', ').toUpperCase() }),
        new TextRun({ text: ',' }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { before: 200 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Plaintiff(s),' })],
      indent: { left: convertInchesToTwip(2) },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'v.' })],
      alignment: AlignmentType.CENTER,
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: caption.defendants.join(', ').toUpperCase() }),
        new TextRun({ text: ',' }),
      ],
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Defendant(s).' })],
      indent: { left: convertInchesToTwip(2) },
    })
  );

  // Case number
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: `Case No. ${caption.caseNumber}`, bold: true })],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200, after: 400 },
    })
  );

  return paragraphs;
}

/**
 * Create the two-column table row for a material fact
 * Per CRC 3.1350(b): Column 1 = Fact, Column 2 = Evidence
 */
function createFactRow(fact: MaterialFact, isOpposition: boolean): TableRow {
  // Build fact content
  const factContent: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: `${fact.number}. `, bold: true }),
        new TextRun({ text: fact.statement }),
      ],
    }),
  ];

  // For opposition, add dispute status and response
  if (isOpposition && fact.disputed !== undefined) {
    factContent.push(
      new Paragraph({
        children: [
          new TextRun({
            text: fact.disputed ? 'DISPUTED' : 'UNDISPUTED',
            bold: true,
            color: fact.disputed ? 'CC0000' : '006600',
          }),
        ],
        spacing: { before: 200 },
      })
    );

    if (fact.disputed && fact.disputeResponse) {
      factContent.push(
        new Paragraph({
          children: [new TextRun({ text: fact.disputeResponse, italics: true })],
        })
      );
    }
  }

  // Build evidence content
  const evidenceContent: Paragraph[] = [];

  // Supporting evidence (for moving party facts)
  for (const evidence of fact.supportingEvidence) {
    evidenceContent.push(
      new Paragraph({
        children: [
          new TextRun({ text: evidence.reference, bold: true }),
          evidence.pageLines ? new TextRun({ text: ` (${evidence.pageLines})` }) : new TextRun({ text: '' }),
        ],
      })
    );
    if (evidence.description) {
      evidenceContent.push(
        new Paragraph({
          children: [new TextRun({ text: evidence.description, size: 20 })],
          indent: { left: convertInchesToTwip(0.25) },
        })
      );
    }
  }

  // Dispute evidence (for opposition)
  if (isOpposition && fact.disputed && fact.disputeEvidence && fact.disputeEvidence.length > 0) {
    evidenceContent.push(
      new Paragraph({
        children: [new TextRun({ text: 'Controverting Evidence:', bold: true, color: 'CC0000' })],
        spacing: { before: 200 },
      })
    );

    for (const evidence of fact.disputeEvidence) {
      evidenceContent.push(
        new Paragraph({
          children: [
            new TextRun({ text: evidence.reference, bold: true }),
            evidence.pageLines ? new TextRun({ text: ` (${evidence.pageLines})` }) : new TextRun({ text: '' }),
          ],
        })
      );
      if (evidence.description) {
        evidenceContent.push(
          new Paragraph({
            children: [new TextRun({ text: evidence.description, size: 20 })],
            indent: { left: convertInchesToTwip(0.25) },
          })
        );
      }
    }
  }

  // Ensure at least one paragraph in evidence column
  if (evidenceContent.length === 0) {
    evidenceContent.push(
      new Paragraph({
        children: [new TextRun({ text: '[NO EVIDENCE CITED]', color: 'CC0000', italics: true })],
      })
    );
  }

  return new TableRow({
    children: [
      new TableCell({
        width: { size: 55, type: WidthType.PERCENTAGE },
        children: factContent,
        margins: {
          top: convertInchesToTwip(0.1),
          bottom: convertInchesToTwip(0.1),
          left: convertInchesToTwip(0.1),
          right: convertInchesToTwip(0.1),
        },
      }),
      new TableCell({
        width: { size: 45, type: WidthType.PERCENTAGE },
        children: evidenceContent,
        margins: {
          top: convertInchesToTwip(0.1),
          bottom: convertInchesToTwip(0.1),
          left: convertInchesToTwip(0.1),
          right: convertInchesToTwip(0.1),
        },
      }),
    ],
  });
}

/**
 * Create header row for the two-column table
 */
function createHeaderRow(): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 55, type: WidthType.PERCENTAGE },
        shading: { fill: 'E0E0E0' },
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'MATERIAL FACT', bold: true })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        margins: {
          top: convertInchesToTwip(0.05),
          bottom: convertInchesToTwip(0.05),
          left: convertInchesToTwip(0.1),
          right: convertInchesToTwip(0.1),
        },
      }),
      new TableCell({
        width: { size: 45, type: WidthType.PERCENTAGE },
        shading: { fill: 'E0E0E0' },
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'SUPPORTING EVIDENCE', bold: true })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        margins: {
          top: convertInchesToTwip(0.05),
          bottom: convertInchesToTwip(0.05),
          left: convertInchesToTwip(0.1),
          right: convertInchesToTwip(0.1),
        },
      }),
    ],
  });
}

/**
 * Generate the separate statement document
 */
function generateSeparateStatementDocument(data: SeparateStatementData): Document {
  const rules = JURISDICTION_RULES['ca_superior'] || JURISDICTION_RULES['ca_state'];
  const children: (Paragraph | Table)[] = [];

  // Caption
  if (data.caseCaption) {
    children.push(...generateCaption(data.caseCaption));
  }

  // Document title
  const motionTypeText = data.motionType === 'MSJ'
    ? 'SUMMARY JUDGMENT'
    : 'SUMMARY ADJUDICATION';

  const titleText = data.isOpposition
    ? `RESPONDING PARTY'S SEPARATE STATEMENT OF DISPUTED AND UNDISPUTED MATERIAL FACTS IN OPPOSITION TO MOTION FOR ${motionTypeText}`
    : `MOVING PARTY'S SEPARATE STATEMENT OF UNDISPUTED MATERIAL FACTS IN SUPPORT OF MOTION FOR ${motionTypeText}`;

  children.push(
    new Paragraph({
      children: [new TextRun({ text: titleText, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );

  // CRC 3.1350 reference
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '[Pursuant to California Rules of Court, Rule 3.1350]',
          italics: true,
          size: 20,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Introductory paragraph
  if (data.isOpposition) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${data.respondingParty || 'Responding Party'} hereby submits the following separate statement in opposition to the motion for ${motionTypeText.toLowerCase()} filed by ${data.movingParty || 'Moving Party'}:`,
          }),
        ],
        spacing: { after: 400 },
      })
    );
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${data.movingParty || 'Moving Party'} hereby submits the following separate statement of undisputed material facts in support of the motion for ${motionTypeText.toLowerCase()}:`,
          }),
        ],
        spacing: { after: 400 },
      })
    );
  }

  // Create the two-column fact/evidence table
  const tableRows: TableRow[] = [createHeaderRow()];

  for (const fact of data.materialFacts) {
    tableRows.push(createFactRow(fact, data.isOpposition));
  }

  const factsTable = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4 },
      bottom: { style: BorderStyle.SINGLE, size: 4 },
      left: { style: BorderStyle.SINGLE, size: 4 },
      right: { style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2 },
      insideVertical: { style: BorderStyle.SINGLE, size: 2 },
    },
  });

  children.push(factsTable);

  // Signature block
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Dated: _______________' })],
      spacing: { before: 600 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Respectfully submitted,' })],
      spacing: { before: 200, after: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: '________________________________' })],
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: '[ATTORNEY NAME]' })],
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Attorney for ${data.isOpposition ? data.respondingParty || 'Responding Party' : data.movingParty || 'Moving Party'}` })],
    })
  );

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(rules?.margins?.top || 1),
            bottom: convertInchesToTwip(rules?.margins?.bottom || 0.5),
            left: convertInchesToTwip(rules?.margins?.left || 1),
            right: convertInchesToTwip(rules?.margins?.right || 1),
          },
        },
      },
      children,
    }],
  });
}

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate Separate Statement document with CRC 3.1350(c) evidence validation
 */
export async function generateSeparateStatement(
  data: SeparateStatementData
): Promise<SeparateStatementResult> {
  console.log(`[SeparateStatement] Generating for order ${data.orderId}`);

  // Run CRC 3.1350(c) evidence validation
  const validation = validateSeparateStatement(data);

  if (validation.warnings.length > 0) {
    console.warn('[SeparateStatement] Validation warnings:', validation.warnings);
  }

  if (!validation.valid) {
    console.error('[SeparateStatement] Validation errors:', validation.errors);
    // Return result with validation errors but don't throw
    // This allows the UI to show the errors to the user
    return {
      path: '',
      pageCount: 0,
      factCount: data.materialFacts.length,
      evidenceCount: data.materialFacts.reduce((sum, f) => sum + (f.supportingEvidence?.length || 0), 0),
      validationPassed: false,
      validationErrors: validation.errors,
    };
  }

  // Generate document
  const document = generateSeparateStatementDocument(data);
  const buffer = await Packer.toBuffer(document);

  // Save to storage
  const supabase = await createClient();
  const fileName = `separate_statement_${Date.now()}.docx`;
  const storagePath = `orders/${data.orderId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    console.error('[SeparateStatement] Upload error:', uploadError);
    throw new Error(`Failed to upload separate statement: ${uploadError.message}`);
  }

  // Calculate stats
  const factCount = data.materialFacts.length;
  const evidenceCount = data.materialFacts.reduce(
    (sum, f) => sum + (f.supportingEvidence?.length || 0) + (f.disputeEvidence?.length || 0),
    0
  );

  // Estimate page count (rough: header + ~3 facts per page)
  const estimatedPageCount = Math.max(1, Math.ceil(factCount / 3) + 1);

  console.log(`[SeparateStatement] Generated successfully: ${storagePath}`);
  console.log(`[SeparateStatement] Facts: ${factCount}, Evidence citations: ${evidenceCount}`);

  return {
    path: storagePath,
    pageCount: estimatedPageCount,
    factCount,
    evidenceCount,
    validationPassed: true,
    validationErrors: [],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateSeparateStatement,
  validateEvidence,
  validateSeparateStatement,
};
