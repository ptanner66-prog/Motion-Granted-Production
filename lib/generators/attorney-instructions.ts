/**
 * Attorney Instructions Generator
 *
 * Generates the INTERNAL (non-filed) instruction document that
 * accompanies every filing package. Includes review checklist,
 * local rule alerts, citation warnings, and formatting notes.
 */

import { Paragraph, TextRun, AlignmentType } from 'docx';

export interface CitationVerificationSummary {
  totalCitations: number;
  verifiedCount: number;
  unverifiedCount: number;
  flaggedCount: number;
  pendingCount: number;
}

export interface InstructionsInput {
  orderNumber: string;
  motionType: string;
  jurisdiction: string;
  filingDeadline?: string;
  documentsInPackage: string[];
  localRuleFlags: string[];
  citationWarnings: string[];
  formatNotes: string[];
  citationVerification?: CitationVerificationSummary;
  // A-013: Protocol findings from D9 dispatcher (rendered via renderProtocolSection)
  protocolFindingsText?: string;
}

/**
 * Generate an attorney instructions document.
 * DG-021: AIS NEVER throws — partial data results in partial document, not a crash.
 */
export function generateAttorneyInstructions(input: InstructionsInput): Paragraph[] {
  try {
    return generateAttorneyInstructionsInner(input);
  } catch (err) {
    // DG-021: AIS must never throw. Return a minimal fallback document.
    console.error('[attorney-instructions] Error generating AIS, returning fallback:', err);
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: 'ATTORNEY INSTRUCTIONS — PRIVILEGED & CONFIDENTIAL',
            bold: true,
            size: 24,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Order #${input.orderNumber || 'UNKNOWN'} | ${input.motionType || 'UNKNOWN'} | ${input.jurisdiction || 'UNKNOWN'}`,
            size: 24,
          }),
        ],
        spacing: { after: 240 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'WARNING: Full attorney instructions could not be generated. Please review all documents in this filing package carefully before filing.',
            bold: true,
            color: 'FF0000',
            size: 24,
          }),
        ],
        spacing: { after: 240 },
      }),
    ];
  }
}

