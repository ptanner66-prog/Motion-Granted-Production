/**
 * Placeholder Validator
 *
 * Detects placeholder text that should have been replaced with actual data.
 * Used to validate motion documents before delivery.
 */

export interface PlaceholderValidationResult {
  valid: boolean;
  placeholders: string[];
  category: 'case_data' | 'attorney_data' | 'mixed' | 'none';
  details: {
    caseDataPlaceholders: string[];
    attorneyPlaceholders: string[];
  };
}

// Case data placeholder patterns
const CASE_DATA_PATTERNS = [
  /\[PARISH\s*NAME\]/gi,
  /\[JUDICIAL\s*DISTRICT\]/gi,
  /\[CASE\s*NUMBER\]/gi,
  /\[CASE\s*CAPTION\]/gi,
  /\[PLAINTIFF\]/gi,
  /\[DEFENDANT\]/gi,
  /\[PETITIONER\]/gi,
  /\[RESPONDENT\]/gi,
  /\[COURT\s*NAME\]/gi,
  /\[COURT\s*DIVISION\]/gi,
  /\[FILING\s*DEADLINE\]/gi,
  /\[HEARING\s*DATE\]/gi,
  /JOHN\s+DOE/gi,
  /JANE\s+(DOE|SMITH)/gi,
  /XXX-XX-XXXX/g,  // SSN placeholder
  /\d{2}\/\d{2}\/XXXX/g,  // Date placeholder
];

