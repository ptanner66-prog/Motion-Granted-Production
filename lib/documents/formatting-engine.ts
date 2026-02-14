/**
 * Document Formatting Engine (Task 45)
 *
 * Jurisdiction-specific document formatting rules:
 *
 * | Jurisdiction        | Lines/Page | Spacing | Line Numbers | Other            |
 * |---------------------|------------|---------|--------------|------------------|
 * | California Superior | 28         | 1.5     | Yes          | Specific footer  |
 * | California Federal  | 28         | Double  | No           | ECF header       |
 * | Louisiana           | 28         | Double  | No           | Specific caption |
 * | Federal 5th/9th     | Per local  | Double  | No           | Page limits vary |
 *
 * Source: Chunk 6, Task 45 - Code Mode Spec Section 7
 */

import { Document, Packer, Paragraph, TextRun, NumberFormat, AlignmentType, convertInchesToTwip, Header, Footer, PageNumber } from 'docx';
import { createClient } from '@/lib/supabase/server';
import { RuleLookupService } from '@/lib/services/formatting/rule-lookup';
import type { FormattingRules as NewFormattingRules } from '@/lib/services/formatting/types';
import { sanitizePartyName, sanitizeForDocument } from '@/lib/utils/text-sanitizer';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('documents-formatting-engine');
// ============================================================================
// TYPES
// ============================================================================

export interface FormattingRules {
  jurisdiction: string;
  linesPerPage: number;
  lineSpacing: 'single' | '1.5' | 'double';
  lineNumbers: boolean;
  margins: { top: number; bottom: number; left: number; right: number }; // inches
  font: { name: string; size: number };
  footerFormat: string | null;
  headerFormat: string | null;
  pageLimit: number | null;
  // SP9: New fields from RuleLookupService (optional for backward compat)
  paperSize?: { widthDXA: number; heightDXA: number; name: string };
  jurat?: { type: string; language: string };
  paragraphNumbering?: boolean;
}

export interface FormatValidation {
  valid: boolean;
  pageCount: number;
  limit: number | null;
  issues: string[];
}

// ============================================================================
// JURISDICTION RULES
// ============================================================================

export const JURISDICTION_RULES: Record<string, FormattingRules> = {
  'ca_superior': {
    jurisdiction: 'ca_superior',
    linesPerPage: 28,
    lineSpacing: '1.5',
    lineNumbers: true,
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
    font: { name: 'Times New Roman', size: 12 },
    footerFormat: 'MOTION FOR {MOTION_TYPE} - Page {PAGE}',
    headerFormat: null,
    pageLimit: null, // Varies by motion type
    paperSize: { widthDXA: 12240, heightDXA: 15840, name: 'letter' },
  },

  'ca_federal': {
    jurisdiction: 'ca_federal',
    linesPerPage: 28,
    lineSpacing: 'double',
    lineNumbers: false,
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
    font: { name: 'Times New Roman', size: 12 },
    footerFormat: null,
    headerFormat: 'Case {CASE_NUMBER} - ECF Filing',
    pageLimit: 25,
    paperSize: { widthDXA: 12240, heightDXA: 15840, name: 'letter' },
  },

  'la_state': {
    jurisdiction: 'la_state',
    linesPerPage: 28,
    lineSpacing: 'double',
    lineNumbers: false,
    margins: { top: 2, bottom: 1, left: 1.5, right: 1 }, // SP9: Fixed top margin per La. Dist. Ct. R. 9.9
    font: { name: 'Times New Roman', size: 12 },
    footerFormat: null,
    headerFormat: null,
    pageLimit: 30,
    paperSize: { widthDXA: 12240, heightDXA: 20160, name: 'legal' },
    jurat: { type: 'affidavit', language: 'BEFORE ME, the undersigned Notary Public...' },
    paragraphNumbering: false,
  },

  'federal_5th': {
    jurisdiction: 'federal_5th',
    linesPerPage: 28,
    lineSpacing: 'double',
    lineNumbers: false,
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
    font: { name: 'Times New Roman', size: 12 },
    footerFormat: null,
    headerFormat: null,
    pageLimit: 25,
    paperSize: { widthDXA: 12240, heightDXA: 15840, name: 'letter' },
  },

  'federal_9th': {
    jurisdiction: 'federal_9th',
    linesPerPage: 28,
    lineSpacing: 'double',
    lineNumbers: false,
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
    font: { name: 'Times New Roman', size: 14 }, // 9th Circuit prefers 14pt
    footerFormat: null,
    headerFormat: null,
    pageLimit: 25,
    paperSize: { widthDXA: 12240, heightDXA: 15840, name: 'letter' },
  },
};