function generateAttorneyInstructionsInner(input: InstructionsInput): Paragraph[] {
  const fontFamily = 'Times New Roman';
  const fontSize = 24; // 12pt
  const smallSize = 20; // 10pt
  const paragraphs: Paragraph[] = [];
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Header - PRIVILEGED & CONFIDENTIAL
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'ATTORNEY INSTRUCTIONS \u2014 PRIVILEGED & CONFIDENTIAL',
          bold: true,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    })
  );

  // Order info line
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Order #${input.orderNumber} | ${input.motionType} | ${input.jurisdiction}`,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${dateStr}`,
          font: fontFamily,
          size: smallSize,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    })
  );

  // Filing deadline (if provided)
  if (input.filingDeadline) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'FILING DEADLINE: ',
            bold: true,
            font: fontFamily,
            size: fontSize,
          }),
          new TextRun({
            text: input.filingDeadline,
            bold: true,
            font: fontFamily,
            size: fontSize,
            color: 'FF0000',
          }),
        ],
        spacing: { after: 360 },
      })
    );
  }

  // Documents in package
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'DOCUMENTS IN THIS PACKAGE:',
          bold: true,
          underline: {},
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 120 },
    })
  );

  for (let i = 0; i < input.documentsInPackage.length; i++) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${i + 1}. ${input.documentsInPackage[i]}`,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 60 },
        indent: { left: 360 },
      })
    );
  }

  // Review checklist
  paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'BEFORE FILING \u2014 REVIEW CHECKLIST:',
          bold: true,
          underline: {},
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 120 },
    })
  );

  const checklist = [
    'Verify all case information (names, case number, court)',
    'Review and approve all citations',
    'Verify hearing date and department (if applicable)',
    'Sign all documents requiring attorney signature',
    'Confirm service list is complete and current',
    'Review for any confidential or privileged information',
  ];

  for (const item of checklist) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `\u2610 ${item}`,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 60 },
        indent: { left: 360 },
      })
    );
  }

  // Local rule alerts
  if (input.localRuleFlags.length > 0) {
    paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'LOCAL RULE ALERTS:',
            bold: true,
            underline: {},
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 120 },
      })
    );

    for (const flag of input.localRuleFlags) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `\u2022 ${flag}`,
              font: fontFamily,
              size: fontSize,
            }),
          ],
          spacing: { after: 60 },
          indent: { left: 360 },
        })
      );
    }
  }

  // Citation warnings
  if (input.citationWarnings.length > 0) {
    paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'CITATION REVIEW REQUIRED:',
            bold: true,
            underline: {},
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 120 },
      })
    );

    for (const warning of input.citationWarnings) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `\u2022 ${warning}`,
              font: fontFamily,
              size: fontSize,
            }),
          ],
          spacing: { after: 60 },
          indent: { left: 360 },
        })
      );
    }
  }

  // Format notes
  if (input.formatNotes.length > 0) {
    paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'FORMATTING NOTES:',
            bold: true,
            underline: {},
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 120 },
      })
    );

    for (const note of input.formatNotes) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `\u2022 ${note}`,
              font: fontFamily,
              size: fontSize,
            }),
          ],
          spacing: { after: 60 },
          indent: { left: 360 },
        })
      );
    }
  }

  // Citation Verification Summary (CS-P0-006 fix)
  if (input.citationVerification) {
    const cv = input.citationVerification;
    paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'CITATION VERIFICATION SUMMARY:',
            bold: true,
            underline: {},
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 120 },
      })
    );

    const verificationLines = [
      `Total citations: ${cv.totalCitations}`,
      `Verified (passed all CIV steps): ${cv.verifiedCount}`,
      `Unverified (CIV incomplete or failed): ${cv.unverifiedCount}`,
      `Flagged (requires attorney review): ${cv.flaggedCount}`,
    ];
    if (cv.pendingCount > 0) {
      verificationLines.push(`Pending verification: ${cv.pendingCount}`);
    }

    for (const line of verificationLines) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `\u2022 ${line}`,
              font: fontFamily,
              size: fontSize,
            }),
          ],
          spacing: { after: 60 },
          indent: { left: 360 },
        })
      );
    }

    if (cv.unverifiedCount > 0 || cv.flaggedCount > 0 || cv.pendingCount > 0) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '\u26A0 UNVERIFIED AND FLAGGED CITATIONS REQUIRE INDEPENDENT VERIFICATION BY THE FILING ATTORNEY BEFORE SUBMISSION TO THE COURT.',
              bold: true,
              font: fontFamily,
              size: fontSize,
              color: 'FF0000',
            }),
          ],
          spacing: { before: 120, after: 120 },
          indent: { left: 360 },
        })
      );
    }
  }

  // A-013: Protocol findings section (D9 dispatcher results → AIS)
  if (input.protocolFindingsText && input.protocolFindingsText.trim()) {
    paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'QUALITY PROTOCOL FINDINGS:',
            bold: true,
            underline: {},
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 120 },
      })
    );

    for (const line of input.protocolFindingsText.split('\n').filter(l => l.trim())) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              font: fontFamily,
              size: fontSize,
            }),
          ],
          spacing: { after: 60 },
          indent: { left: 360 },
        })
      );
    }
  }

  // ── Section 7: Privilege Preservation Notice (PRIV-02) ───────────────
  paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'SECTION 7: PRIVILEGE PRESERVATION NOTICE',
          bold: true,
          underline: {},
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Introductory paragraph with legal citations
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'This work product was prepared by Motion Granted, a Legal Process Outsourcing (LPO) service, under the direction and supervision of the hiring attorney. Under ABA Formal Opinion 08-451 and the Restatement (Third) of the Law Governing Lawyers, work product prepared by LPO providers acting under attorney direction generally maintains its protected status.',
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Recommended Actions header
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'RECOMMENDED ACTIONS:',
          bold: true,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { after: 120 },
    })
  );

  const recommendedActions = [
    {
      label: 'PRIVILEGE LOG',
      text: 'Include this engagement in your privilege log. Suggested entry format: "Motion drafting and legal research performed by Motion Granted (LPO vendor) under attorney direction and supervision, [date range]."',
    },
    {
      label: 'WORK PRODUCT DOCTRINE',
      text: 'This filing package constitutes attorney work product prepared in anticipation of litigation. It reflects mental impressions, conclusions, opinions, and legal theories of counsel and the supervised LPO service.',
    },
    {
      label: 'CONFIDENTIALITY',
      text: 'All case materials submitted to Motion Granted are encrypted, access-controlled, and permanently deleted after 365 days per our data retention policy.',
    },
    {
      label: 'DISCLOSURE CONSIDERATIONS',
      text: 'If your jurisdiction requires disclosure of AI-assisted drafting (see Section 6 above), such disclosure does not waive privilege over the underlying work product or attorney-client communications. See In re Denture Cream Prod. Liab. Litig., No. 09-2051 (D.N.J.) (vendor communications protected under common interest doctrine).',
    },
  ];

  for (let i = 0; i < recommendedActions.length; i++) {
    const action = recommendedActions[i];
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${i + 1}. ${action.label}: `,
            bold: true,
            font: fontFamily,
            size: fontSize,
          }),
          new TextRun({
            text: action.text,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 100 },
        indent: { left: 360 },
      })
    );
  }

  // Contact footer for privilege questions
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'For questions about privilege preservation, contact security@motion-granted.com.',
          italics: true,
          font: fontFamily,
          size: fontSize,
        }),
      ],
      spacing: { before: 200, after: 120 },
    })
  );

  // Disclaimer
  paragraphs.push(new Paragraph({ spacing: { after: 360 } }));
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'This document was prepared by Motion Granted under the direction and supervision of the hiring attorney. Motion Granted is not a law firm and does not provide legal advice.',
          italics: true,
          font: fontFamily,
          size: smallSize,
        }),
      ],
      spacing: { after: 0 },
    })
  );

  return paragraphs;
}