// Attorney data placeholder patterns
const ATTORNEY_PATTERNS = [
  /\[ATTORNEY\s*NAME\]/gi,
  /\[ATTORNEY\]/gi,
  /\[BAR\s*(ROLL\s*)?(NUMBER|NO\.?)\]/gi,
  /\[BAR\s*#?\]/gi,
  /\[FIRM\s*NAME\]/gi,
  /\[LAW\s*FIRM\]/gi,
  /\[ADDRESS\]/gi,
  /\[STREET\s*ADDRESS\]/gi,
  /\[CITY,?\s*STATE\s*ZIP\]/gi,
  /\[CITY\]/gi,
  /\[STATE\]/gi,
  /\[ZIP\s*(CODE)?\]/gi,
  /\[PHONE\s*(NUMBER)?\]/gi,
  /\[TELEPHONE\]/gi,
  /\[FAX\s*(NUMBER)?\]/gi,
  /\[EMAIL\s*(ADDRESS)?\]/gi,
  /\[FIRM\s*ADDRESS\]/gi,
  /\[ATTORNEY\s*FOR\s*\[.*\]\]/gi,  // Nested placeholder
];

// Signature line patterns (long underscores may indicate missing signature)
const SIGNATURE_LINE_PATTERNS = [
  /_{20,}/g,  // Very long underscores (20+)
];

/**
 * Validate that a document contains no placeholder text
 *
 * @param content - The document content to validate
 * @returns Validation result with found placeholders
 */
export function validateNoPlaceholders(content: string): PlaceholderValidationResult {
  const caseDataFound: string[] = [];
  const attorneyFound: string[] = [];

  // Check case data placeholders
  for (const pattern of CASE_DATA_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      caseDataFound.push(...matches);
    }
  }

  // Check attorney placeholders
  for (const pattern of ATTORNEY_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      attorneyFound.push(...matches);
    }
  }

  // Check for suspicious signature lines (only if no real name follows)
  // A valid signature line has underscores followed by an actual name
  const signatureLinePattern = /_{10,}\s*\n\s*([A-Z][a-zA-Z]+)/;
  const hasValidSignature = signatureLinePattern.test(content);

  // Only flag very long underscores if there's no valid signature following
  if (!hasValidSignature) {
    for (const pattern of SIGNATURE_LINE_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        // Check if this underscore is followed by a placeholder
        const underscorePattern = /_{20,}\s*\n\s*\[/;
        if (underscorePattern.test(content)) {
          attorneyFound.push('Incomplete signature block (underscores followed by placeholder)');
        }
      }
 * Validates that motion content does not contain placeholder text.
 * This is a BLOCKING check before Phase X can complete.
 *
 * CRITICAL: Motions with placeholders cannot be delivered to clients.
 * They must be sent back for revision with specific error messages.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PlaceholderValidationResult {
  valid: boolean;
  placeholders: string[];
  genericNames: string[];
  templateInstructions: string[];
  severity: 'none' | 'minor' | 'major' | 'blocking';
  summary: string;
}

// ============================================================================
// PLACEHOLDER PATTERNS
// ============================================================================

/**
 * Patterns that indicate placeholder text that MUST be replaced
 */
const BRACKETED_PLACEHOLDER_PATTERN = /\[([A-Z][A-Z\s_\-]+)\]/g;

/**
 * Common bracketed placeholders in legal documents
 */
const KNOWN_BRACKETED_PLACEHOLDERS = [
  '[PARISH NAME]',
  '[PARISH]',
  '[JUDICIAL DISTRICT]',
  '[COURT NAME]',
  '[CASE NUMBER]',
  '[CASE NO]',
  '[DIVISION]',
  '[DATE]',
  '[ADDRESS]',
  '[AMOUNT]',
  '[ATTORNEY NAME]',
  '[BAR NUMBER]',
  '[FIRM NAME]',
  '[PHONE]',
  '[EMAIL]',
  '[SIGNATURE]',
  '[PLAINTIFF NAME]',
  '[DEFENDANT NAME]',
  '[PARTY NAME]',
  '[COUNTY]',
  '[STATE]',
  '[CITY]',
];

/**
 * Generic placeholder names commonly used in templates
 */
const GENERIC_NAME_PATTERNS = [
  /\bJOHN\s+DOE\b/gi,
  /\bJANE\s+(DOE|SMITH)\b/gi,
  /\bJOHN\s+SMITH\b/gi,
  /\bRICHARD\s+ROE\b/gi,
  /\bMARY\s+ROE\b/gi,
  /\bABC\s+(CORP(ORATION)?|COMPANY|INC\.?|LLC)\b/gi,
  /\bXYZ\s+(CORP(ORATION)?|COMPANY|INC\.?|LLC)\b/gi,
  /\bACME\s+(CORP(ORATION)?|COMPANY|INC\.?|LLC)\b/gi,
  /\bSAMPLE\s+(PLAINTIFF|DEFENDANT|CLIENT|PARTY)\b/gi,
];

/**
 * Template instruction text that should not appear in final output
 */
const TEMPLATE_INSTRUCTION_PATTERNS = [
  /YOUR\s+(NAME|CLIENT|FIRM|ATTORNEY)\s+HERE/gi,
  /INSERT\s+(NAME|DATE|ADDRESS|AMOUNT|DETAILS?)\s+HERE/gi,
  /\[INSERT\s+[^\]]+\]/gi,
  /\[FILL\s+IN\s+[^\]]+\]/gi,
  /\[COMPLETE\s+[^\]]+\]/gi,
  /\[ADD\s+[^\]]+\]/gi,
  /TO\s+BE\s+(COMPLETED|FILLED|DETERMINED)/gi,
  /XXX+/g,
  /_+\s*\(.*\)\s*_+/g, // Underlines with parenthetical instructions
];

/**
 * Curly brace variable placeholders
 */
const CURLY_BRACE_PATTERN = /\{([a-z][a-z_0-9]*)\}/gi;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate that content does not contain placeholder text
 *
 * @param content - The motion content to validate (can be string or object)
 * @returns Validation result with details about any placeholders found
 */