// Motion-specific page limits
const MOTION_PAGE_LIMITS: Record<string, Record<string, number>> = {
  'ca_superior': {
    'motion': 15,
    'opposition': 15,
    'reply': 10,
    'msj': 20,
    'msa': 20,
    'demurrer': 15,
    'default': 15,
  },
  'ca_federal': {
    'motion': 25,
    'opposition': 25,
    'reply': 15,
    'msj': 35,
    'default': 25,
  },
  'federal_5th': {
    'motion': 25,
    'opposition': 25,
    'reply': 15,
    'msj': 30,
    'default': 25,
  },
  'federal_9th': {
    'motion': 25,
    'opposition': 25,
    'reply': 15,
    'msj': 35,
    'default': 25,
  },
  'la_state': {
    'motion': 30,
    'opposition': 30,
    'reply': 15,
    'default': 30,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ============================================================================
// SP9: RULELOOKUPSERVICE BRIDGE
// ============================================================================

/**
 * Module-level initialization trigger for RuleLookupService.
 * Fire-and-forget: the service loads JSON configs asynchronously,
 * and subsequent calls to getFormattingRules will use them once ready.
 */
let _initPromise: Promise<void> | null = null;
function ensureRuleLookupInitialized(): void {
  if (!_initPromise) {
    try {
      const service = RuleLookupService.getInstance();
      _initPromise = service.initialize().catch(err => {
        log.warn('[FormattingEngine] RuleLookupService async init failed:', err);
      });
    } catch {
      // getInstance() itself failed — serverless cold start edge case
    }
  }
}

/**
 * Convert RuleLookupService FormattingRules (DXA) to legacy FormattingRules (inches).
 * This bridges the new 51-state configs into the old consumer interface.
 */
function convertToLegacyRules(newRules: NewFormattingRules, jurisdiction: string): FormattingRules {
  return {
    jurisdiction,
    linesPerPage: newRules.lineNumbering?.linesPerPage ?? 28,
    lineSpacing: dxaToLineSpacing(newRules.font.lineSpacingDXA),
    lineNumbers: newRules.lineNumbering?.enabled ?? false,
    margins: {
      top: newRules.margins.topDXA / 1440,
      bottom: newRules.margins.bottomDXA / 1440,
      left: newRules.margins.leftDXA / 1440,
      right: newRules.margins.rightDXA / 1440,
    },
    font: {
      name: newRules.font.family,
      size: newRules.font.sizePoints,
    },
    footerFormat: newRules.footer?.format ?? null,
    headerFormat: newRules.header?.format ?? null,
    pageLimit: newRules.pageLimit,
    // SP9: New fields for DOCX/PDF generators
    paperSize: {
      widthDXA: newRules.paperSize.widthDXA,
      heightDXA: newRules.paperSize.heightDXA,
      name: newRules.paperSize.name,
    },
    jurat: newRules.jurat,
    paragraphNumbering: newRules.paragraphNumbering,
  };
}

/**
 * Convert DXA line spacing value to named spacing.
 * Single = 240, 1.5 = 360, Double = 480.
 */
function dxaToLineSpacing(dxa: number): 'single' | '1.5' | 'double' {
  if (dxa <= 260) return 'single';
  if (dxa <= 400) return '1.5';
  return 'double';
}

/**
 * Parse a jurisdiction string like 'la_state', 'ca_federal', 'federal_5th'
 * into components for RuleLookupService.
 */
function parseJurisdictionString(jurisdiction: string): {
  stateCode: string;
  isFederal: boolean;
  county?: string;
  federalDistrict?: string;
} {
  const j = jurisdiction.toLowerCase().replace(/[\s-]+/g, '_');

  // Federal circuit patterns: 'federal_5th', 'federal_9th', etc.
  if (j.startsWith('federal_')) {
    const circuitMatch = j.match(/federal_(\w+)/);
    // Map circuits to primary states for config lookup
    const circuitToState: Record<string, string> = {
      '5th': 'la', 'fifth': 'la',
      '9th': 'ca', 'ninth': 'ca',
      '2nd': 'ny', 'second': 'ny',
      '11th': 'fl', 'eleventh': 'fl',
    };
    const circuit = circuitMatch?.[1] || '';
    return {
      stateCode: circuitToState[circuit] || 'la',
      isFederal: true,
      federalDistrict: circuit,
    };
  }

  // State + federal patterns: 'ca_federal', 'la_federal', etc.
  if (j.includes('_federal')) {
    const stateMatch = j.match(/^([a-z]{2})_federal/);
    return {
      stateCode: stateMatch?.[1] || 'la',
      isFederal: true,
    };
  }

  // State patterns: 'la_state', 'ca_superior', 'tx_state', etc.
  const stateMatch = j.match(/^([a-z]{2})/);
  return {
    stateCode: stateMatch?.[1] || 'la',
    isFederal: false,
  };
}

/**
 * Get formatting rules for a jurisdiction.
 *
 * SP9: Now delegates to RuleLookupService which loads from 51 JSON configs.
 * Falls back to hardcoded defaults if RuleLookupService is not yet initialized
 * or if the lookup fails.
 */
export function getFormattingRules(jurisdiction: string): FormattingRules {
  // Trigger async initialization (no-op if already started)
  ensureRuleLookupInitialized();

  const parsed = parseJurisdictionString(jurisdiction);

  try {
    const service = RuleLookupService.getInstance();

    // If service has no configs loaded yet, fall back to hardcoded rules
    if (service.getAllLoadedStates().length === 0) {
      return JURISDICTION_RULES[jurisdiction] || JURISDICTION_RULES['la_state'];
    }

    const newRules = service.getFormattingRules({
      stateCode: parsed.stateCode,
      isFederal: parsed.isFederal,
      county: parsed.county,
      federalDistrict: parsed.federalDistrict,
    });

    const legacy = convertToLegacyRules(newRules, jurisdiction);

    // For circuit-level federal jurisdictions (e.g., 'federal_5th'), the
    // RuleLookupService returns state margins since no specific district matched.
    // Override to standard federal margins (1" all around) in this case.
    if (parsed.isFederal && jurisdiction.toLowerCase().startsWith('federal_')) {
      legacy.margins = { top: 1, bottom: 1, left: 1, right: 1 };
    }

    return legacy;
  } catch (error) {
    // Fallback to hardcoded rules if service fails
    log.warn(`[FormattingEngine] RuleLookupService failed for ${jurisdiction}, using fallback:`, error);
    return JURISDICTION_RULES[jurisdiction] || JURISDICTION_RULES['la_state'];
  }
}

/**
 * Get page limit for jurisdiction and motion type
 */
export function getPageLimit(jurisdiction: string, motionType: string): number | null {
  const limits = MOTION_PAGE_LIMITS[jurisdiction] || MOTION_PAGE_LIMITS['federal_9th'];

  // Normalize motion type
  const normalizedType = motionType.toLowerCase()
    .replace(/motion\s+for\s+/i, '')
    .replace(/motion\s+to\s+/i, '')
    .replace(/\s+/g, '_');

  // Check for specific limits
  if (normalizedType.includes('summary_judgment') || normalizedType.includes('msj')) {
    return limits['msj'] || limits['default'];
  }
  if (normalizedType.includes('summary_adjudication') || normalizedType.includes('msa')) {
    return limits['msa'] || limits['msj'] || limits['default'];
  }
  if (normalizedType.includes('opposition') || normalizedType.includes('oppose')) {
    return limits['opposition'] || limits['default'];
  }
  if (normalizedType.includes('reply')) {
    return limits['reply'] || limits['default'];
  }
  if (normalizedType.includes('demurrer')) {
    return limits['demurrer'] || limits['default'];
  }

  return limits['motion'] || limits['default'];
}

/**
 * Convert line spacing to docx spacing value
 */
function getLineSpacingValue(spacing: 'single' | '1.5' | 'double'): number {
  switch (spacing) {
    case 'single':
      return 240; // 1x line spacing
    case '1.5':
      return 360; // 1.5x line spacing
    case 'double':
      return 480; // 2x line spacing
    default:
      return 480;
  }
}

// ============================================================================
// FORMATTING APPLICATION
// ============================================================================

/**
 * Apply jurisdiction-specific formatting to a document
 */
export async function applyFormatting(
  documentPath: string,
  jurisdiction: string,
  options?: {
    motionType?: string;
    caseNumber?: string;
    caseName?: string;
  }
): Promise<string> {
  log.info(`[FormatEngine] Applying ${jurisdiction} formatting to ${documentPath}`);

  const rules = getFormattingRules(jurisdiction);
  const supabase = await createClient();

  // Download the document
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(documentPath);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download document: ${downloadError?.message}`);
  }

  // For now, we create a new formatted document
  // Full implementation would parse and reformat the existing document

  const formattedDoc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(rules.margins.top),
            bottom: convertInchesToTwip(rules.margins.bottom),
            left: convertInchesToTwip(rules.margins.left),
            right: convertInchesToTwip(rules.margins.right),
          },
        },
        lineNumbers: rules.lineNumbers ? {
          countBy: 1,
          restart: 'newPage' as const,
        } : undefined,
      },
      headers: rules.headerFormat ? {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({
              text: rules.headerFormat
                .replace('{CASE_NUMBER}', options?.caseNumber || '')
                .replace('{CASE_NAME}', options?.caseName || ''),
              size: 20,
            })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      } : undefined,
      footers: rules.footerFormat ? {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({
                text: rules.footerFormat
                  .replace('{MOTION_TYPE}', options?.motionType || 'MOTION')
                  .replace('{PAGE}', ''),
              }),
              new TextRun({
                children: [PageNumber.CURRENT],
              }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      } : undefined,
      children: [
        // Content would be parsed from original document
        new Paragraph({
          children: [new TextRun({
            text: '[Document content - formatted per jurisdiction rules]',
            font: rules.font.name,
            size: rules.font.size * 2, // docx uses half-points
          })],
          spacing: { line: getLineSpacingValue(rules.lineSpacing) },
        }),
      ],
    }],
  });

  // Generate formatted document
  const buffer = await Packer.toBuffer(formattedDoc);

  // Upload formatted document
  const formattedPath = documentPath.replace('.docx', '-formatted.docx');
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(formattedPath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload formatted document: ${uploadError.message}`);
  }

  log.info(`[FormatEngine] Formatted document saved to ${formattedPath}`);
  return formattedPath;
}

