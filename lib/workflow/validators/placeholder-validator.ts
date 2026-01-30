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