export function validateNoPlaceholders(content: string | Record<string, unknown>): PlaceholderValidationResult {
  // Convert object to string if needed
  const textContent = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);

  const placeholders: string[] = [];
  const genericNames: string[] = [];
  const templateInstructions: string[] = [];

  // Check for bracketed placeholders
  const bracketedMatches = textContent.match(BRACKETED_PLACEHOLDER_PATTERN);
  if (bracketedMatches) {
    // Filter out allowed placeholders (like signature blocks)
    const filtered = bracketedMatches.filter(match => {
      const normalized = match.toUpperCase();
      // Allow these specific placeholders that are expected in final output
      const allowedPatterns = [
        '[CERTIFICATE OF SERVICE',
        '[ATTORNEY SIGNATURE',
        '[SIGNATURE BLOCK',
        '[TO BE SIGNED',
        '[SERVICE DETAILS',
      ];
      return !allowedPatterns.some(allowed => normalized.includes(allowed));
    });
    placeholders.push(...[...new Set(filtered)]);
  }

  // Check for known placeholders specifically
  for (const knownPlaceholder of KNOWN_BRACKETED_PLACEHOLDERS) {
    if (textContent.toUpperCase().includes(knownPlaceholder)) {
      if (!placeholders.includes(knownPlaceholder)) {
        placeholders.push(knownPlaceholder);
      }
    }
  }

  // Check for generic names
  for (const pattern of GENERIC_NAME_PATTERNS) {
    const matches = textContent.match(pattern);
    if (matches) {
      genericNames.push(...[...new Set(matches)]);
    }
  }

  // Check for template instructions
  for (const pattern of TEMPLATE_INSTRUCTION_PATTERNS) {
    const matches = textContent.match(pattern);
    if (matches) {
      templateInstructions.push(...[...new Set(matches)]);
    }
  }

  // Check for curly brace variables (but allow JSON-like content)
  const curlyMatches = textContent.match(CURLY_BRACE_PATTERN);
  if (curlyMatches) {
    // Filter out what looks like JSON keys
    const suspiciousCurly = curlyMatches.filter(match => {
      const varName = match.replace(/[{}]/g, '');
      // If it looks like a template variable (snake_case), flag it
      return varName.includes('_') && !varName.startsWith('"');
    });
    if (suspiciousCurly.length > 0) {
      placeholders.push(...[...new Set(suspiciousCurly)]);
    }
  }

  // Deduplicate
  const uniqueCaseData = [...new Set(caseDataFound)];
  const uniqueAttorney = [...new Set(attorneyFound)];
  const allPlaceholders = [...uniqueCaseData, ...uniqueAttorney];

  // Determine category
  let category: PlaceholderValidationResult['category'] = 'none';
  if (uniqueCaseData.length > 0 && uniqueAttorney.length > 0) {
    category = 'mixed';
  } else if (uniqueCaseData.length > 0) {
    category = 'case_data';
  } else if (uniqueAttorney.length > 0) {
    category = 'attorney_data';
  }

  return {
    valid: allPlaceholders.length === 0,
    placeholders: allPlaceholders,
    category,
    details: {
      caseDataPlaceholders: uniqueCaseData,
      attorneyPlaceholders: uniqueAttorney,
    },
  };
}

/**
 * Check if a signature block contains valid attorney information
 *
 * @param signatureBlock - The signature block text to validate
 * @returns true if the signature block has real data, false if it has placeholders
 */