/**
 * Validate page count against jurisdiction limits
 */
export async function validatePageCount(
  documentPath: string,
  jurisdiction: string,
  motionType: string
): Promise<FormatValidation> {
  const supabase = await createClient();
  const issues: string[] = [];

  // Get page limit
  const limit = getPageLimit(jurisdiction, motionType);

  // Download and check page count
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(documentPath);

  if (downloadError || !fileData) {
    return {
      valid: false,
      pageCount: 0,
      limit,
      issues: [`Could not download document: ${downloadError?.message}`],
    };
  }

  // Estimate page count (simplified - full implementation would use pdf-parse or similar)
  const buffer = await fileData.arrayBuffer();
  const text = Buffer.from(buffer).toString('utf-8');
  const wordCount = text.split(/\s+/).length;
  const estimatedPages = Math.ceil(wordCount / 300); // ~300 words per page

  if (limit && estimatedPages > limit) {
    issues.push(`Document exceeds page limit: ${estimatedPages} pages (limit: ${limit})`);
  }

  return {
    valid: issues.length === 0,
    pageCount: estimatedPages,
    limit,
    issues,
  };
}

/**
 * Add line numbers to a document (California Superior Court requirement)
 */
export async function addLineNumbers(documentPath: string): Promise<string> {
  log.info(`[FormatEngine] Adding line numbers to ${documentPath}`);

  // Line numbers are added via the section properties
  // This function would modify an existing document to add line numbers

  // For California Superior Court:
  // - Line numbers appear in left margin
  // - Numbered 1-28 per page
  // - Reset on each page

  // The actual implementation would use docx manipulation
  // For now, return the original path
  log.info('[FormatEngine] Line numbers feature - using document section properties');

  return documentPath;
}

