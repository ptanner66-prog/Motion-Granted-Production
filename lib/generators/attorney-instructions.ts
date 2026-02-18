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
}

/**
 * Generate an attorney instructions document.
 */
export function generateAttorneyInstructions(input: InstructionsInput): Paragraph[] {
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