export function validateSignatureBlock(signatureBlock: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for attorney name placeholder
  if (/\[ATTORNEY\s*NAME\]/i.test(signatureBlock)) {
    issues.push('Attorney name is a placeholder');
  }

  // Check for bar number placeholder
  if (/\[BAR\s*(ROLL\s*)?(NUMBER|NO\.?|#)?\]/i.test(signatureBlock)) {
    issues.push('Bar number is a placeholder');
  }

  // Check for firm name placeholder
  if (/\[FIRM\s*NAME\]|\[LAW\s*FIRM\]/i.test(signatureBlock)) {
    issues.push('Firm name is a placeholder');
  }

  // Check for address placeholders
  if (/\[ADDRESS\]|\[STREET\s*ADDRESS\]/i.test(signatureBlock)) {
    issues.push('Street address is a placeholder');
  }

  // Check for city/state/zip placeholders
  if (/\[CITY,?\s*STATE\s*ZIP\]|\[CITY\]|\[STATE\]|\[ZIP\]/i.test(signatureBlock)) {
    issues.push('City/State/ZIP is a placeholder');
  }

  // Check for phone placeholder
  if (/\[PHONE\s*(NUMBER)?\]|\[TELEPHONE\]/i.test(signatureBlock)) {
    issues.push('Phone number is a placeholder');
  }

  // Check for email placeholder
  if (/\[EMAIL\s*(ADDRESS)?\]/i.test(signatureBlock)) {
    issues.push('Email is a placeholder');
  }

  // Check if it has any real content (not just underscores and placeholders)
  const strippedContent = signatureBlock
    .replace(/[_\-=\s\n]/g, '')
    .replace(/\[.*?\]/g, '');

  if (strippedContent.length < 20) {
    issues.push('Signature block appears to be mostly empty or placeholders');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Extract and validate the signature block from a motion document
 *
 * @param motionContent - Full motion document content
 * @returns Validation result for the signature block
 */
export function extractAndValidateSignatureBlock(motionContent: string): {
  found: boolean;
  signatureBlock?: string;
  validation?: ReturnType<typeof validateSignatureBlock>;
} {
  // Common patterns for signature block location
  const signaturePatterns = [
    /Respectfully submitted[,.]?\s*\n([\s\S]*?)(?=\n\n|$)/i,
    /RESPECTFULLY SUBMITTED[,.]?\s*\n([\s\S]*?)(?=\n\n|$)/i,
    /_________________________\s*\n([\s\S]*?)(?=\n\n|CERTIFICATE|$)/i,
    /Attorney for\s+\w+[\s\S]*?(?=\n\n|CERTIFICATE|$)/i,
  ];

  for (const pattern of signaturePatterns) {
    const match = motionContent.match(pattern);
    if (match) {
      const signatureBlock = match[0];
      return {
        found: true,
        signatureBlock,
        validation: validateSignatureBlock(signatureBlock),
      };
    }
  }

  return { found: false };
}
  const uniquePlaceholders = [...new Set(placeholders)];
  const uniqueGenericNames = [...new Set(genericNames)];
  const uniqueTemplateInstructions = [...new Set(templateInstructions)];

  // Determine severity
  const totalIssues = uniquePlaceholders.length + uniqueGenericNames.length + uniqueTemplateInstructions.length;
  let severity: PlaceholderValidationResult['severity'] = 'none';

  if (totalIssues === 0) {
    severity = 'none';
  } else if (uniquePlaceholders.length > 0 || uniqueGenericNames.length > 0) {
    // Bracketed placeholders or generic names are BLOCKING
    severity = 'blocking';
  } else if (uniqueTemplateInstructions.length > 0) {
    severity = 'major';
  }

  // Build summary
  let summary = '';
  if (totalIssues === 0) {
    summary = 'Motion content validated - no placeholder text detected';
  } else {
    const parts: string[] = [];
    if (uniquePlaceholders.length > 0) {
      parts.push(`${uniquePlaceholders.length} bracketed placeholder(s)`);
    }
    if (uniqueGenericNames.length > 0) {
      parts.push(`${uniqueGenericNames.length} generic name(s)`);
    }
    if (uniqueTemplateInstructions.length > 0) {
      parts.push(`${uniqueTemplateInstructions.length} template instruction(s)`);
    }
    summary = `PLACEHOLDER DETECTED: ${parts.join(', ')}. Motion requires revision before delivery.`;
  }

  return {
    valid: totalIssues === 0,
    placeholders: uniquePlaceholders,
    genericNames: uniqueGenericNames,
    templateInstructions: uniqueTemplateInstructions,
    severity,
    summary,
  };
}

/**
 * Format the motion text from a structured motion object
 */
export function formatMotionToText(motion: Record<string, unknown>): string {
  if (!motion || typeof motion !== 'object') {
    return '';
  }

  const parts: string[] = [];

  // Add each section if it exists
  if (motion.caption) parts.push(String(motion.caption));
  if (motion.title) parts.push(String(motion.title));
  if (motion.introduction) parts.push(String(motion.introduction));
  if (motion.statementOfFacts) parts.push(String(motion.statementOfFacts));

  // Legal arguments is an array
  const legalArgs = motion.legalArguments as Array<{ heading?: string; content?: string }> | undefined;
  if (legalArgs && Array.isArray(legalArgs)) {
    for (const arg of legalArgs) {
      if (arg.heading) parts.push(arg.heading);
      if (arg.content) parts.push(arg.content);
    }
  }

  if (motion.conclusion) parts.push(String(motion.conclusion));
  if (motion.prayerForRelief) parts.push(String(motion.prayerForRelief));
  if (motion.signature) parts.push(String(motion.signature));
  if (motion.certificateOfService) parts.push(String(motion.certificateOfService));

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Validate a motion object (from Phase V or VIII output)
 */
export function validateMotionObject(phaseOutput: Record<string, unknown>): PlaceholderValidationResult {
  // Extract motion from phase output
  const motion = (phaseOutput?.draftMotion ?? phaseOutput?.revisedMotion ?? phaseOutput) as Record<string, unknown>;

  // Convert to text for validation
  const motionText = formatMotionToText(motion);

  // Also check the raw phase output in case there are placeholders in metadata
  const rawOutputText = JSON.stringify(phaseOutput);

  // Validate both
  const textResult = validateNoPlaceholders(motionText);
  const rawResult = validateNoPlaceholders(rawOutputText);

  // Merge results (more conservative)
  const allPlaceholders = [...new Set([...textResult.placeholders, ...rawResult.placeholders])];
  const allGenericNames = [...new Set([...textResult.genericNames, ...rawResult.genericNames])];
  const allTemplateInstructions = [...new Set([...textResult.templateInstructions, ...rawResult.templateInstructions])];

  const totalIssues = allPlaceholders.length + allGenericNames.length + allTemplateInstructions.length;
  const severity = totalIssues === 0 ? 'none' :
    (allPlaceholders.length > 0 || allGenericNames.length > 0) ? 'blocking' : 'major';

  return {
    valid: totalIssues === 0,
    placeholders: allPlaceholders,
    genericNames: allGenericNames,
    templateInstructions: allTemplateInstructions,
    severity,
    summary: totalIssues === 0
      ? 'Motion content validated - no placeholder text detected'
      : `PLACEHOLDER DETECTED: ${allPlaceholders.concat(allGenericNames).join(', ')}. Motion requires revision.`,
  };
}

/**
 * Generate revision instructions based on validation result
 */
export function generateRevisionInstructions(result: PlaceholderValidationResult): string {
  if (result.valid) {
    return 'No revisions needed - motion is ready for delivery.';
  }

  const instructions: string[] = [
    'REVISION REQUIRED: The motion contains placeholder text that must be replaced with actual case data.',
    '',
  ];

  if (result.placeholders.length > 0) {
    instructions.push('BRACKETED PLACEHOLDERS TO REPLACE:');
    result.placeholders.forEach(p => {
      instructions.push(`  - ${p} -> Replace with actual value from case data`);
    });
    instructions.push('');
  }

  if (result.genericNames.length > 0) {
    instructions.push('GENERIC NAMES TO REPLACE:');
    result.genericNames.forEach(n => {
      instructions.push(`  - "${n}" -> Replace with actual party name`);
    });
    instructions.push('');
  }

  if (result.templateInstructions.length > 0) {
    instructions.push('TEMPLATE INSTRUCTIONS TO REMOVE:');
    result.templateInstructions.forEach(t => {
      instructions.push(`  - "${t}" -> Remove or replace with actual content`);
    });
    instructions.push('');
  }

  instructions.push('Use the case data provided in the phase input to replace all placeholders.');

  return instructions.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  validateNoPlaceholders,
  validateMotionObject,
  formatMotionToText,
  generateRevisionInstructions,
};