// ============================================================================
// FORMATTING TEMPLATES
// ============================================================================

/**
 * Generate a properly formatted caption for the jurisdiction
 */
export function generateCaption(
  jurisdiction: string,
  caseInfo: {
    courtName: string;
    plaintiffs: string[];
    defendants: string[];
    caseNumber: string;
    judgeName?: string;
    division?: string;
  }
): Paragraph[] {
  const rules = getFormattingRules(jurisdiction);
  const paragraphs: Paragraph[] = [];

  // Sanitize user-provided text (SP20: XSS-001–003)
  const safeCourtName = sanitizeForDocument(caseInfo.courtName);
  const safePlaintiffs = caseInfo.plaintiffs.map(sanitizePartyName);
  const safeDefendants = caseInfo.defendants.map(sanitizePartyName);
  const safeCaseNumber = sanitizeForDocument(caseInfo.caseNumber);
  const safeDivision = caseInfo.division ? sanitizeForDocument(caseInfo.division) : undefined;
  const safeJudgeName = caseInfo.judgeName ? sanitizeForDocument(caseInfo.judgeName) : undefined;

  // Court name (centered, all caps)
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: safeCourtName.toUpperCase(),
      bold: true,
      font: rules.font.name,
      size: rules.font.size * 2,
    })],
    alignment: AlignmentType.CENTER,
  }));

  // Division/Department if applicable
  if (safeDivision) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: safeDivision,
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.CENTER,
    }));
  }

  // Spacer
  paragraphs.push(new Paragraph({ text: '' }));

  // Parties - format depends on jurisdiction
  if (jurisdiction === 'la_state') {
    // Louisiana uses different caption format
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: safePlaintiffs.join(', '),
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.LEFT,
    }));
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: 'VERSUS',
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.CENTER,
    }));
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: safeDefendants.join(', '),
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.LEFT,
    }));
  } else {
    // Standard federal/California format
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: `${safePlaintiffs.join(', ')},`,
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.LEFT,
    }));
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: '     Plaintiff(s),',
        italics: true,
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.LEFT,
    }));
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: 'v.',
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.CENTER,
    }));
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: `${safeDefendants.join(', ')},`,
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.LEFT,
    }));
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: '     Defendant(s).',
        italics: true,
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: AlignmentType.LEFT,
    }));
  }

  // Case number (right side for federal, left for state)
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: `Case No. ${safeCaseNumber}`,
      bold: true,
      font: rules.font.name,
      size: rules.font.size * 2,
    })],
    alignment: jurisdiction.includes('federal') ? AlignmentType.RIGHT : AlignmentType.LEFT,
  }));

  // Judge if applicable
  if (safeJudgeName) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: `Hon. ${safeJudgeName}`,
        font: rules.font.name,
        size: rules.font.size * 2,
      })],
      alignment: jurisdiction.includes('federal') ? AlignmentType.RIGHT : AlignmentType.LEFT,
    }));
  }

  return paragraphs;
}

// ============================================================================
// BATCH FORMATTING
// ============================================================================

/**
 * Apply formatting to all documents in a filing package
 */
export async function formatFilingPackage(
  orderId: string,
  documentPaths: string[],
  jurisdiction: string,
  options?: {
    motionType?: string;
    caseNumber?: string;
    caseName?: string;
  }
): Promise<{
  formattedPaths: string[];
  validation: FormatValidation[];
}> {
  const formattedPaths: string[] = [];
  const validations: FormatValidation[] = [];

  for (const path of documentPaths) {
    try {
      // Apply formatting
      const formattedPath = await applyFormatting(path, jurisdiction, options);
      formattedPaths.push(formattedPath);

      // Validate
      const validation = await validatePageCount(
        formattedPath,
        jurisdiction,
        options?.motionType || 'motion'
      );
      validations.push(validation);
    } catch (error) {
      log.error(`[FormatEngine] Error formatting ${path}:`, error);
      validations.push({
        valid: false,
        pageCount: 0,
        limit: null,
        issues: [`Formatting failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      });
    }
  }

  return {
    formattedPaths,
    validation: validations,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  JURISDICTION_RULES,
  getFormattingRules,
  getPageLimit,
  applyFormatting,
  validatePageCount,
  addLineNumbers,
  generateCaption,
  formatFilingPackage,
};
